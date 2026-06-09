import { config } from '../../lib/config.js';
import { getRequirementById, getCandidatesByIds, putLlmRerank } from '../../lib/dynamodb.js';
import { rerankTopN } from '../../lib/llm/index.js';
import { buildRequirementJd, buildRerankCandidates } from '../../lib/llmRerank.js';
import { putLlmRerankMetric } from '../../lib/cloudwatchMetrics.js';

/**
 * LLM tie-break recompute worker (ticket #239).
 *
 * Invoked fire-and-forget from the requirement-bound search read path when the
 * stored re-rank is stale or cold. Fetches the requirement + its deterministic
 * top-N candidates, runs the batched `rerankTopN` call once, and stores the
 * result keyed by the `topNHash` the caller computed (so the next view's
 * freshness gate matches). Errors are logged, not thrown — the search response
 * already fell back to deterministic order.
 */
interface LlmRerankEvent {
  requirementId: string;
  candidateIds: string[];
  topNHash: string;
}

export async function handler(event: LlmRerankEvent): Promise<void> {
  // Kill switch — defense in depth; the search path already gates on this.
  if (!config.featureFlags.llmRerankEnabled) {
    console.log('[llmRerankWorker] LLM rerank disabled (LLM_RERANK_ENABLED=false)');
    await putLlmRerankMetric('KillSwitchDisabled', 1, 'Count');
    return;
  }

  const { requirementId, candidateIds, topNHash } = event;

  // Empty top-N → nothing to rank, no LLM call.
  if (!candidateIds || candidateIds.length === 0) {
    console.log(`[llmRerankWorker] empty top-N for ${requirementId}, skipping`);
    return;
  }

  try {
    const requirement = await getRequirementById(requirementId);
    if (!requirement) {
      console.warn(`[llmRerankWorker] requirement ${requirementId} not found, skipping`);
      return;
    }

    const candidates = await getCandidatesByIds(candidateIds);
    const byId = new Map(candidates.map((c) => [c.candidate_id, c]));
    // Preserve the caller's deterministic order; drop ids whose row vanished.
    const ordered = candidateIds.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);

    if (ordered.length === 0) {
      console.log(`[llmRerankWorker] no live candidates for ${requirementId}, skipping`);
      return;
    }

    await putLlmRerankMetric('LlmCallCount', 1, 'Count');

    const callStart = Date.now();
    const result = await rerankTopN({
      jobDescription: buildRequirementJd(requirement),
      candidates: buildRerankCandidates(ordered),
      topNHash,
    });
    const latencyMs = Date.now() - callStart;

    const dimensions = [
      { Name: 'Model', Value: result.model },
      { Name: 'Provider', Value: config.llm.provider },
    ];

    await Promise.all([
      putLlmRerankMetric('LlmLatencyMs', latencyMs, 'Milliseconds', dimensions),
      result.usage
        ? putLlmRerankMetric('InputTokens', result.usage.inputTokens, 'Count', dimensions)
        : Promise.resolve(),
      result.usage
        ? putLlmRerankMetric('OutputTokens', result.usage.outputTokens, 'Count', dimensions)
        : Promise.resolve(),
    ]);

    await putLlmRerank(requirementId, {
      entries: result.entries,
      top_n_hash: result.topNHash,
      model: result.model,
      prompt_version: result.promptVersion,
      computed_at: new Date().toISOString(),
    });

    console.log(`[llmRerankWorker] stored re-rank for ${requirementId} (${result.entries.length} entries)`);
  } catch (err) {
    console.error(`[llmRerankWorker] failed for ${requirementId}:`, err);
    await putLlmRerankMetric('FallbackCount', 1, 'Count');
  }
}
