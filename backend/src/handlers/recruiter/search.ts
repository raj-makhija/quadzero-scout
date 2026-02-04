import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SearchRequestSchema } from '../../lib/validation.js';
import { searchCandidates } from '../../lib/dynamodb.js';
import { normalizeSkills, calculateSkillMatch } from '../../lib/skillNormalizer.js';
import { isCandidateWithinBudget } from '../../lib/ctcConversion.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import type { CandidateItem, CandidateSearchResult, SearchResponse, SearchCriteria } from '../../types/index.js';

function calculateMatchScore(
  candidate: CandidateItem,
  mustHaveSkills: string[],
  goodToHaveSkills: string[],
  minExp?: number,
  maxExp?: number,
  seniority?: string[],
  maxBudgetLpa?: number
): { score: number; details: CandidateSearchResult['matchDetails'] } {
  let score = 0;

  // Get candidate skills
  const candidateSkills = [
    ...candidate.primary_skills,
    ...candidate.secondary_skills,
  ];

  // Must-have skills match (50% of score)
  const mustHaveMatch = calculateSkillMatch(candidateSkills, mustHaveSkills);
  const mustHaveRatio = mustHaveSkills.length > 0
    ? mustHaveMatch.matched.length / mustHaveSkills.length
    : 1;
  score += mustHaveRatio * 50;

  // Good-to-have skills match (20% of score)
  const goodToHaveMatch = calculateSkillMatch(candidateSkills, goodToHaveSkills);
  const goodToHaveRatio = goodToHaveSkills.length > 0
    ? goodToHaveMatch.matched.length / goodToHaveSkills.length
    : 1;
  score += goodToHaveRatio * 20;

  // Experience match (15% of score)
  const experience = candidate.total_experience;
  let experienceMatch = true;
  if (minExp !== undefined && experience < minExp) {
    experienceMatch = false;
  }
  if (maxExp !== undefined && experience > maxExp) {
    experienceMatch = false;
  }
  if (experienceMatch) {
    score += 15;
  }

  // Seniority match (15% of score)
  let seniorityMatch = true;
  if (seniority && seniority.length > 0) {
    seniorityMatch = seniority.includes(candidate.seniority);
  }
  if (seniorityMatch) {
    score += 15;
  }

  // CTC budget check
  const ctcMatch = isCandidateWithinBudget(candidate.expected_ctc, maxBudgetLpa);

  return {
    score: Math.round(score),
    details: {
      mustHaveMatched: mustHaveMatch.matched,
      mustHaveMissing: mustHaveMatch.missing,
      goodToHaveMatched: goodToHaveMatch.matched,
      experienceMatch,
      seniorityMatch,
      ctcMatch,
    },
  };
}

async function handleRequest(
  event: AuthenticatedEvent
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
          criteria.maxBudgetLpa
        );

        return {
          candidateId: candidate.candidate_id,
          fullName: candidate.full_name,
          location: candidate.location,
          primarySkills: candidate.primary_skills,
          totalExperience: candidate.total_experience,
          seniority: candidate.seniority,
          availability: candidate.availability,
          currentCtc: candidate.current_ctc,
          expectedCtc: candidate.expected_ctc,
          matchScore: score,
          matchDetails: details,
          lastUpdated: candidate.last_updated,
        };
      })
      // Filter out candidates with 0% match on must-have skills
      .filter((c) => {
        if (normalizedMustHave.length > 0 && c.matchDetails.mustHaveMatched.length === 0) {
          return false;
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

    const response: SearchResponse = {
      candidates: paginatedCandidates,
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

export const handler = withAuth(['recruiter'], handleRequest);
