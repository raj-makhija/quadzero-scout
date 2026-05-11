import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, MatchDebugRequestSchema } from '../../lib/validation.js';
import { getCandidateById, getRequirementById } from '../../lib/dynamodb.js';
import { normalizeSkill, normalizeSkills, coreSkillSatisfiedBy, expandStackAbbreviation } from '../../lib/skillNormalizer.js';
import { calculateMatchScore, MIN_MUST_HAVE_MATCH_RATIO, FUZZY_MATCH_WEIGHT, MUST_HAVE_SECONDARY_WEIGHT, parseSearchLocations, isEngagementModelCompatible } from '../../lib/matchScoring.js';
import { isCandidateWithinBudget } from '../../lib/ctcConversion.js';

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

    const validation = validate(MatchDebugRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { candidateId, requirementId } = validation.data;

    const [candidate, requirement] = await Promise.all([
      getCandidateById(candidateId),
      getRequirementById(requirementId),
    ]);

    if (!candidate) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }
    if (!requirement) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    const criteria = requirement.parsed_criteria;

    // Normalize skills
    const candidatePrimaryRaw = candidate.primary_skills || [];
    const candidateSecondaryRaw = candidate.secondary_skills || [];
    const candidatePrimaryNormalized = normalizeSkills(candidatePrimaryRaw);
    const candidatePrimarySet = new Set(candidatePrimaryNormalized);

    const normalizedMustHave = normalizeSkills(criteria.mustHaveSkills || []);
    const normalizedGoodToHave = normalizeSkills(criteria.goodToHaveSkills || []);
    const searchLocations = parseSearchLocations(criteria.location ?? undefined);

    // Normalize synonym maps
    const reqSynonyms = normalizeSynonymMap(criteria.skillSynonyms);
    const candSynonyms = normalizeSynonymMap(candidate.skill_synonyms);

    // --- Filter 1: CoreSkill pre-filter ---
    const rawCoreSkill = criteria.coreSkill || null;
    const normalizedCoreSkill = rawCoreSkill ? normalizeSkill(rawCoreSkill) : null;
    const coreSkillPassed = !normalizedCoreSkill || coreSkillSatisfiedBy(normalizedCoreSkill, candidatePrimarySet);
    const coreSkillExactMatch = normalizedCoreSkill ? candidatePrimarySet.has(normalizedCoreSkill) : false;
    const coreSkillComponents = normalizedCoreSkill ? expandStackAbbreviation(normalizedCoreSkill) : null;

    // --- Run scoring (even if filters would reject, for diagnostic purposes) ---
    const { score, details } = calculateMatchScore(
      candidate,
      normalizedMustHave,
      normalizedGoodToHave,
      criteria.minExperience ?? undefined,
      criteria.maxExperience ?? undefined,
      criteria.seniority?.length ? criteria.seniority : undefined,
      requirement.budget_max_lpa ?? undefined,
      searchLocations,
      criteria.availability,
      reqSynonyms,
      candSynonyms,
      criteria.roles
    );

    // --- Filter 2: Must-have match ratio (exact + fuzzy) ---
    const effectiveRatio = normalizedMustHave.length > 0
      ? (
          details.mustHaveMatched.length
          + (details.mustHaveFuzzy?.length || 0) * FUZZY_MATCH_WEIGHT
          + (details.mustHaveSecondary?.length || 0) * MUST_HAVE_SECONDARY_WEIGHT
        ) / normalizedMustHave.length
      : 1;
    const mustHaveRatioPassed = normalizedMustHave.length === 0 || effectiveRatio >= MIN_MUST_HAVE_MATCH_RATIO;

    // --- Filter 3: Engagement model ---
    const reqEngagementModel = requirement.engagement_model || criteria.engagementModel;
    const candidateModel = candidate.engagement_model || 'either';
    let engagementPassed = true;
    if (reqEngagementModel && reqEngagementModel !== 'either') {
      engagementPassed = isEngagementModelCompatible(reqEngagementModel, candidateModel);
    }

    // --- Budget (soft, but report it) ---
    const budgetFit = isCandidateWithinBudget(candidate.expected_ctc, requirement.budget_max_lpa);

    // Determine overall result
    const excludedBy: string[] = [];
    if (!coreSkillPassed) excludedBy.push('coreSkill');
    if (!mustHaveRatioPassed) excludedBy.push('mustHaveRatio');
    if (!engagementPassed) excludedBy.push('engagementModel');

    return success({
      candidate: {
        candidateId: candidate.candidate_id,
        fullName: candidate.full_name,
        primarySkills: candidatePrimaryRaw,
        normalizedPrimary: candidatePrimaryNormalized,
        secondarySkills: candidateSecondaryRaw,
        normalizedSecondary: normalizeSkills(candidateSecondaryRaw),
        totalExperience: candidate.total_experience,
        seniority: candidate.seniority,
        engagementModel: candidateModel,
        expectedCtc: candidate.expected_ctc,
        currentCtc: candidate.current_ctc,
        availability: candidate.availability,
        location: candidate.location,
        skillSynonyms: candSynonyms || null,
      },
      requirement: {
        requirementId: requirement.requirement_id,
        clientName: requirement.client_name,
        jobTitle: requirement.job_title,
        coreSkill: rawCoreSkill,
        normalizedCoreSkill,
        mustHaveSkills: criteria.mustHaveSkills || [],
        normalizedMustHave,
        goodToHaveSkills: criteria.goodToHaveSkills || [],
        normalizedGoodToHave,
        engagementModel: reqEngagementModel,
        budgetMaxLpa: requirement.budget_max_lpa,
        location: criteria.location,
        parsedLocations: searchLocations,
        availability: criteria.availability,
        seniority: criteria.seniority,
        skillSynonyms: reqSynonyms || null,
      },
      filters: {
        coreSkill: {
          passed: coreSkillPassed,
          detail: normalizedCoreSkill
            ? coreSkillPassed
              ? coreSkillExactMatch
                ? `Normalized coreSkill '${normalizedCoreSkill}' found in candidate primary skills`
                : `Normalized coreSkill '${normalizedCoreSkill}' satisfied by component skills [${(coreSkillComponents ?? []).join(', ')}] all present in candidate primary skills`
              : `Normalized coreSkill '${normalizedCoreSkill}' NOT in candidate primary skills: [${candidatePrimaryNormalized.join(', ')}]`
            : 'No coreSkill specified — filter skipped',
        },
        mustHaveRatio: {
          passed: mustHaveRatioPassed,
          ratio: Math.round(effectiveRatio * 100) / 100,
          threshold: MIN_MUST_HAVE_MATCH_RATIO,
          matched: details.mustHaveMatched,
          fuzzy: details.mustHaveFuzzy,
          secondary: details.mustHaveSecondary,
          related: details.mustHaveRelated,
          missing: details.mustHaveMissing,
        },
        engagementModel: {
          passed: engagementPassed,
          reqModel: reqEngagementModel || 'not specified',
          candidateModel,
        },
        budgetFit: {
          passed: budgetFit,
          detail: `candidate expectedCtc=${candidate.expected_ctc ?? 'null'}, requirement budgetMaxLpa=${requirement.budget_max_lpa ?? 'null'}`,
        },
      },
      wouldBeExcluded: excludedBy.length > 0,
      excludedBy,
      score,
      matchDetails: details,
    });
  } catch (err) {
    console.error('Error in match debug:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to run match debug',
      500,
      { message: (err as Error).message }
    );
  }
}
