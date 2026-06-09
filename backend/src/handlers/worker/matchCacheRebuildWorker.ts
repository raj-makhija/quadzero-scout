import { rebuildAllMatchCaches } from '../../lib/matchCacheService.js';

export async function handler(): Promise<void> {
  console.log('[matchCacheRebuildWorker] full rebuild started');
  await rebuildAllMatchCaches();
  console.log('[matchCacheRebuildWorker] full rebuild complete');
}
