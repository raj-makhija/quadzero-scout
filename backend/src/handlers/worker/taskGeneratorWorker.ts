/**
 * taskGeneratorWorker (ticket #153) — EventBridge every 30 minutes.
 *
 * Generates time/condition-based POOL tasks via the pure buildSweepTasks
 * transform, then expires tasks abandoned past the grace window. Each phase is
 * isolated so one failing data source does not abort the rest of the sweep.
 */
import {
  buildSweepTasks,
  createTaskIfAbsent,
  expireStaleTasks,
  fetchLowConfidenceImports,
  fetchUnscreenedCandidates,
  SCREENING_MAX_AGE_DAYS,
  STALE_REQUIREMENT_DAYS,
  MATCH_TASK_THRESHOLD,
  type SweepInput,
} from '../../lib/recruiterTasks.js';
import {
  getAllActiveRequirements,
  getShortlistsForRequirement,
  getCandidateById,
  getRecentProfiles,
} from '../../lib/dynamodb.js';
import { calculateMatchScore, parseSearchLocations } from '../../lib/matchScoring.js';
import { normalizeSynonymMap } from '../../lib/candidateMatching.js';
import type { CandidateItem, RequirementItem, ShortlistItem } from '../../types/index.js';

const DAY_MS = 86_400_000;
const ACTIVE_PROGRESS_STAGES = new Set([
  'shortlisted',
  'submitted_to_client',
  'client_reviewed',
  'interview_scheduled',
  'interview_completed',
]);
const TERMINAL_SHORTLIST_STATUSES = new Set(['not_suitable', 'rejected', 'withdrawn']);

function lastActivity(s: ShortlistItem): number {
  const ts = s.last_activity_at || s.stage_entered_at || s.tagged_at;
  return ts ? new Date(ts).getTime() : 0;
}

function scoreCandidate(candidate: CandidateItem, req: RequirementItem): number {
  try {
    const criteria = req.parsed_criteria;
    if (!criteria) return 0;
    const { score } = calculateMatchScore(
      candidate,
      criteria.mustHaveSkills || [],
      criteria.goodToHaveSkills || [],
      criteria.minExperience ?? undefined,
      criteria.maxExperience ?? undefined,
      criteria.seniority?.length ? criteria.seniority : undefined,
      req.budget_max_lpa ?? undefined,
      parseSearchLocations(criteria.location ?? undefined),
      criteria.availability,
      normalizeSynonymMap(criteria.skillSynonyms),
      normalizeSynonymMap(candidate.skill_synonyms),
      criteria.roles
    );
    return score;
  } catch {
    return 0;
  }
}

export async function handler(): Promise<void> {
  const now = new Date();
  console.log('[taskGeneratorWorker] sweep started at', now.toISOString());

  const input: SweepInput = { now };

  let requirements: RequirementItem[] = [];
  try {
    requirements = await getAllActiveRequirements();
  } catch (err) {
    console.error('[taskGeneratorWorker] failed to load active requirements:', err);
  }

  const stale: NonNullable<SweepInput['staleRequirements']> = [];
  const filled: NonNullable<SweepInput['filledRequirements']> = [];
  const expiredScreenings: NonNullable<SweepInput['expiredScreenings']> = [];
  const shortlistedByReq = new Map<string, Set<string>>();

  for (const req of requirements) {
    try {
      const shortlists = await getShortlistsForRequirement(req.requirement_id);
      shortlistedByReq.set(req.requirement_id, new Set(shortlists.map((s) => s.candidate_id)));

      const activity = shortlists.length
        ? Math.max(...shortlists.map(lastActivity))
        : new Date(req.created_at).getTime();
      if (now.getTime() - activity > STALE_REQUIREMENT_DAYS * DAY_MS) {
        stale.push({ requirementId: req.requirement_id, requirementTitle: req.job_title, clientName: req.client_name });
      }

      if (shortlists.some((s) => s.pipeline_stage === 'joined')) {
        filled.push({ requirementId: req.requirement_id, requirementTitle: req.job_title, clientName: req.client_name });
      }

      for (const s of shortlists) {
        const stage = s.pipeline_stage || s.status;
        if (TERMINAL_SHORTLIST_STATUSES.has(s.status)) continue;
        if (stage && !ACTIVE_PROGRESS_STAGES.has(stage)) continue;
        const candidate = await getCandidateById(s.candidate_id);
        if (!candidate?.last_screened_at) continue;
        const ageDays = (now.getTime() - new Date(candidate.last_screened_at).getTime()) / DAY_MS;
        if (ageDays > SCREENING_MAX_AGE_DAYS) {
          expiredScreenings.push({
            requirementId: req.requirement_id,
            candidateId: s.candidate_id,
            candidateName: candidate.full_name,
            requirementTitle: req.job_title,
            clientName: req.client_name,
          });
        }
      }
    } catch (err) {
      console.error(`[taskGeneratorWorker] requirement ${req.requirement_id} sweep failed:`, err);
    }
  }
  input.staleRequirements = stale;
  input.filledRequirements = filled;
  input.expiredScreenings = expiredScreenings;

  // New profiles matching an active requirement (>= threshold), not yet shortlisted.
  try {
    const { items: recent } = await getRecentProfiles(50);
    const matches: NonNullable<SweepInput['newMatches']> = [];
    for (const candidate of recent) {
      for (const req of requirements) {
        if (shortlistedByReq.get(req.requirement_id)?.has(candidate.candidate_id)) continue;
        const score = scoreCandidate(candidate, req);
        if (score >= MATCH_TASK_THRESHOLD) {
          matches.push({
            requirementId: req.requirement_id,
            candidateId: candidate.candidate_id,
            candidateName: candidate.full_name,
            requirementTitle: req.job_title,
            clientName: req.client_name,
            matchScore: score,
          });
        }
      }
    }
    input.newMatches = matches;
  } catch (err) {
    console.error('[taskGeneratorWorker] match sweep failed:', err);
  }

  try {
    input.lowConfidenceImports = await fetchLowConfidenceImports(now);
  } catch (err) {
    console.error('[taskGeneratorWorker] bulk-import sweep failed:', err);
  }

  try {
    input.unscreenedCandidates = await fetchUnscreenedCandidates(now);
  } catch (err) {
    console.error('[taskGeneratorWorker] unscreened-candidate sweep failed:', err);
  }

  const specs = buildSweepTasks(input);
  let created = 0;
  for (const spec of specs) {
    try {
      const task = await createTaskIfAbsent(spec, now);
      if (task) created++;
    } catch (err) {
      console.error('[taskGeneratorWorker] failed to create pool task:', spec.type, err);
    }
  }

  let expired = 0;
  try {
    expired = await expireStaleTasks(now);
  } catch (err) {
    console.error('[taskGeneratorWorker] expire sweep failed:', err);
  }

  console.log(`[taskGeneratorWorker] sweep complete: ${created} created, ${expired} expired, ${specs.length} candidates`);
}
