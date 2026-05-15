import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SearchRequestSchema } from '../../lib/validation.js';
import { searchCandidates, getShortlistsForRequirement } from '../../lib/dynamodb.js';
import { normalizeSkill, normalizeSkills, coreSkillSatisfiedBy } from '../../lib/skillNormalizer.js';
import { calculateMatchScore, MIN_MUST_HAVE_MATCH_RATIO, FUZZY_MATCH_WEIGHT, MUST_HAVE_SECONDARY_WEIGHT, parseSearchLocations, isEngagementModelCompatible } from '../../lib/matchScoring.js';
import { withOptionalAuth, type OptionalAuthEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import type { CandidateSearchResult, SearchResponse, SearchCriteria } from '../../types/index.js';

const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface SearchCacheEntry {
  scoredCandidates: CandidateSearchResult[];
  fetchedAt: number;
}

const searchCache = new Map<string, SearchCacheEntry>();

export function _clearSearchCache(): void {
  searchCache.clear();
}

type CriteriaInput = {
  coreSkill?: string;
  mustHaveSkills?: string[];
  goodToHaveSkills?: string[];
  minExperience?: number;
  maxExperience?: number;
  seniority?: string[];
  availability?: string[];
  location?: string;
  remote?: boolean;
  industries?: string[];
  roles?: string[];
  maxBudgetLpa?: number;
  engagementModel?: string;
  skillSynonyms?: Record<string, string[]>;
};

function buildCacheKey(
  requirementId: string | undefined,
  criteria: CriteriaInput,
  sortBy: string | undefined
): string {
  const effectiveSortBy = sortBy ?? 'matchScore';
  const normalizedCriteria = {
    coreSkill: criteria.coreSkill ?? null,
    mustHaveSkills: [...(criteria.mustHaveSkills ?? [])].sort(),
    goodToHaveSkills: [...(criteria.goodToHaveSkills ?? [])].sort(),
    minExperience: criteria.minExperience ?? null,
    maxExperience: criteria.maxExperience ?? null,
    seniority: [...(criteria.seniority ?? [])].sort(),
    availability: [...(criteria.availability ?? [])].sort(),
    location: criteria.location ?? null,
    remote: criteria.remote ?? null,
    industries: [...(criteria.industries ?? [])].sort(),
    roles: [...(criteria.roles ?? [])].sort(),
    maxBudgetLpa: criteria.maxBudgetLpa ?? null,
    engagementModel: criteria.engagementModel ?? null,
    skillSynonyms: criteria.skillSynonyms
      ? Object.fromEntries(
          Object.entries(criteria.skillSynonyms)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, [...v].sort()])
        )
      : null,
  };
  return JSON.stringify({ requirementId: requirementId ?? null, criteria: normalizedCriteria, sortBy: effectiveSortBy });
}

/** Normalize a synonym map: lowercase keys and values. Returns undefined if input is null/undefined. */
function normalizeSynonymMap(
  synonyms: Record<string, string[]> | null | undefined
): Record<string, string[]> | undefined {
  if (!synonyms) return undefined;
  const result: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(synonyms)) {
    result[normalizeSkill(key)] = normalizeSkills(values);
  }
  return result;
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

    const { criteria, pagination, sortBy, requirementId } = validation.data;

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

    // Check cache — key excludes page offset so all pages share one cached corpus
    const cacheKey = buildCacheKey(requirementId, criteria, sortBy);
    const cached = searchCache.get(cacheKey);
    let allScoredCandidates: CandidateSearchResult[];

    if (cached && Date.now() - cached.fetchedAt < SEARCH_CACHE_TTL) {
      allScoredCandidates = cached.scoredCandidates;
    } else {
      // Normalize search skills
      const normalizedMustHave = normalizeSkills(criteria.mustHaveSkills || []);
      const normalizedGoodToHave = normalizeSkills(criteria.goodToHaveSkills || []);

      // Parse location into individual locations for OR matching
      const searchLocations = parseSearchLocations(criteria.location);

      // Build search criteria with defaults
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

      // Full corpus scan (always from the beginning) and fetch shortlists in parallel
      const [searchResult, shortlists] = await Promise.all([
        searchCandidates(searchCriteria),
        requirementId ? getShortlistsForRequirement(requirementId) : Promise.resolve([]),
      ]);
      const shortlistedCandidateIds = new Set(
        shortlists.filter((s) => s.status !== 'not_suitable').map((s) => s.candidate_id)
      );
      const notSuitableCandidateIds = new Set(
        shortlists.filter((s) => s.status === 'not_suitable').map((s) => s.candidate_id)
      );

      // Pre-filter: if coreSkill is specified, only score candidates who have it as a primary skill.
      // Secondary skills are too noisy (tangential mentions) — coreSkill must be a core competency.
      const candidatesToScore = criteria.coreSkill
        ? searchResult.items.filter((c) => coreSkillSatisfiedBy(criteria.coreSkill, c.primary_skills))
        : searchResult.items;

      // Normalize synonym map from search criteria (may be null for older requirements)
      const reqSynonyms = normalizeSynonymMap(criteria.skillSynonyms);

      // Calculate match scores and filter
      allScoredCandidates = candidatesToScore
        .map((candidate) => {
          const candSynonyms = normalizeSynonymMap(candidate.skill_synonyms);

          const { score, details } = calculateMatchScore(
            candidate,
            normalizedMustHave,
            normalizedGoodToHave,
            criteria.minExperience,
            criteria.maxExperience,
            criteria.seniority,
            criteria.maxBudgetLpa,
            searchLocations,
            criteria.availability,
            reqSynonyms,
            candSynonyms,
            criteria.roles
          );

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
            notInterested: candidate.not_interested || false,
            notInterestedAt: candidate.not_interested_at,
            roles: candidate.roles || [],
            headline: candidate.headline,
            isShortlisted: shortlistedCandidateIds.has(candidate.candidate_id),
            isNotSuitable: notSuitableCandidateIds.has(candidate.candidate_id),
            subVendorId: candidate.sub_vendor_id,
            subVendorName: candidate.sub_vendor_name,
            subVendorContactPerson: candidate.sub_vendor_contact_person,
            subVendorContactPhone: candidate.sub_vendor_contact_phone,
            subVendorContactEmail: candidate.sub_vendor_contact_email,
          };
        })
        // Filter out candidates below minimum must-have effective match ratio
        .filter((c) => {
          if (normalizedMustHave.length > 0) {
            const effectiveRatio = (
              c.matchDetails.mustHaveMatched.length
              + (c.matchDetails.mustHaveFuzzy?.length || 0) * FUZZY_MATCH_WEIGHT
              + (c.matchDetails.mustHaveSecondary?.length || 0) * MUST_HAVE_SECONDARY_WEIGHT
            ) / normalizedMustHave.length;
            if (effectiveRatio < MIN_MUST_HAVE_MATCH_RATIO) {
              return false;
            }
          }
          // CTC is a soft indicator (not a hard filter) — candidates over budget
          // still appear in results with an "over budget" tag, like experience/seniority.
          // Hard filter: engagement model must be compatible
          if (criteria.engagementModel && criteria.engagementModel !== 'either') {
            const candidateModel = c.engagementModel || 'either';
            if (!isEngagementModelCompatible(criteria.engagementModel, candidateModel)) {
              return false;
            }
          }
          return true;
        });

      // Sort by selected criteria with tiebreakers (all descending)
      allScoredCandidates.sort((a, b) => {
        const dateDiff = new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
        const scoreDiff = b.matchScore - a.matchScore;
        const expDiff = b.totalExperience - a.totalExperience;

        switch (sortBy) {
          case 'matchScore':
            return scoreDiff || dateDiff || expDiff;
          case 'lastUpdated':
            return dateDiff || scoreDiff || expDiff;
          case 'experience':
            return expDiff || scoreDiff || dateDiff;
          default:
            return scoreDiff || dateDiff || expDiff;
        }
      });

      // Store full globally-sorted list in cache
      searchCache.set(cacheKey, {
        scoredCandidates: allScoredCandidates,
        fetchedAt: Date.now(),
      });
    }

    // Serve page as an offset-based slice of the globally sorted list
    const pageCandidates = allScoredCandidates.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < allScoredCandidates.length;
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
      totalMatches: allScoredCandidates.length,
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
