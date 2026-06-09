import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { createCloneJob } from '../../lib/dynamodb.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import { CLONE_SOURCE_STAGE, normalizeCloneOptions } from '../../lib/cloneData.js';
import type { CloneJobItem } from '../../types/index.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    // Triple-defense guard #2 (API): the clone is never available on prod.
    if (config.stage === 'prod') {
      return error(ErrorCodes.FORBIDDEN, 'Clone Prod Data is not available on production', 403);
    }

    // The worker Lambda must exist; otherwise fail rather than orphan a job.
    if (!config.lambda.cloneDataWorkerName) {
      console.error('CLONE_DATA_WORKER_NAME not configured');
      return error(ErrorCodes.INTERNAL_ERROR, 'Clone worker is not configured', 500);
    }

    // Target is ALWAYS derived server-side from the current stage. Any
    // client-supplied `target` in the request body is ignored.
    const target = config.stage;

    // Per-run options (which datasets to include, dry-run, etc.) come from the
    // request body; normalized to safe defaults (full clone if absent).
    let parsedBody: unknown = {};
    try {
      parsedBody = event.body ? JSON.parse(event.body) : {};
    } catch {
      parsedBody = {};
    }
    const options = normalizeCloneOptions((parsedBody as { options?: unknown }).options);

    const jobId = `clone_${uuidv4()}`;
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    const job: CloneJobItem = {
      job_id: jobId,
      status: 'processing',
      source: CLONE_SOURCE_STAGE,
      target,
      options,
      created_by: event.auth.userId,
      created_at: now,
      updated_at: now,
      tables: [],
      s3: { copied: 0, failed: 0 },
      ttl,
    };

    await createCloneJob(job);

    await invokeLambdaAsync(config.lambda.cloneDataWorkerName, { jobId, target, options });
    console.log('Triggered clone data worker for job:', jobId);

    logAuditEvent(event.auth, event, {
      action: 'CLONE_DATA_START',
      entityType: 'config',
      entityId: jobId,
      metadata: { jobId, source: CLONE_SOURCE_STAGE, target, options },
    });

    return success({ jobId });
  } catch (err) {
    console.error('Error starting clone data job:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to start clone', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
