import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getCandidateById } from '../../lib/dynamodb.js';
import { generateDownloadUrl } from '../../lib/s3.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

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

    const result = await generateDownloadUrl(candidate.resume_s3_key);
    
    // Extract original filename from S3 key
    const s3Key = candidate.resume_s3_key;
    const parts = s3Key.split('/');
    const fullName = parts[parts.length - 1];
    const match = fullName.match(/^[a-f0-9-]+-(.+)$/);
    const originalFilename = match ? match[1] : fullName;

    return success({
      downloadUrl: result.url,
      fileName: originalFilename,
      expiresIn: result.expiresIn,
    });
  } catch (err) {
    console.error('Error generating original resume URL:', err);
    return error(
      ErrorCodes.S3_ERROR,
      'Failed to generate resume download URL',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
