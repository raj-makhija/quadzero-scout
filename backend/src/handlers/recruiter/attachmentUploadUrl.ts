import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { GetAttachmentUploadUrlRequestSchema } from '../../types/index.js';
import { generateAttachmentUploadUrl } from '../../lib/s3.js';

async function handleRequest(event: AuthenticatedEvent) {
  const body = JSON.parse(event.body || '{}');
  const parsed = GetAttachmentUploadUrlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return error(ErrorCodes.VALIDATION_ERROR, 'Invalid request', 400, parsed.error.flatten());
  }

  const { candidateId, fileName, contentType, fileSize } = parsed.data;

  try {
    const result = await generateAttachmentUploadUrl(candidateId, fileName, contentType);
    return success({
      uploadUrl: result.url,
      s3Key: result.key,
      attachmentId: result.key.split('/').pop()!.split('-')[0],
      expiresIn: result.expiresIn,
      fileSize,
    });
  } catch (err) {
    console.error('Failed to generate attachment upload URL:', err);
    return error(ErrorCodes.S3_ERROR, 'Failed to generate upload URL', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
