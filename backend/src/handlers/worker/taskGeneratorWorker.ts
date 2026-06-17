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
  selectMatchTasksFromCache,
  SCREENING_MAX_AGE_DAYS,
  STALE_REQUIREMENT_DAYS,
  FOUND_MATCHES_PER_REQ,
  type SweepInput,
} from '../../lib/recruiterTasks.js';
import {
  getAllActiveRequirements,
  getShortlistsForRequirement,
  getCandidateById,
  getCandidatesByIds,
  getMatchCache,
} from '../../lib/dynamodb.js';
import type { RequirementItem, ShortlistItem } from '../../types/index.js';

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

  // Strong candidates for active requirements, sourced from the precomputed
  // RequirementMatchCache (one GetItem per requirement) rather than re-scoring
  // the 50 most-recent profiles — so genuine ≥70 matches across the full pool
  // surface. Already-shortlisted/joined candidates are excluded; per requirement
  // the picks are capped and any overflow is logged (no silent truncation).
  const matches: NonNullable<SweepInput['newMatches']> = [];
  for (const req of requirements) {
    try {
      const ranked = await getMatchCache(req.requirement_id);
      if (ranked === null) {
        console.log(
          `[taskGeneratorWorker] requirement ${req.requirement_id} match cache cold; skipping found-candidate tasks`
        );
        continue;
      }
      const excluded = shortlistedByReq.get(req.requirement_id) ?? new Set<string>();
      const { matches: picks, skipped } = selectMatchTasksFromCache(ranked, excluded);
      if (skipped > 0) {
        console.log(
          `[taskGeneratorWorker] requirement ${req.requirement_id} found-candidate cap ${FOUND_MATCHES_PER_REQ} hit; ${skipped} match(es) skipped this sweep`
        );
      }
      if (picks.length === 0) continue;

      // Best-effort name enrichment for the capped set; a failure leaves names
      // blank rather than aborting the tasks already computed for this sweep.
      const nameById = new Map<string, string | undefined>();
      try {
        const candidates = await getCandidatesByIds(picks.map((p) => p.candidateId));
        for (const c of candidates) nameById.set(c.candidate_id, c.full_name);
      } catch (err) {
        console.error(
          `[taskGeneratorWorker] candidate name enrichment failed for requirement ${req.requirement_id}:`,
          err
        );
      }

      for (const p of picks) {
        matches.push({
          requirementId: req.requirement_id,
          candidateId: p.candidateId,
          candidateName: nameById.get(p.candidateId),
          requirementTitle: req.job_title,
          clientName: req.client_name,
          matchScore: p.score,
        });
      }
    } catch (err) {
      console.error(`[taskGeneratorWorker] match cache sweep failed for requirement ${req.requirement_id}:`, err);
    }
  }
  input.newMatches = matches;

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
