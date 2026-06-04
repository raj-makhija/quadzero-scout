import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { validate, formatZodErrors, RestoreRequestSchema } from '../../lib/validation.js';
import { getManifest, createRestoreJob } from '../../lib/backup.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON', 400);
    }

    const validation = validate(RestoreRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { snapshotId } = validation.data;

    // Reject restore from a missing or incomplete (corrupt/partial) snapshot,
    // leaving prod data untouched.
    const manifest = await getManifest(snapshotId);
    if (!manifest) {
      return error(ErrorCodes.NOT_FOUND, 'Snapshot not found', 404);
    }
    if (manifest.status !== 'complete') {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        'Snapshot is incomplete and cannot be restored',
        400
      );
    }

    const jobId = `restore_${uuidv4()}`;
    await createRestoreJob(jobId, snapshotId, new Date());

    if (config.lambda.restoreWorkerName) {
      await invokeLambdaAsync(config.lambda.restoreWorkerName, { snapshotId, jobId });
      console.log('Triggered restore worker:', { snapshotId, jobId });
    } else {
      console.warn('RESTORE_WORKER_NAME not configured, job created but worker not invoked');
    }

    logAuditEvent(event.auth, event, {
      action: 'RESTORE_INITIATE',
      entityType: 'backup',
      entityId: snapshotId,
      metadata: { snapshotId, jobId },
    });

    return success({ jobId, snapshotId });
  } catch (err) {
    console.error('Error initiating restore:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to initiate restore', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
