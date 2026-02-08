import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getCandidateById, updateCandidateFormattedResume } from '../../lib/dynamodb.js';
import { generateDownloadUrl, getObject, putObject } from '../../lib/s3.js';
import { formatResume } from '../../lib/llm/index.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

interface ResumeUrlResponse {
  downloadUrl: string;
  fileName: string;
  expiresIn: number;
  isFormatted: boolean;
}

function getContentType(s3Key: string): string {
  const extension = s3Key.toLowerCase().split('.').pop();
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc':
      return 'application/msword';
    default:
      return 'application/octet-stream';
  }
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
        const response: ResumeUrlResponse = {
          downloadUrl: result.url,
          fileName: `${candidate.full_name.replace(/\s+/g, '_')}_resume.md`,
          expiresIn: result.expiresIn,
          isFormatted: true,
        };
        return success(response);
      } catch (err) {
        // Formatted resume not found in S3, regenerate it
        console.warn('Cached formatted resume not found, regenerating:', err);
      }
    }

    // Generate formatted resume
    console.log('Generating formatted resume for candidate:', candidateId);

    // Fetch original resume from S3
    const documentBuffer = await getObject(candidate.resume_s3_key);
    const contentType = getContentType(candidate.resume_s3_key);

    // Format with LLM
    const { formattedContent, success: formatSuccess } = await formatResume(documentBuffer, contentType);

    if (!formatSuccess || !formattedContent) {
      return error(
        ErrorCodes.LLM_ERROR,
        'Failed to format resume. Please try again later.',
        500
      );
    }

    // Store formatted resume in S3
    const formattedS3Key = `formatted-resumes/${candidateId}.md`;
    await putObject(formattedS3Key, formattedContent, 'text/markdown');

    // Update candidate record with formatted resume key
    await updateCandidateFormattedResume(candidateId, formattedS3Key);

    // Generate download URL for formatted resume
    const result = await generateDownloadUrl(formattedS3Key);
    const response: ResumeUrlResponse = {
      downloadUrl: result.url,
      fileName: `${candidate.full_name.replace(/\s+/g, '_')}_resume.md`,
      expiresIn: result.expiresIn,
      isFormatted: true,
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
