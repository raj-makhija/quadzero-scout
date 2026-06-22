import { rebuildAllMatchCaches, auditMatchCacheHealth } from '../../lib/matchCacheService.js';

export async function handler(): Promise<void> {
  console.log('[matchCacheRebuildWorker] full rebuild started');
  // Audit BEFORE the rebuild so any pre-existing drift (empty caches, large
  // deltas) is surfaced in logs (ticket #447). Best-effort — an audit failure
  // must not block the authoritative rebuild.
  try {
    await auditMatchCacheHealth();
  } catch (auditErr) {
    console.error('[matchCacheRebuildWorker] cache-health audit failed:', auditErr);
  }
  await rebuildAllMatchCaches();
  console.log('[matchCacheRebuildWorker] full rebuild complete');
}
