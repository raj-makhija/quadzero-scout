import { createHash } from 'node:crypto';
import { config } from './config.js';
import { getLlmRerank } from './dynamodb.js';
import { invokeLambdaAsync } from './lambdaInvoke.js';
import { getRerankSignature, type RerankCandidateInput } from './llm/index.js';
import { putLlmRerankMetric } from './cloudwatchMetrics.js';
import type { CandidateItem, RequirementItem, CandidateSearchResult } from '../types/index.js';

/**
 * Shared helpers for the lazy LLM tie-break overlay (ticket #239).
 *
 * The deterministic match-cache ranking stays canonical. On a requirement-bound
 * view we overlay the LLM re-rank of the top-N as a read-time reorder of the
 * displayed page, recomputing (once, async) only when the stored entry is stale.
 */

// Size of the deterministic slice the LLM re-ranks. The freshness hash is taken
// over this ordered id-set, so any page view of the same requirement gates on
// the same key regardless of which page slice is displayed.
// 25 keeps the batched LLM output (a score + rationale per candidate) within the
// 4096-token response budget; 50 truncated the JSON and failed every rerank.
export const RERANK_TOP_N = 25;

/** Freshness key: sha256 over the ordered top-N candidate ids. */
export function computeTopNHash(orderedIds: string[]): string {
  return createHash('sha256').update(orderedIds.join('|')).digest('hex');
}

/** A compact text profile of one candidate for the re-rank prompt. */
export function buildRerankCandidates(candidates: CandidateItem[]): RerankCandidateInput[] {
  return candidates.map((c) => ({
    candidate_id: c.candidate_id,
    profile: [
      c.headline ? `Headline: ${c.headline}` : null,
      `Experience: ${c.total_experience} yrs`,
      `Seniority: ${c.seniority}`,
      c.location ? `Location: ${c.location}` : null,
      c.roles?.length ? `Roles: ${c.roles.join(', ')}` : null,
      c.primary_skills?.length ? `Skills: ${c.primary_skills.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  }));
}

/** The requirement's JD text used as the prompt-cached prefix for the re-rank. */
export function buildRequirementJd(req: RequirementItem): string {
  return req.jd_text || '';
}

/**
 * Apply the LLM tie-break overlay to a resolved page of a requirement-bound
 * search. Never blocks on an LLM call: a fresh stored entry is applied in-memory;
 * a stale/cold entry fires a single fire-and-forget recompute and the page is
 * returned in deterministic order. The caller wraps this in try/catch so any
 * store/LLM error falls back to deterministic order with HTTP 200.
 *
 * `topNIds` is the ordered deterministic top-N id-list (the freshness set);
 * `page` is the resolved (possibly paginated) slice to reorder + annotate.
 */
export async function applyLlmRerankOverlay(
  requirementId: string,
  topNIds: string[],
  page: CandidateSearchResult[]
): Promise<{ page: CandidateSearchResult[]; ranked: boolean; pending: boolean }> {
  // Kill switch off, or empty top-N after filters → pure deterministic order.
  if (!config.featureFlags.llmRerankEnabled || topNIds.length === 0) {
    return { page, ranked: false, pending: false };
  }

  const topNHash = computeTopNHash(topNIds);
  const stored = await getLlmRerank(requirementId);
  const { model, promptVersion } = await getRerankSignature();

  const fresh =
    stored !== null &&
    stored.top_n_hash === topNHash &&
    stored.model === model &&
    stored.prompt_version === promptVersion;

  if (fresh) {
    const byId = new Map(stored!.entries.map((e) => [e.candidate_id, e]));
    const reordered = [...page].sort(
      (a, b) =>
        (byId.get(b.candidateId)?.llmScore ?? -Infinity) -
        (byId.get(a.candidateId)?.llmScore ?? -Infinity)
    );
    for (const c of reordered) {
      const entry = byId.get(c.candidateId);
      // Only surface a rationale for candidates the LLM actually scored — guards
      // against a stale entry leaking rationale onto the wrong candidate.
      if (entry) c.rationale = entry.rationale;
    }
    putLlmRerankMetric('CacheHit', 1, 'Count').catch(() => undefined);
    return { page: reordered, ranked: true, pending: false };
  }

  // Stale or cold cache → recompute once, async, never blocking the response.
  if (config.lambda.llmRerankWorkerName) {
    invokeLambdaAsync(config.lambda.llmRerankWorkerName, {
      requirementId,
      candidateIds: topNIds,
      topNHash,
    }).catch((err) => console.error('llmRerank worker invoke failed:', err));
  }
  putLlmRerankMetric('CacheMiss', 1, 'Count').catch(() => undefined);
  return { page, ranked: false, pending: true };
}
