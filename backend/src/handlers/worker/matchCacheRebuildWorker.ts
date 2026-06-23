import {
  rebuildMatchCachesForRequirements,
  auditMatchCacheHealth,
  REBUILD_CHUNK_SIZE,
} from '../../lib/matchCacheService.js';
import { getAllActiveRequirements, getRequirementById } from '../../lib/dynamodb.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import type { RequirementItem } from '../../types/index.js';

interface RebuildChunkEvent {
  requirementIds: string[];
}

export async function handler(event?: RebuildChunkEvent): Promise<void> {
  if (!event?.requirementIds) {
    // Orchestrator: run audit then fan out requirement IDs across chunk workers.
    console.log('[matchCacheRebuildWorker] full rebuild started');
    try {
      await auditMatchCacheHealth();
    } catch (auditErr) {
      console.error('[matchCacheRebuildWorker] cache-health audit failed:', auditErr);
    }

    const allReqs = await getAllActiveRequirements();
    if (allReqs.length === 0) {
      console.log('[matchCacheRebuildWorker] full rebuild complete');
      return;
    }

    const chunkCount = Math.ceil(allReqs.length / REBUILD_CHUNK_SIZE);
    for (let i = 0; i < allReqs.length; i += REBUILD_CHUNK_SIZE) {
      const ids = allReqs.slice(i, i + REBUILD_CHUNK_SIZE).map((r) => r.requirement_id);
      await invokeLambdaAsync(config.lambda.matchCacheRebuildWorkerName, { requirementIds: ids });
    }
    console.log(
      `[matchCacheRebuildWorker] ${allReqs.length} requirements dispatched in ${chunkCount} chunks`
    );
    return;
  }

  // Chunk worker: re-fetch requirements by ID and rebuild their caches.
  const reqs = (
    await Promise.all(event.requirementIds.map((id) => getRequirementById(id)))
  ).filter((r): r is RequirementItem => r !== null);

  await rebuildMatchCachesForRequirements(reqs);
  console.log(`[matchCacheRebuildWorker] chunk complete: ${reqs.length} requirements rebuilt`);
}
