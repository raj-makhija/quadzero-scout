import { getCandidateById, getAllActiveRequirements, getUserById } from './dynamodb.js';
import { calculateMatchScore, MIN_MUST_HAVE_MATCH_RATIO, FUZZY_MATCH_WEIGHT, parseSearchLocations, isEngagementModelCompatible } from './matchScoring.js';
import { normalizeSkill, normalizeSkills } from './skillNormalizer.js';
import { isCandidateWithinBudget } from './ctcConversion.js';
import { sendNewProfilesNotificationEmail, type MatchedProfile } from './emailService.js';
import { config } from './config.js';
import type { CandidateItem, RequirementItem } from '../types/index.js';

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

/**
 * For a list of candidate IDs, runs matching against all active requirements
 * and sends one email per (requirement, recruiter) pair to opted-in recruiters.
 * Emails are aggregated — one email per requirement covers all matching candidates.
 * Non-fatal: email errors are logged but never throw.
 */
export async function notifyMatchingRecruiters(candidateIds: string[]): Promise<void> {
  if (!config.email.senderEmail) {
    console.log('SES_SENDER_EMAIL not configured, skipping recruiter notifications');
    return;
  }
  if (candidateIds.length === 0) return;

  // Fetch all candidates in parallel
  const candidates = (
    await Promise.all(candidateIds.map(id => getCandidateById(id)))
  ).filter((c): c is CandidateItem => c !== null);

  if (candidates.length === 0) return;

  // Fetch all active requirements
  const requirements = await getAllActiveRequirements();

  // Only process requirements with at least one recruiter opted in
  const notifiableRequirements = requirements.filter(
    (req): req is RequirementItem & { notify_recruiter_ids: string[] } =>
      Array.isArray(req.notify_recruiter_ids) && req.notify_recruiter_ids.length > 0
  );

  if (notifiableRequirements.length === 0) return;

  // Score each candidate against each notifiable requirement
  // Result: Map<requirementId, { requirement, matchedProfiles }>
  const requirementMatches = new Map<string, { requirement: typeof notifiableRequirements[0]; matchedProfiles: MatchedProfile[] }>();

  for (const req of notifiableRequirements) {
    const criteria = req.parsed_criteria;
    const normalizedMustHave = normalizeSkills(criteria.mustHaveSkills || []);
    const normalizedGoodToHave = normalizeSkills(criteria.goodToHaveSkills || []);
    const normalizedCoreSkill = criteria.coreSkill ? normalizeSkill(criteria.coreSkill) : null;
    const searchLocations = parseSearchLocations(criteria.location ?? undefined);

    // Normalize synonym maps (may be null for older requirements)
    const reqSynonyms = normalizeSynonymMap(criteria.skillSynonyms);

    const matchedProfiles: MatchedProfile[] = [];
    for (const candidate of candidates) {
      // Core skill pre-filter: must be in primary skills (secondary is too noisy for the defining technology)
      if (normalizedCoreSkill) {
        const primarySkills = new Set(normalizeSkills(candidate.primary_skills));
        if (!primarySkills.has(normalizedCoreSkill)) continue;
      }

      const candSynonyms = normalizeSynonymMap(candidate.skill_synonyms);

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
        candSynonyms
      );

      // Apply minimum must-have effective match ratio filter
      if (normalizedMustHave.length > 0) {
        const effectiveRatio = (details.mustHaveMatched.length + (details.mustHaveFuzzy?.length || 0) * FUZZY_MATCH_WEIGHT) / normalizedMustHave.length;
        if (effectiveRatio < MIN_MUST_HAVE_MATCH_RATIO) continue;
      }

      const budgetFit = isCandidateWithinBudget(candidate.expected_ctc, req.budget_max_lpa);

      // CTC is a soft indicator — over-budget candidates still match
      // for notification purposes (recruiter can negotiate).

      // Hard filter: engagement model must be compatible
      const reqEngagementModel = req.engagement_model || criteria.engagementModel;
      if (reqEngagementModel && reqEngagementModel !== 'either') {
        const candidateModel = candidate.engagement_model || 'either';
        if (!isEngagementModelCompatible(reqEngagementModel, candidateModel)) continue;
      }

      if (score > 0 || budgetFit) {
        matchedProfiles.push({
          candidateId: candidate.candidate_id,
          fullName: candidate.full_name,
          primarySkills: candidate.primary_skills,
        });
      }
    }

    if (matchedProfiles.length > 0) {
      requirementMatches.set(req.requirement_id, { requirement: req, matchedProfiles });
    }
  }

  if (requirementMatches.size === 0) return;

  // Cache recruiter info lookups to avoid duplicate DynamoDB reads
  const recruiterCache = new Map<string, { email: string; name: string } | null>();

  const getRecruiterInfo = async (recruiterId: string) => {
    if (recruiterCache.has(recruiterId)) return recruiterCache.get(recruiterId)!;
    try {
      const user = await getUserById(recruiterId);
      const info = user ? { email: user.email, name: user.name || user.email } : null;
      recruiterCache.set(recruiterId, info);
      return info;
    } catch {
      recruiterCache.set(recruiterId, null);
      return null;
    }
  };

  // Send one email per (requirement × recruiter)
  for (const [, { requirement, matchedProfiles }] of requirementMatches) {
    for (const recruiterId of requirement.notify_recruiter_ids) {
      const recruiterInfo = await getRecruiterInfo(recruiterId);
      if (!recruiterInfo) {
        console.warn(`Recruiter ${recruiterId} not found, skipping notification`);
        continue;
      }

      try {
        await sendNewProfilesNotificationEmail({
          toEmail: recruiterInfo.email,
          recruiterName: recruiterInfo.name,
          requirementId: requirement.requirement_id,
          requirementJobTitle: requirement.job_title || '',
          clientName: requirement.client_name,
          candidateCount: matchedProfiles.length,
          matchedProfiles,
        });
        console.log(
          `Notification sent: requirement=${requirement.requirement_id}, recruiter=${recruiterId}, matches=${matchedProfiles.length}`
        );
      } catch (err) {
        console.error(
          `Failed to send notification to recruiter=${recruiterId} for requirement=${requirement.requirement_id}:`,
          err
        );
      }
    }
  }
}
