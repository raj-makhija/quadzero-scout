import { getCandidateById, getAllActiveRequirements, getUserById } from './dynamodb.js';
import { calculateMatchScore, MIN_MUST_HAVE_MATCH_RATIO } from './matchScoring.js';
import { normalizeSkills } from './skillNormalizer.js';
import { isCandidateWithinBudget } from './ctcConversion.js';
import { sendNewProfilesNotificationEmail } from './emailService.js';
import { config } from './config.js';
import type { CandidateItem, RequirementItem } from '../types/index.js';

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
  // Result: Map<requirementId, matchCount>
  const requirementMatchCounts = new Map<string, { requirement: typeof notifiableRequirements[0]; count: number }>();

  for (const req of notifiableRequirements) {
    const criteria = req.parsed_criteria;
    const normalizedMustHave = normalizeSkills(criteria.mustHaveSkills || []);
    const normalizedGoodToHave = normalizeSkills(criteria.goodToHaveSkills || []);

    let matchCount = 0;
    for (const candidate of candidates) {
      const { score, details } = calculateMatchScore(
        candidate,
        normalizedMustHave,
        normalizedGoodToHave,
        criteria.minExperience ?? undefined,
        criteria.maxExperience ?? undefined,
        criteria.seniority?.length ? criteria.seniority : undefined,
        req.budget_max_lpa ?? undefined
      );

      // Apply the same min-match-ratio filter as matchRequirements.ts
      if (normalizedMustHave.length > 0) {
        const exactRatio = details.mustHaveMatched.length / normalizedMustHave.length;
        if (exactRatio < MIN_MUST_HAVE_MATCH_RATIO) continue;
      }

      const budgetFit = isCandidateWithinBudget(candidate.expected_ctc, req.budget_max_lpa);
      if (score > 0 || budgetFit) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      requirementMatchCounts.set(req.requirement_id, { requirement: req, count: matchCount });
    }
  }

  if (requirementMatchCounts.size === 0) return;

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
  for (const [, { requirement, count }] of requirementMatchCounts) {
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
          candidateCount: count,
        });
        console.log(
          `Notification sent: requirement=${requirement.requirement_id}, recruiter=${recruiterId}, matches=${count}`
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
