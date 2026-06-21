import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getLinkedInPostJob } from '../../lib/dynamodb.js';
import { generateDownloadUrl } from '../../lib/s3.js';

/**
 * Poll endpoint for async LinkedIn post generation (#442). Returns the job status;
 * when done, includes the post text and a presigned URL for the generated image.
 */
async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const jobId = event.pathParameters?.jobId;
    if (!jobId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'jobId is required', 400);
    }

    const job = await getLinkedInPostJob(jobId);
    // Only the recruiter who started the job may read it (404, not 403, to avoid leaking existence).
    if (!job || job.recruiter_id !== event.auth.userId) {
      return error(ErrorCodes.NOT_FOUND, 'Job not found', 404);
    }

    if (job.status === 'done') {
      const imageUrl = job.image_s3_key ? (await generateDownloadUrl(job.image_s3_key)).url : '';
      return success({ status: job.status, text: job.text || '', hashtags: job.hashtags || '', imageUrl });
    }
    if (job.status === 'failed') {
      return success({ status: job.status, error: job.error || 'Generation failed' });
    }
    return success({ status: job.status });
  } catch (err) {
    console.error('Error fetching LinkedIn post job status:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch generation status', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
