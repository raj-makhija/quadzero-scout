import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SearchRequestSchema } from '../../lib/validation.js';
import {
  searchCandidates,
  getShortlistsForRequirement,
  getPlacedCandidateIds,
  getMatchCache,
  getCandidatesByIds,
} from '../../lib/dynamodb.js';
import { matchAndRankCandidates, type MatchCriteria } from '../../lib/candidateMatching.js';
import { applyLlmRerankOverlay, RERANK_TOP_N } from '../../lib/llmRerank.js';
import type { MatchDetails } from '../../lib/matchScoring.js';
import { withOptionalAuth, type OptionalAuthEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import type { CandidateItem, CandidateSearchResult, SearchResponse, SearchCriteria } from '../../types/index.js';

// Details placeholder for the rare case where a cached candidate no longer
// scores against the live criteria (e.g. its skills changed since cache build).
// The candidate is still returned (the cache ranked it) but with empty details.
const EMPTY_MATCH_DETAILS: MatchDetails = {
  mustHaveMatched: [],
  mustHaveFuzzy: [],
  mustHaveSecondary: [],
  mustHaveRelated: [],
  mustHaveMissing: [],
  goodToHaveMatched: [],
  goodToHaveFuzzy: [],
  goodToHaveRelated: [],
  experienceMatch: 'none',
  seniorityMatch: false,
  ctcMatch: false,
  locationMatch: 'none',
  availabilityMatch: 'none',
  roleMatch: 'none',
};

function toSearchResult(
  candidate: CandidateItem,
  score: number,
  details: MatchDetails
): CandidateSearchResult {
  return {
    candidateId: candidate.candidate_id,
    fullName: candidate.full_name,
    location: candidate.location,
    primarySkills: candidate.primary_skills,
    totalExperience: candidate.total_experience,
    seniority: candidate.seniority,
    availability: candidate.availability,
    engagementModel: candidate.engagement_model || 'either',
    currentCtc: candidate.current_ctc,
    expectedCtc: candidate.expected_ctc,
    expectedCtcType: candidate.expected_ctc_type,
    matchScore: score,
    matchDetails: details,
    lastUpdated: candidate.last_updated,
    lastScreenedAt: candidate.last_screened_at,
    lastScreenedBy: candidate.last_screened_by_name || candidate.last_screened_by,
    linkedinUrl: candidate.linkedin_url,
    githubUrl: candidate.github_url,
    hackerrankUrl: candidate.hackerrank_url,
    hackerrankScore: candidate.hackerrank_score,
    notInterested: candidate.not_interested || false,
    notInterestedAt: candidate.not_interested_at,
    roles: candidate.roles || [],
    headline: candidate.headline,
    isShortlisted: false,
    isNotSuitable: false,
    subVendorId: candidate.sub_vendor_id,
    subVendorName: candidate.sub_vendor_name,
    subVendorContactPerson: candidate.sub_vendor_contact_person,
    subVendorContactPhone: candidate.sub_vendor_contact_phone,
    subVendorContactEmail: candidate.sub_vendor_contact_email,
    coverLetter: candidate.cover_letter,
  };
}

async function handleRequest(
  event: OptionalAuthEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    // Parse request body
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    // Validate request
    const validation = validate(SearchRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { criteria, pagination, sortBy, requirementId, includeNotSuitable } = validation.data;

    // Decode offset-based pagination token
    let offset = 0;
    const pageSize = pagination?.limit ?? 20;
    if (pagination?.lastEvaluatedKey) {
      try {
        const decoded = JSON.parse(
          Buffer.from(pagination.lastEvaluatedKey, 'base64').toString()
        );
        if (typeof decoded.offset !== 'number' || decoded.offset < 0) {
          return error(ErrorCodes.VALIDATION_ERROR, 'Invalid pagination key', 400);
        }
        offset = decoded.offset;
      } catch {
        return error(ErrorCodes.VALIDATION_ERROR, 'Invalid pagination key', 400);
      }
    }

    const matchCriteria: MatchCriteria = {
      coreSkill: criteria.coreSkill,
      mustHaveSkills: criteria.mustHaveSkills,
      goodToHaveSkills: criteria.goodToHaveSkills,
      minExperience: criteria.minExperience,
      maxExperience: criteria.maxExperience,
      seniority: criteria.seniority,
      availability: criteria.availability,
      location: criteria.location,
      roles: criteria.roles,
      maxBudgetLpa: criteria.maxBudgetLpa,
      engagementModel: criteria.engagementModel,
      skillSynonyms: criteria.skillSynonyms,
    };

    // Placed candidates (pipeline_stage 'joined') are excluded on every request,
    // regardless of path — always fetched fresh, never cached.
    const placedCandidateIds = await getPlacedCandidateIds();

    // Shortlist / not-suitable overlay (requirement-bound only) — always fresh.
    let shortlistedIds = new Set<string>();
    let notSuitableIds = new Set<string>();
    if (requirementId) {
      const shortlists = await getShortlistsForRequirement(requirementId);
      shortlistedIds = new Set(
        shortlists.filter((s) => s.status !== 'not_suitable').map((s) => s.candidate_id)
      );
      notSuitableIds = new Set(
        shortlists.filter((s) => s.status === 'not_suitable').map((s) => s.candidate_id)
      );
    }

    // Requirement-bound searches read the pre-ranked id-list from the match cache.
    // getMatchCache distinguishes three states (#510):
    //   null      → cache item absent → build not started yet → pending/building.
    //   []        → cache item present but empty → completed zero-match build.
    //   non-empty → completed build with matches → warm read.
    const cached = requirementId ? await getMatchCache(requirementId) : null;

    let pageCandidates: CandidateSearchResult[];
    let totalMatches: number;
    let llmRerank: { ranked: boolean; pending: boolean } | undefined;

    if (requirementId && cached !== null) {
      // ── Cache read path ───────────────────────────────────────────────────
      // The cache stores the matchScore ranking (rank asc == score desc).
      const ranked = [...cached].sort((a, b) => a.rank - b.rank);

      // Apply live overlays to the id-list BEFORE fetching candidate details so
      // pagination and totalMatches stay correct without fetching the full corpus.
      const filtered = ranked.filter(
        (e) =>
          !placedCandidateIds.has(e.candidate_id) &&
          !(includeNotSuitable === false && notSuitableIds.has(e.candidate_id))
      );
      totalMatches = filtered.length;

      // Paginate the ranked id-list, then BatchGet only the requested page.
      const pageEntries = filtered.slice(offset, offset + pageSize);
      const pageItems = await getCandidatesByIds(pageEntries.map((e) => e.candidate_id));
      const itemsById = new Map(pageItems.map((c) => [c.candidate_id, c]));

      // Re-score the page (≤ pageSize candidates) to regenerate matchDetails;
      // the score used for ordering/display still comes from the cache.
      const scored = matchAndRankCandidates(pageItems, matchCriteria, {});
      const detailsById = new Map(scored.map((s) => [s.candidate.candidate_id, s.details]));

      pageCandidates = pageEntries
        .map((e) => {
          const item = itemsById.get(e.candidate_id);
          if (!item) return null; // candidate row deleted since cache build
          const result = toSearchResult(
            item,
            e.score,
            detailsById.get(e.candidate_id) ?? EMPTY_MATCH_DETAILS
          );
          result.isShortlisted = shortlistedIds.has(e.candidate_id);
          result.isNotSuitable = notSuitableIds.has(e.candidate_id);
          return result;
        })
        .filter((c): c is CandidateSearchResult => c !== null);

      // The cache is matchScore-ranked; other sort modes re-sort the resolved page.
      if (sortBy === 'lastUpdated') {
        pageCandidates.sort(
          (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
        );
      } else if (sortBy === 'experience') {
        pageCandidates.sort((a, b) => b.totalExperience - a.totalExperience);
      } else {
        // matchScore order (default): overlay the lazy LLM tie-break (#239) on
        // the displayed page. Non-fatal — any error serves deterministic order.
        try {
          const topNIds = filtered.slice(0, RERANK_TOP_N).map((e) => e.candidate_id);
          const overlay = await applyLlmRerankOverlay(requirementId, topNIds, pageCandidates);
          pageCandidates = overlay.page;
          llmRerank = { ranked: overlay.ranked, pending: overlay.pending };
        } catch (err) {
          console.error('LLM rerank overlay failed, serving deterministic order:', err);
        }
      }
    } else if (requirementId) {
      // ── Cold cache (cached === null) — build pending (#510) ───────────────
      // The requirement's match cache item is absent, so the build hasn't run
      // yet. A full live scan here times out the 30s HTTP integration on large
      // candidate pools, so instead dispatch the per-requirement cache worker
      // off the request path and return a lightweight pending response; the
      // client polls until the cache lands. (A present-but-empty cache, [], is
      // a completed zero-match build and reads through the path above as 0
      // matches — no rebuild, no pending flag.) Dispatch is non-fatal: a failed
      // invoke still returns the pending response rather than erroring.
      try {
        await invokeLambdaAsync(config.lambda.matchCacheRequirementWorkerName, { requirementId });
      } catch (dispatchErr) {
        console.error(`[matchCache] Failed to dispatch cache worker for requirement ${requirementId}:`, dispatchErr);
      }
      return success({
        candidates: [],
        pagination: { count: 0, hasMore: false },
        totalMatches: 0,
        cacheBuilding: true,
      });
    } else {
      // ── Live-scan path ────────────────────────────────────────────────────
      // Ad-hoc search (no requirementId). Runs the full scan + shared scorer,
      // then resolves the page from the in-memory result.
      const searchCriteria: SearchCriteria = {
        mustHaveSkills: criteria.mustHaveSkills || [],
        goodToHaveSkills: criteria.goodToHaveSkills || [],
        minExperience: criteria.minExperience,
        maxExperience: criteria.maxExperience,
        seniority: criteria.seniority,
        availability: criteria.availability,
        location: criteria.location,
        remote: criteria.remote,
        industries: criteria.industries,
        maxBudgetLpa: criteria.maxBudgetLpa,
        engagementModel: criteria.engagementModel,
      };

      const searchResult = await searchCandidates(searchCriteria);
      const scored = matchAndRankCandidates(searchResult.items, matchCriteria, { sortBy });

      let allScoredCandidates = scored.map(({ candidate, score, details }) => {
        const result = toSearchResult(candidate, score, details);
        result.isShortlisted = shortlistedIds.has(candidate.candidate_id);
        result.isNotSuitable = notSuitableIds.has(candidate.candidate_id);
        return result;
      });

      allScoredCandidates = allScoredCandidates.filter(
        (c) => !placedCandidateIds.has(c.candidateId)
      );

      const visibleCandidates =
        includeNotSuitable === false
          ? allScoredCandidates.filter((c) => !c.isNotSuitable)
          : allScoredCandidates;

      totalMatches = visibleCandidates.length;
      pageCandidates = visibleCandidates.slice(offset, offset + pageSize);
    }

    const hasMore = offset + pageSize < totalMatches;
    const encodedNextKey = hasMore
      ? Buffer.from(JSON.stringify({ offset: offset + pageSize })).toString('base64')
      : undefined;

    // Check if user is authenticated - if not, redact sensitive data
    const isAuthenticated = !!event.auth;

    const responseCandidates = isAuthenticated
      ? pageCandidates
      : pageCandidates.map((candidate, index) => ({
          candidateId: candidate.candidateId,
          fullName: `Candidate #${offset + index + 1}`,
          location: undefined,
          primarySkills: [],
          totalExperience: candidate.totalExperience,
          seniority: candidate.seniority,
          availability: candidate.availability,
          engagementModel: candidate.engagementModel,
          currentCtc: undefined,
          expectedCtc: undefined,
          matchScore: candidate.matchScore,
          matchDetails: {
            mustHaveMatched: [],
            mustHaveFuzzy: [],
            mustHaveSecondary: [],
            mustHaveRelated: [],
            mustHaveMissing: [],
            goodToHaveMatched: [],
            goodToHaveFuzzy: [],
            goodToHaveRelated: [],
            experienceMatch: candidate.matchDetails.experienceMatch,
            seniorityMatch: candidate.matchDetails.seniorityMatch,
            ctcMatch: candidate.matchDetails.ctcMatch,
            locationMatch: candidate.matchDetails.locationMatch,
            availabilityMatch: candidate.matchDetails.availabilityMatch,
            roleMatch: candidate.matchDetails.roleMatch,
          },
          lastUpdated: candidate.lastUpdated,
          lastScreenedAt: undefined,
          notInterested: undefined,
          notInterestedAt: undefined,
        }));

    const response: SearchResponse = {
      candidates: responseCandidates,
      pagination: {
        count: pageCandidates.length,
        hasMore,
        lastEvaluatedKey: encodedNextKey,
      },
      totalMatches,
      ...(llmRerank ? { llmRerank } : {}),
    };

    if (event.auth) {
      logAuditEvent(event.auth, event, {
        action: 'CANDIDATE_SEARCH',
        entityType: 'search',
        entityId: 'search',
        metadata: {
          resultCount: pageCandidates.length,
          mustHaveSkills: criteria.mustHaveSkills || [],
          goodToHaveSkills: criteria.goodToHaveSkills || [],
          minExperience: criteria.minExperience,
          maxExperience: criteria.maxExperience,
          seniority: criteria.seniority,
          location: criteria.location,
        },
      });
    }

    return success(response);
  } catch (err) {
    console.error('Error searching candidates:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to search candidates',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withOptionalAuth(handleRequest);
