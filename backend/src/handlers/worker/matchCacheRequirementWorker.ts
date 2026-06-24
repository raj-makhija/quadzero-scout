import { getRequirementById } from '../../lib/dynamodb.js';
import { rebuildCacheForRequirement } from '../../lib/matchCacheService.js';
import { putMatchCacheFailureMetric } from '../../lib/cloudwatchMetrics.js';

interface MatchCacheRequirementEvent {
  requirementId: string;
}

/**
 * Background worker (ticket #469): rebuilds a single requirement's match cache
 * from a full active-candidate scan. Invoked async (InvocationType: 'Event') by
 * the requirement create / criteria-edit / reopen handlers so the rebuild is not
 * bound by the 30s API-Gateway request timeout — at prod scale a full scan
 * (~3,500 candidates) cannot complete inside the request Lambda, which left
 * newly created requirements with no cache.
 *
 * The requirement is re-fetched here so the rebuild always scores against the
 * freshly persisted criteria/status. A failed rebuild is observable (ticket
 * #447): logged with the requirement ID and emitted as a CloudWatch metric so a
 * silent empty cache is alarmable.
 */
export async function handler(event: MatchCacheRequirementEvent): Promise<void> {
  const { requirementId } = event;

  const requirement = await getRequirementById(requirementId);
  if (!requirement) {
    console.error(`[matchCacheRequirementWorker] requirement not found: ${requirementId}`);
    return;
  }

  // The invoking handlers only dispatch on active transitions; this guard keeps
  // a stale/interleaved invoke from resurrecting a since-closed requirement's
  // cache (the close path deletes it separately).
  if (requirement.status !== 'active') {
    console.log(
      `[matchCacheRequirementWorker] skipping non-active requirement ${requirementId} (status=${requirement.status})`
    );
    return;
  }

  try {
    await rebuildCacheForRequirement(requirement);
    console.log(`[matchCacheRequirementWorker] cache rebuilt for ${requirementId}`);
  } catch (cacheErr) {
    console.error(`[matchCache] Failed to build cache for requirement ${requirementId}:`, cacheErr);
    await putMatchCacheFailureMetric(requirementId);
  }
}
