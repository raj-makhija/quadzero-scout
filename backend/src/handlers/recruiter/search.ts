import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SearchRequestSchema } from '../../lib/validation.js';
import { searchCandidates } from '../../lib/dynamodb.js';
import { normalizeSkills } from '../../lib/skillNormalizer.js';
import { calculateMatchScore, MIN_MUST_HAVE_MATCH_RATIO, parseSearchLocations } from '../../lib/matchScoring.js';
import { withOptionalAuth, type OptionalAuthEvent } from '../../lib/auth.js';
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

    const { criteria, pagination, sortBy } = validation.data;
    const limit = pagination?.limit || 20;

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
    };

    // Search candidates
    const searchResult = await searchCandidates(searchCriteria, limit * 2, lastEvaluatedKey);

    // Calculate match scores and filter
    const scoredCandidates: CandidateSearchResult[] = searchResult.items
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
          matchScore: score,
          matchDetails: details,
          lastUpdated: candidate.last_updated,
        };
      })
      // Filter out candidates below minimum must-have match ratio
      .filter((c) => {
        if (normalizedMustHave.length > 0) {
          const exactRatio = c.matchDetails.mustHaveMatched.length / normalizedMustHave.length;
          if (exactRatio < MIN_MUST_HAVE_MATCH_RATIO) {
            return false;
          }
        }
        if (criteria.maxBudgetLpa != null && !c.matchDetails.ctcMatch) {
          return false;
        }
        return true;
      });

    // Sort by selected criteria
    switch (sortBy) {
      case 'matchScore':
        scoredCandidates.sort((a, b) => b.matchScore - a.matchScore);
        break;
      case 'experience':
        scoredCandidates.sort((a, b) => b.totalExperience - a.totalExperience);
        break;
      case 'lastUpdated':
        scoredCandidates.sort((a, b) =>
          new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
        );
        break;
    }

    // Apply pagination limit
    const paginatedCandidates = scoredCandidates.slice(0, limit);

    // Encode next page key
    let encodedLastKey: string | undefined;
    if (searchResult.lastKey) {
      encodedLastKey = Buffer.from(JSON.stringify(searchResult.lastKey)).toString('base64');
    }

    // Check if user is authenticated - if not, redact sensitive data
    const isAuthenticated = !!event.auth;

    const responseCandidates = isAuthenticated
      ? paginatedCandidates
      : paginatedCandidates.map((candidate, index) => ({
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
        }));

    const response: SearchResponse = {
      candidates: responseCandidates,
      pagination: {
        count: paginatedCandidates.length,
        hasMore: !!searchResult.lastKey || scoredCandidates.length > limit,
        lastEvaluatedKey: encodedLastKey,
      },
      totalMatches: scoredCandidates.length,
    };

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
