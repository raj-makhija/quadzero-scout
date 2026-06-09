import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getCloneJob } from '../../lib/dynamodb.js';
import { config } from '../../lib/config.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    if (config.stage === 'prod') {
      return error(ErrorCodes.FORBIDDEN, 'Clone Prod Data is not available on production', 403);
    }

    const jobId = event.pathParameters?.jobId;
    if (!jobId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'jobId is required', 400);
    }

    const job = await getCloneJob(jobId);
    if (!job) {
      return error(ErrorCodes.NOT_FOUND, 'Clone job not found', 404);
    }

    return success({
      jobId: job.job_id,
      status: job.status,
      source: job.source,
      target: job.target,
      options: job.options,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      tables: job.tables,
      s3: job.s3,
      error: job.error,
    });
  } catch (err) {
    console.error('Error fetching clone job status:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch clone status', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
