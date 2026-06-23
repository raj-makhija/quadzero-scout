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
      //
      // Over-count drift policy (ticket #447): this upsert only re-scores the
      // *changed* candidates. Entries retained here for *unchanged* candidates
      // are NOT re-validated against the requirement's current criteria, so an
      // active candidate that no longer qualifies after a criteria edit can
      // linger in the cache (cached > fresh). This drift is accepted as
      // cosmetic and bounded: the nightly full rebuild (`rebuildAllMatchCaches`)
      // writes authoritative caches from scratch and heals it within ≤24h. Do
      // not add a full re-score here — that would defeat the hot-path design of
      // this incremental upsert.
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

/** Bounded retry count for a requirement-driven cache rebuild (ticket #447). */
const CACHE_REBUILD_MAX_ATTEMPTS = 3;

/**
 * Rebuild one requirement's cache from a full scan of all active candidates.
 * Used on requirement create, criteria edit, and reopen.
 *
 * Retries up to `CACHE_REBUILD_MAX_ATTEMPTS` times so a transient DynamoDB
 * throttle / scan failure does not leave a newly-created requirement with an
 * empty cache (ticket #447). The retry is bounded so a persistently unavailable
 * table cannot block the Lambda invocation indefinitely; after the last attempt
 * the underlying error is rethrown for the caller's observability handler to
 * log + emit a metric.
 */
export async function rebuildCacheForRequirement(req: RequirementItem): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CACHE_REBUILD_MAX_ATTEMPTS; attempt++) {
    try {
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
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Chunk size for the nightly full-rebuild fan-out (ticket #462). Each Lambda
 * invocation processes at most this many requirements to stay within the
 * per-invocation timeout budget.
 */
export const REBUILD_CHUNK_SIZE = 5;

/**
 * Rebuild match caches for a bounded list of requirements. Fetches all active
 * candidates once and processes each requirement in sequence. A per-requirement
 * error is logged and does not prevent the remaining requirements from being
 * processed. Used by the chunked nightly rebuild worker (ticket #462).
 */
export async function rebuildMatchCachesForRequirements(reqs: RequirementItem[]): Promise<void> {
  if (reqs.length === 0) return;
  const candidates = await getAllActiveCandidates();
  for (const req of reqs) {
    try {
      const scored = matchAndRankCandidates(candidates, criteriaForRequirement(req), {
        notifyInclusion: true,
      });
      const ranked: RankedMatchEntry[] = scored.map((s, i) => ({
        candidate_id: s.candidate.candidate_id,
        rank: i + 1,
        score: s.score,
      }));
      await putMatchCache(req.requirement_id, ranked);
    } catch (err) {
      console.error(`[matchCache] chunk rebuild failed for ${req.requirement_id}:`, err);
    }
  }
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

/**
 * Delta (cached vs fresh count) above which the cache-health audit raises a
 * LARGE_DELTA warning. Tunable if the alert proves too noisy.
 */
export const CACHE_DELTA_THRESHOLD = 20;

/**
 * Lightweight cache-health audit (ticket #447). For each active requirement it
 * compares the *cached* match count against a *fresh* in-memory re-score and
 * emits an observable warn-level signal when:
 *  - EMPTY_CACHE: cached = 0 while a fresh re-score returns > 0 matches
 *    (recruiters would see no candidates — the severe case).
 *  - LARGE_DELTA: |cached − fresh| exceeds `CACHE_DELTA_THRESHOLD` (drift).
 *
 * It only *signals* — it never writes/rebuilds inline. Triggering a full rebuild
 * here would add unbounded latency; the nightly `rebuildAllMatchCaches` (which
 * runs right after this in the worker) is the authoritative heal.
 */
export async function auditMatchCacheHealth(): Promise<void> {
  const reqs = await getAllActiveRequirements();
  if (reqs.length === 0) return;
  const candidates = await getAllActiveCandidates();

  for (const req of reqs) {
    const cachedCount = ((await getMatchCache(req.requirement_id)) ?? []).length;
    const freshCount = scoreAgainstRequirement(req, candidates).size;

    if (cachedCount === 0 && freshCount > 0) {
      console.warn(
        `[matchCache] EMPTY_CACHE: requirement ${req.requirement_id} cached=0 fresh=${freshCount}`
      );
    } else if (Math.abs(cachedCount - freshCount) > CACHE_DELTA_THRESHOLD) {
      console.warn(
        `[matchCache] LARGE_DELTA: requirement ${req.requirement_id} cached=${cachedCount} fresh=${freshCount}`
      );
    }
  }
}
