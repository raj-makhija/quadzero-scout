import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getCandidateById } from '../../lib/dynamodb.js';
import { generateDownloadUrl, extractFileNameFromKey } from '../../lib/s3.js';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Get candidate ID from path parameters
    const candidateId = event.pathParameters?.candidateId;

    if (!candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Candidate ID is required', 400);
    }

    // Fetch candidate to get resume S3 key
    const candidate = await getCandidateById(candidateId);

    if (!candidate) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }

    if (!candidate.resume_s3_key) {
      return error(ErrorCodes.NOT_FOUND, 'No resume found for this candidate', 404);
    }

    // Generate pre-signed download URL
    const result = await generateDownloadUrl(candidate.resume_s3_key);

    const response = {
      downloadUrl: result.url,
      fileName: extractFileNameFromKey(candidate.resume_s3_key),
      expiresIn: result.expiresIn,
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
