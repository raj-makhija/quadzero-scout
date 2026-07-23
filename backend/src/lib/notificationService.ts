import { getCandidateById, getAllActiveRequirements, getUserById, getActivePricingConfig } from './dynamodb.js';
import { matchAndRankCandidates } from './candidateMatching.js';
import { requirementBudgetCeilingLpa } from './pricingEngine.js';
import { updateCacheForCandidates } from './matchCacheService.js';
import { sendNewProfilesNotificationEmail, type MatchedProfile } from './emailService.js';
import { config } from './config.js';
import type { CandidateItem, RequirementItem } from '../types/index.js';

/**
 * For a list of candidate IDs, maintains the match-cache for every active
 * requirement and sends one email per (requirement, recruiter) pair to opted-in
 * recruiters. Emails are aggregated — one email per requirement covers all
 * matching candidates. Non-fatal: cache and email errors are logged but never throw.
 */
export async function notifyMatchingRecruiters(candidateIds: string[]): Promise<void> {
  if (candidateIds.length === 0) return;

  // Fetch all candidates in parallel
  const candidates = (
    await Promise.all(candidateIds.map(id => getCandidateById(id)))
  ).filter((c): c is CandidateItem => c !== null);

  if (candidates.length === 0) return;

  // Fetch all active requirements
  const requirements = await getAllActiveRequirements();

  // Maintain the match-cache for EVERY active requirement. This runs before —
  // and independently of — the email path so that cache maintenance is never
  // blocked by SES configuration or recruiter opt-in (which gate only email).
  try {
    await updateCacheForCandidates(candidates, requirements);
  } catch (err) {
    console.error('Failed to update match-cache after candidate ingest:', err);
  }

  // ─── Email notifications (gated on feature flag + SES config + opted-in recruiters) ───
  // The flag gate is independent of, and runs after, cache maintenance: turning
  // emails off must never affect the match-cache.
  if (!config.featureFlags.recruiterMatchEmailEnabled) {
    console.log('RECRUITER_MATCH_EMAIL_ENABLED is off, skipping recruiter notifications');
    return;
  }

  if (!config.email.senderEmail) {
    console.log('SES_SENDER_EMAIL not configured, skipping recruiter notifications');
    return;
  }

  // Only process requirements with at least one recruiter opted in
  const notifiableRequirements = requirements.filter(
    (req): req is RequirementItem & { notify_recruiter_ids: string[] } =>
      Array.isArray(req.notify_recruiter_ids) && req.notify_recruiter_ids.length > 0
  );

  if (notifiableRequirements.length === 0) return;

  // Score each candidate against each notifiable requirement
  // Result: Map<requirementId, { requirement, matchedProfiles }>
  const requirementMatches = new Map<string, { requirement: typeof notifiableRequirements[0]; matchedProfiles: MatchedProfile[] }>();

  const pricingConfig = await getActivePricingConfig();

  for (const req of notifiableRequirements) {
    const criteria = req.parsed_criteria;
    const engagementModel = req.engagement_model || criteria.engagementModel;

    const scored = matchAndRankCandidates(
      candidates,
      {
        coreSkill: criteria.coreSkill,
        mustHaveSkills: criteria.mustHaveSkills,
        goodToHaveSkills: criteria.goodToHaveSkills,
        minExperience: criteria.minExperience,
        maxExperience: criteria.maxExperience,
        seniority: criteria.seniority,
        availability: criteria.availability,
        location: criteria.location,
        roles: criteria.roles,
        // Budget fit uses the pre-computed "Max Resource Budget" ceiling, not
        // the raw billing budget (ticket #529).
        maxBudgetLpa: requirementBudgetCeilingLpa(
          req.budget_max_lpa,
          req.payment_terms_days,
          req.is_rate_gst_inclusive,
          engagementModel,
          pricingConfig
        ),
        engagementModel,
        skillSynonyms: criteria.skillSynonyms,
      },
      { notifyInclusion: true }
    );

    const matchedProfiles: MatchedProfile[] = scored.map(({ candidate }) => ({
      candidateId: candidate.candidate_id,
      fullName: candidate.full_name,
      primarySkills: candidate.primary_skills,
    }));

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
