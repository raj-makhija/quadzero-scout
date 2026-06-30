/**
 * Scheduled Lambda worker that scans enabled job sources for new postings.
 * Triggered by EventBridge schedule: rate(1 day)
 * Gated by PORTAL_SCAN_ENABLED SSM kill-switch (default: false).
 */

import { config } from '../../lib/config.js';
import { getEnabledSources } from '../../lib/portalScan/jobSources.js';
import { getAdapter } from '../../lib/portalScan/adapters/index.js';
import { getSeenLogEntry, putSeenLogEntry } from '../../lib/portalScan/jobSourceSeenLog.js';
import { saveRequirement } from '../../lib/dynamodb.js';
import { v4 as uuidv4 } from 'uuid';
import { LLMJDOutputSchema } from '../../types/index.js';

const SEEN_LOG_TTL_DAYS = 90;

// Empty stub — LLM parse is deferred to promotion (#502)
const EMPTY_PARSED_CRITERIA = LLMJDOutputSchema.parse({
  mustHaveSkills: [],
  goodToHaveSkills: [],
  minExperience: null,
  maxExperience: null,
  seniority: [],
  location: null,
});

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
        } catch (err) {
          // ConditionalCheckFailedException = concurrent invocation claimed this entry
          if ((err as Error).name === 'ConditionalCheckFailedException') {
            totalSeen++;
            continue;
          }
          throw err;
        }

        totalNew++;

        // Create a discovered requirement after the seen-log entry is committed
        try {
          const now = new Date().toISOString();
          await saveRequirement({
            requirement_id: uuidv4(),
            recruiter_id: '',
            client_name: '',
            client_name_lower: '',
            engagement_model: '',
            payroll: '',
            jd_text: job.rawDescription,
            job_title: job.title,
            parsed_criteria: EMPTY_PARSED_CRITERIA,
            status: 'discovered',
            origin: 'portal-scan',
            source_id: job.sourceId,
            source_url: job.url,
            source_company: job.company,
            source_location: job.location,
            posted_at: job.postedAt,
            notify_recruiter_ids: [],
            created_at: now,
            last_updated: now,
          });
        } catch (createErr) {
          console.error(`Portal scan: failed to create requirement for job ${job.externalJobId}:`, createErr);
        }
      }
    } catch (err) {
      console.error(`Portal scan: error processing source ${source.source_id}:`, err);
    }
  }

  console.log(`Portal scan: done — ${totalNew} new, ${totalSeen} already-seen`);
}
