import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getRestoreJob } from '../../lib/backup.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const jobId = event.pathParameters?.jobId;
    if (!jobId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'jobId is required', 400);
    }

    const job = await getRestoreJob(jobId);
    if (!job) {
      return error(ErrorCodes.NOT_FOUND, 'Restore job not found', 404);
    }

    return success({
      jobId: job.jobId,
      snapshotId: job.snapshotId,
      status: job.status,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      tablesRestored: job.tablesRestored,
      itemsRestored: job.itemsRestored,
      s3ObjectsRestored: job.s3ObjectsRestored,
      error: job.error,
    });
  } catch (err) {
    console.error('Error fetching restore status:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch restore status', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
