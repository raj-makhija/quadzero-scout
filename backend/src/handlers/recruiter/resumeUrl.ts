import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getCandidateById } from '../../lib/dynamodb.js';
import { generateDownloadUrl } from '../../lib/s3.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

interface ResumeUrlReadyResponse {
  status: 'ready';
  downloadUrl: string;
  fileName: string;
  expiresIn: number;
  isFormatted: boolean;
}

interface ResumeUrlProcessingResponse {
  status: 'processing';
}

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const candidateId = event.pathParameters?.candidateId;

    if (!candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Candidate ID is required', 400);
    }

    const candidate = await getCandidateById(candidateId);

    if (!candidate) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }

    if (!candidate.resume_s3_key) {
      return error(ErrorCodes.NOT_FOUND, 'No resume found for this candidate', 404);
    }

    // Check for cached formatted resume
    if (candidate.formatted_resume_s3_key) {
      try {
        const result = await generateDownloadUrl(candidate.formatted_resume_s3_key);
        const ext = candidate.formatted_resume_s3_key.endsWith('.pdf') ? 'pdf' : 'md';
        const response: ResumeUrlReadyResponse = {
          status: 'ready',
          downloadUrl: result.url,
          fileName: `${candidate.full_name.replace(/\s+/g, '_')}_resume.${ext}`,
          expiresIn: result.expiresIn,
          isFormatted: true,
        };
        return success(response);
      } catch (err) {
        console.warn('Cached formatted resume not found, triggering regeneration:', err);
      }
    }

    // No cached version — invoke worker Lambda asynchronously
    console.log('Triggering async formatting for candidate:', candidateId);
    await invokeLambdaAsync(config.lambda.formatResumeWorkerName, { candidateId });

    const response: ResumeUrlProcessingResponse = {
      status: 'processing',
    };
    return success(response);
  } catch (err) {
    console.error('Error generating resume URL:', err);
    return error(
      ErrorCodes.S3_ERROR,
      'Failed to generate resume download URL',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
