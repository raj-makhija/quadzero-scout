import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRequirementById, getLinkedInToken, createLinkedInPostJob } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import type { LinkedInPostJobItem } from '../../types/index.js';

/**
 * Kicks off async generation of a LinkedIn post (text + infographic image). The
 * heavy work runs in linkedinGenerateWorker so it isn't bound by the 30s request
 * timeout; the client polls GET /linkedin/generate/{jobId} for the result.
 */
async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const recruiterId = event.auth.userId;
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId is required', 400);
    }

    const requirement = await getRequirementById(requirementId);
    if (!requirement) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    // Fail fast if the recruiter isn't connected (avoids a pointless generation).
    const token = await getLinkedInToken(recruiterId);
    if (!token?.access_token) {
      return error(ErrorCodes.VALIDATION_ERROR, 'LinkedIn not connected', 400);
    }

    if (!config.lambda.linkedinGenerateWorkerName) {
      return error(ErrorCodes.INTERNAL_ERROR, 'LinkedIn generation worker not configured', 500);
    }

    const jobId = `lipost_${uuidv4()}`;
    const now = new Date().toISOString();
    const job: LinkedInPostJobItem = {
      job_id: jobId,
      recruiter_id: recruiterId,
      requirement_id: requirementId,
      status: 'pending',
      created_at: now,
      updated_at: now,
      ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 1 day
    };

    await createLinkedInPostJob(job);
    await invokeLambdaAsync(config.lambda.linkedinGenerateWorkerName, { jobId });

    return success({ jobId });
  } catch (err) {
    console.error('Error starting LinkedIn post generation:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to start LinkedIn post generation', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
