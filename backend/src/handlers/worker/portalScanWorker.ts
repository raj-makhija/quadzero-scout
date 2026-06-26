/**
 * Scheduled Lambda worker that scans enabled job sources for new postings.
 * Triggered by EventBridge schedule: rate(1 day)
 * Gated by PORTAL_SCAN_ENABLED SSM kill-switch (default: false).
 */

import { config } from '../../lib/config.js';
import { getEnabledSources } from '../../lib/portalScan/jobSources.js';
import { getAdapter } from '../../lib/portalScan/adapters/index.js';
import { getSeenLogEntry, putSeenLogEntry } from '../../lib/portalScan/jobSourceSeenLog.js';

const SEEN_LOG_TTL_DAYS = 90;

export async function handler(): Promise<void> {
  if (!config.portalScan.enabled) {
    console.log('Portal scan is disabled (PORTAL_SCAN_ENABLED=false)');
    return;
  }

  const sources = await getEnabledSources();
  if (sources.length === 0) {
    console.log('Portal scan: no enabled sources');
    return;
  }

  let totalNew = 0;
  let totalSeen = 0;

  for (const source of sources) {
    const adapter = getAdapter(source.type);
    if (!adapter) {
      console.warn(`Portal scan: no adapter for type "${source.type}", skipping source ${source.source_id}`);
      continue;
    }

    try {
      const jobs = await adapter.fetchJobs(source);

      for (const job of jobs) {
        const existing = await getSeenLogEntry(job.sourceId, job.externalJobId);
        if (existing) {
          totalSeen++;
          continue;
        }

        const ttl = Math.floor(Date.now() / 1000) + SEEN_LOG_TTL_DAYS * 24 * 60 * 60;
        try {
          await putSeenLogEntry(job.sourceId, job.externalJobId, ttl);
          totalNew++;
        } catch (err) {
          // ConditionalCheckFailedException = concurrent invocation claimed this entry
          if ((err as Error).name === 'ConditionalCheckFailedException') {
            totalSeen++;
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      console.error(`Portal scan: error processing source ${source.source_id}:`, err);
    }
  }

  console.log(`Portal scan: done — ${totalNew} new, ${totalSeen} already-seen`);
}
