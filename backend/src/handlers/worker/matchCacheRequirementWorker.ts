import { getRequirementById } from '../../lib/dynamodb.js';
import { rebuildCacheForRequirement } from '../../lib/matchCacheService.js';
import { putMatchCacheFailureMetric } from '../../lib/cloudwatchMetrics.js';

interface MatchCacheRequirementEvent {
  requirementId: string;
}

export async function handler(event: MatchCacheRequirementEvent): Promise<void> {
  const { requirementId } = event;

  const requirement = await getRequirementById(requirementId);
  if (!requirement) {
    console.warn(`[matchCacheRequirementWorker] requirement ${requirementId} not found, skipping`);
    return;
  }

  try {
    await rebuildCacheForRequirement(requirement);
    console.log(`[matchCacheRequirementWorker] cache rebuilt for requirement ${requirementId}`);
  } catch (err) {
    console.error(
      `[matchCacheRequirementWorker] Failed to build cache for requirement ${requirementId}:`,
      err
    );
    await putMatchCacheFailureMetric(requirementId);
  }
}
