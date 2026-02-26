import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, MatchRequirementsRequestSchema } from '../../lib/validation.js';
import { getCandidateById, getAllActiveRequirements, getShortlistsForCandidate } from '../../lib/dynamodb.js';
import { normalizeSkills } from '../../lib/skillNormalizer.js';
import { calculateMatchScore, MIN_MUST_HAVE_MATCH_RATIO } from '../../lib/matchScoring.js';
import { isCandidateWithinBudget } from '../../lib/ctcConversion.js';
import type { MatchedRequirement, MatchRequirementsResponse } from '../../types/index.js';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const validation = validate(MatchRequirementsRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { candidateId } = validation.data;

    // Fetch candidate
    const candidate = await getCandidateById(candidateId);
    if (!candidate) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }

    // Fetch all active requirements and existing shortlists in parallel
    const [requirements, shortlists] = await Promise.all([
      getAllActiveRequirements(),
      getShortlistsForCandidate(candidateId),
    ]);

    const shortlistedRequirementIds = new Set(shortlists.map((s) => s.requirement_id));

    // Score candidate against each requirement
    const matches: MatchedRequirement[] = [];

    for (const req of requirements) {
      const criteria = req.parsed_criteria;

      const normalizedMustHave = normalizeSkills(criteria.mustHaveSkills || []);
      const normalizedGoodToHave = normalizeSkills(criteria.goodToHaveSkills || []);

      const { score, details } = calculateMatchScore(
        candidate,
        normalizedMustHave,
        normalizedGoodToHave,
        criteria.minExperience ?? undefined,
        criteria.maxExperience ?? undefined,
        criteria.seniority?.length ? criteria.seniority : undefined,
        req.budget_max_lpa ?? undefined
      );

      // Filter out requirements below minimum must-have match ratio
      if (normalizedMustHave.length > 0) {
        const exactRatio = details.mustHaveMatched.length / normalizedMustHave.length;
        if (exactRatio < MIN_MUST_HAVE_MATCH_RATIO) {
          continue;
        }
      }

      const budgetFit = isCandidateWithinBudget(candidate.expected_ctc, req.budget_max_lpa);

      matches.push({
        requirementId: req.requirement_id,
        clientName: req.client_name,
        endClient: req.end_client,
        jobTitle: req.job_title,
        engagementModel: req.engagement_model,
        payroll: req.payroll,
        budgetMinLpa: req.budget_min_lpa,
        budgetMaxLpa: req.budget_max_lpa,
        mustHaveSkills: criteria.mustHaveSkills || [],
        goodToHaveSkills: criteria.goodToHaveSkills || [],
        matchScore: score,
        matchDetails: {
          mustHaveMatched: details.mustHaveMatched,
          mustHaveRelated: details.mustHaveRelated,
          mustHaveMissing: details.mustHaveMissing,
          goodToHaveMatched: details.goodToHaveMatched,
          goodToHaveRelated: details.goodToHaveRelated,
          experienceMatch: details.experienceMatch,
          seniorityMatch: details.seniorityMatch,
          budgetFit,
          locationMatch: details.locationMatch,
        },
        isShortlisted: shortlistedRequirementIds.has(req.requirement_id),
        createdAt: req.created_at,
      });
    }

    // Sort by match score descending and return top 20
    matches.sort((a, b) => b.matchScore - a.matchScore);
    const topMatches = matches.slice(0, 20);

    const response: MatchRequirementsResponse = { matches: topMatches };
    return success(response);
  } catch (err) {
    console.error('Error matching requirements:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to match requirements',
      500,
      { message: (err as Error).message }
    );
  }
}
