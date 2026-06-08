import {
  getAllActiveRequirements,
  getAllActiveCandidates,
  getMatchCache,
  putMatchCache,
} from './dynamodb.js';
import { matchAndRankCandidates } from './candidateMatching.js';
import type { CandidateItem, RequirementItem, RankedMatchEntry } from '../types/index.js';

// Re-exported so cache write-path callers have a single import surface for the
// requirement-close/delete drop.
export { deleteMatchCache } from './dynamodb.js';

/**
 * Write path for the per-requirement match cache (ticket #234).
 *
 * Two entry points:
 *  - `updateCacheForCandidates` — candidate-driven. Re-scores the changed
 *    candidate(s) against every active requirement and upserts + re-ranks them
 *    into each requirement's cached list. Rides on the ingest/notify computation
 *    (no full candidate scan on the hot path).
 *  - `rebuildCacheForRequirement` — requirement-driven. Rebuilds one
 *    requirement's cache from a full active-candidate scan (create / criteria
 *    edit / reopen).
 *
 * The cache holds only stable ranking data ({ candidate_id, rank, score }).
 * Volatile state (shortlist, placed, not-suitable, not-interested) is never
 * written here — it stays a read-time overlay.
 */

/** Map a requirement's parsed criteria + budget/engagement into MatchCriteria. */
function criteriaForRequirement(req: RequirementItem) {
  const criteria = req.parsed_criteria;
  return {
    coreSkill: criteria.coreSkill,
    mustHaveSkills: criteria.mustHaveSkills,
    goodToHaveSkills: criteria.goodToHaveSkills,
    minExperience: criteria.minExperience,
    maxExperience: criteria.maxExperience,
    seniority: criteria.seniority,
    availability: criteria.availability,
    location: criteria.location,
    roles: criteria.roles,
    maxBudgetLpa: req.budget_max_lpa,
    engagementModel: req.engagement_model || criteria.engagementModel,
    skillSynonyms: criteria.skillSynonyms,
  };
}

/** Score the given candidates against one requirement; returns score-by-id. */
function scoreAgainstRequirement(
  req: RequirementItem,
  candidates: CandidateItem[]
): Map<string, number> {
  const scored = matchAndRankCandidates(candidates, criteriaForRequirement(req), {
    notifyInclusion: true,
  });
  return new Map(scored.map((s) => [s.candidate.candidate_id, s.score]));
}

/** Sort entries by score desc and assign 1-based ranks. */
function rankEntries(entries: { candidate_id: string; score: number }[]): RankedMatchEntry[] {
  return [...entries]
    .sort((a, b) => b.score - a.score)
    .map((e, i) => ({ candidate_id: e.candidate_id, rank: i + 1, score: e.score }));
}

/**
 * Re-score the changed candidate(s) against every active requirement and upsert
 * them into each requirement's cached ranked list (removing stale entries for
 * candidates that no longer qualify). Pass `requirements` to reuse an
 * already-fetched active-requirements list (ingest path); otherwise it is
 * fetched here (edit paths).
 */
export async function updateCacheForCandidates(
  candidates: CandidateItem[],
  requirements?: RequirementItem[]
): Promise<void> {
  if (candidates.length === 0) return;
  const reqs = requirements ?? (await getAllActiveRequirements());
  if (reqs.length === 0) return;

  const changedIds = new Set(candidates.map((c) => c.candidate_id));

  await Promise.all(
    reqs.map(async (req) => {
      const existing = (await getMatchCache(req.requirement_id)) ?? [];
      const newScores = scoreAgainstRequirement(req, candidates);

      // Drop prior entries for the changed candidates, then re-insert any that
      // still qualify with their fresh score. Candidates that no longer match
      // (dropped by the scorer) are simply not re-added — stale scores cannot
      // persist.
      const retained = existing
        .filter((e) => !changedIds.has(e.candidate_id))
        .map((e) => ({ candidate_id: e.candidate_id, score: e.score }));
      const reinserted = [...newScores.entries()].map(([candidate_id, score]) => ({
        candidate_id,
        score,
      }));

      await putMatchCache(req.requirement_id, rankEntries([...retained, ...reinserted]));
    })
  );
}

/**
 * Rebuild one requirement's cache from a full scan of all active candidates.
 * Used on requirement create, criteria edit, and reopen.
 */
export async function rebuildCacheForRequirement(req: RequirementItem): Promise<void> {
  const candidates = await getAllActiveCandidates();
  const scored = matchAndRankCandidates(candidates, criteriaForRequirement(req), {
    notifyInclusion: true,
  });
  const ranked: RankedMatchEntry[] = scored.map((s, i) => ({
    candidate_id: s.candidate.candidate_id,
    rank: i + 1,
    score: s.score,
  }));
  await putMatchCache(req.requirement_id, ranked);
}

/**
 * Full rebuild of every active-requirement cache in one pass.
 *
 * Candidates are fetched once and reused across all requirements. No existing
 * cache entries are read — each write is authoritative. Exits early when there
 * are no active requirements so the candidate scan is skipped entirely.
 *
 * Used by the nightly scheduled worker and the manual admin trigger (ticket #236).
 */
export async function rebuildAllMatchCaches(): Promise<void> {
  const reqs = await getAllActiveRequirements();
  if (reqs.length === 0) return;
  const candidates = await getAllActiveCandidates();
  await Promise.all(
    reqs.map(async (req) => {
      const scored = matchAndRankCandidates(candidates, criteriaForRequirement(req), {
        notifyInclusion: true,
      });
      const ranked: RankedMatchEntry[] = scored.map((s, i) => ({
        candidate_id: s.candidate.candidate_id,
        rank: i + 1,
        score: s.score,
      }));
      await putMatchCache(req.requirement_id, ranked);
    })
  );
}
