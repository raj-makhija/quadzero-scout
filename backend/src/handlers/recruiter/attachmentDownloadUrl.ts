import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getAttachment } from '../../lib/dynamodb.js';
import { generateAttachmentDownloadUrl } from '../../lib/s3.js';

async function handleRequest(event: AuthenticatedEvent) {
  const candidateId = event.pathParameters?.candidateId;
  const attachmentId = event.pathParameters?.attachmentId;
  if (!candidateId || !attachmentId) {
    return error(ErrorCodes.VALIDATION_ERROR, 'candidateId and attachmentId are required', 400);
  }

  try {
    const attachment = await getAttachment(candidateId, attachmentId);
    if (!attachment) {
      return error(ErrorCodes.NOT_FOUND, 'Attachment not found', 404);
    }

    const result = await generateAttachmentDownloadUrl(attachment.s3_key, attachment.filename);
    return success({
      downloadUrl: result.url,
      fileName: attachment.filename,
      expiresIn: result.expiresIn,
    });
  } catch (err) {
    console.error('Failed to generate attachment download URL:', err);
    return error(ErrorCodes.S3_ERROR, 'Failed to generate download URL', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
