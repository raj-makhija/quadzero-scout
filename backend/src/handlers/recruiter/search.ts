import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SearchRequestSchema } from '../../lib/validation.js';
import { searchCandidates, getShortlistsForRequirement } from '../../lib/dynamodb.js';
import { normalizeSkill, normalizeSkills } from '../../lib/skillNormalizer.js';
import { calculateMatchScore, MIN_MUST_HAVE_MATCH_RATIO, parseSearchLocations } from '../../lib/matchScoring.js';
import { withOptionalAuth, type OptionalAuthEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import type { CandidateSearchResult, SearchResponse, SearchCriteria } from '../../types/index.js';

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

    // Decode last evaluated key if provided
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    if (pagination?.lastEvaluatedKey) {
      try {
        lastEvaluatedKey = JSON.parse(
          Buffer.from(pagination.lastEvaluatedKey, 'base64').toString()
        );
      } catch {
        return error(ErrorCodes.VALIDATION_ERROR, 'Invalid pagination key', 400);
      }
    }

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

    // Search candidates and fetch shortlists in parallel
    const [searchResult, shortlists] = await Promise.all([
      searchCandidates(searchCriteria, undefined, lastEvaluatedKey),
      requirementId ? getShortlistsForRequirement(requirementId) : Promise.resolve([]),
    ]);
    const shortlistedCandidateIds = new Set(shortlists.map((s) => s.candidate_id));

    // Pre-filter: if coreSkill is specified, only score candidates who have it
    const normalizedCoreSkill = criteria.coreSkill ? normalizeSkill(criteria.coreSkill) : null;
    const candidatesToScore = normalizedCoreSkill
      ? searchResult.items.filter((c) => {
          const allSkills = new Set(normalizeSkills([...c.primary_skills, ...c.secondary_skills]));
          return allSkills.has(normalizedCoreSkill);
        })
      : searchResult.items;

    // Calculate match scores and filter
    const scoredCandidates: CandidateSearchResult[] = candidatesToScore
      .map((candidate) => {
        const { score, details } = calculateMatchScore(
          candidate,
          normalizedMustHave,
          normalizedGoodToHave,
          criteria.minExperience,
          criteria.maxExperience,
          criteria.seniority,
          criteria.maxBudgetLpa,
          searchLocations,
          criteria.availability
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
        };
      })
      // Filter out candidates below minimum must-have exact match ratio
      .filter((c) => {
        if (normalizedMustHave.length > 0) {
          const exactRatio = c.matchDetails.mustHaveMatched.length / normalizedMustHave.length;
          if (exactRatio < MIN_MUST_HAVE_MATCH_RATIO) {
            return false;
          }
        }
        // CTC is a soft indicator (not a hard filter) — candidates over budget
        // still appear in results with an "over budget" tag, like experience/seniority.
        // Hard filter: engagement model must be compatible
        if (criteria.engagementModel && criteria.engagementModel !== 'either') {
          const candidateModel = c.engagementModel || 'either';
          if (candidateModel !== criteria.engagementModel && candidateModel !== 'either') {
            return false;
          }
        }
        return true;
      });

    // Sort by selected criteria with tiebreakers (all descending)
    scoredCandidates.sort((a, b) => {
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

    // Encode next page key (only when DynamoDB has more unscanned records)
    let encodedLastKey: string | undefined;
    if (searchResult.lastKey) {
      encodedLastKey = Buffer.from(JSON.stringify(searchResult.lastKey)).toString('base64');
    }

    // Check if user is authenticated - if not, redact sensitive data
    const isAuthenticated = !!event.auth;

    const responseCandidates = isAuthenticated
      ? scoredCandidates
      : scoredCandidates.map((candidate, index) => ({
          // Redact PII and sensitive details for unauthenticated users
          candidateId: candidate.candidateId,
          fullName: `Candidate #${index + 1}`, // Hide real name
          location: undefined, // Hide location
          primarySkills: [], // Hide skills
          totalExperience: candidate.totalExperience,
          seniority: candidate.seniority,
          availability: candidate.availability,
          engagementModel: candidate.engagementModel,
          currentCtc: undefined, // Hide CTC
          expectedCtc: undefined, // Hide CTC
          matchScore: candidate.matchScore,
          matchDetails: {
            // Hide specific skill matches
            mustHaveMatched: [],
            mustHaveRelated: [],
            mustHaveMissing: [],
            goodToHaveMatched: [],
            goodToHaveRelated: [],
            experienceMatch: candidate.matchDetails.experienceMatch,
            seniorityMatch: candidate.matchDetails.seniorityMatch,
            ctcMatch: candidate.matchDetails.ctcMatch,
            locationMatch: candidate.matchDetails.locationMatch,
            availabilityMatch: candidate.matchDetails.availabilityMatch,
          },
          lastUpdated: candidate.lastUpdated,
          lastScreenedAt: undefined, // Hide screening info
          notInterested: undefined,
          notInterestedAt: undefined,
        }));

    const response: SearchResponse = {
      candidates: responseCandidates,
      pagination: {
        count: scoredCandidates.length,
        hasMore: !!searchResult.lastKey,
        lastEvaluatedKey: encodedLastKey,
      },
      totalMatches: scoredCandidates.length,
    };

    if (event.auth) {
      logAuditEvent(event.auth, event, {
        action: 'CANDIDATE_SEARCH',
        entityType: 'search',
        entityId: 'search',
        metadata: {
          resultCount: scoredCandidates.length,
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
