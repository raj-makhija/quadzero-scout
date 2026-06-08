import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, MatchRequirementsRequestSchema } from '../../lib/validation.js';
import { getCandidateById, getAllActiveRequirements, getShortlistsForCandidate } from '../../lib/dynamodb.js';
import { normalizeSkill, normalizeSkills, coreSkillSatisfiedBy, disciplinesIncompatible } from '../../lib/skillNormalizer.js';
import { calculateMatchScore, MIN_MUST_HAVE_MATCH_RATIO, FUZZY_MATCH_WEIGHT, MUST_HAVE_SECONDARY_WEIGHT, parseSearchLocations, isEngagementModelCompatible } from '../../lib/matchScoring.js';
import { isCandidateWithinBudget } from '../../lib/ctcConversion.js';
import type { MatchedRequirement, MatchRequirementsResponse } from '../../types/index.js';

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

      // Normalize synonyms from parsed criteria (may be null for older requirements)
      const reqSynonyms = normalizeSynonymMap(criteria.skillSynonyms);
      const candSynonyms = normalizeSynonymMap(candidate.skill_synonyms);

      // Core skill pre-filter: skip if candidate doesn't satisfy the coreSkill
      // (handles stack abbreviations and compound multi-token coreSkills; synonym-aware)
      if (!coreSkillSatisfiedBy(criteria.coreSkill, candidate.primary_skills, reqSynonyms, candSynonyms)) {
        continue;
      }

      const normalizedMustHave = normalizeSkills(criteria.mustHaveSkills || []);
      const normalizedGoodToHave = normalizeSkills(criteria.goodToHaveSkills || []);
      const searchLocations = parseSearchLocations(criteria.location ?? undefined);

      const { score, details } = calculateMatchScore(
        candidate,
        normalizedMustHave,
        normalizedGoodToHave,
        criteria.minExperience ?? undefined,
        criteria.maxExperience ?? undefined,
        criteria.seniority?.length ? criteria.seniority : undefined,
        req.budget_max_lpa ?? undefined,
        searchLocations,
        criteria.availability,
        reqSynonyms,
        candSynonyms,
        criteria.roles
      );

      // Filter out requirements below minimum must-have effective match ratio
      if (normalizedMustHave.length > 0) {
        const effectiveRatio = (
          details.mustHaveMatched.length
          + (details.mustHaveFuzzy?.length || 0) * FUZZY_MATCH_WEIGHT
          + (details.mustHaveSecondary?.length || 0) * MUST_HAVE_SECONDARY_WEIGHT
        ) / normalizedMustHave.length;
        if (effectiveRatio < MIN_MUST_HAVE_MATCH_RATIO) {
          continue;
        }
      }

      // Hard filter: discipline gate
      if (disciplinesIncompatible(criteria.roles || [], candidate.roles || [])) {
        continue;
      }

      const budgetFit = isCandidateWithinBudget(candidate.expected_ctc, req.budget_max_lpa);

      // CTC is a soft indicator — over-budget requirements still appear
      // with budgetFit: false for display purposes.

      // Hard filter: engagement model must be compatible
      const reqEngagementModel = req.engagement_model || criteria.engagementModel;
      if (reqEngagementModel && reqEngagementModel !== 'either') {
        const candidateModel = candidate.engagement_model || 'either';
        if (!isEngagementModelCompatible(reqEngagementModel, candidateModel)) {
          continue;
        }
      }

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
        roles: criteria.roles || [],
        matchScore: score,
        matchDetails: {
          mustHaveMatched: details.mustHaveMatched,
          mustHaveFuzzy: details.mustHaveFuzzy,
          mustHaveSecondary: details.mustHaveSecondary,
          mustHaveRelated: details.mustHaveRelated,
          mustHaveMissing: details.mustHaveMissing,
          goodToHaveMatched: details.goodToHaveMatched,
          goodToHaveFuzzy: details.goodToHaveFuzzy,
          goodToHaveRelated: details.goodToHaveRelated,
          experienceMatch: details.experienceMatch,
          seniorityMatch: details.seniorityMatch,
          budgetFit,
          locationMatch: details.locationMatch,
          availabilityMatch: details.availabilityMatch,
          roleMatch: details.roleMatch,
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
