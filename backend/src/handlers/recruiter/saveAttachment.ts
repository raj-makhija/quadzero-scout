import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { SaveAttachmentRequestSchema } from '../../types/index.js';
import { saveAttachment } from '../../lib/dynamodb.js';

async function handleRequest(event: AuthenticatedEvent) {
  const body = JSON.parse(event.body || '{}');
  const parsed = SaveAttachmentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return error(ErrorCodes.VALIDATION_ERROR, 'Invalid request', 400, parsed.error.flatten());
  }

  const { candidateId, attachmentId, s3Key, fileName, contentType, fileSize, tag } = parsed.data;

  try {
    await saveAttachment({
      candidate_id: candidateId,
      attachment_id: attachmentId,
      s3_key: s3Key,
      filename: fileName,
      content_type: contentType,
      file_size: fileSize,
      tag,
      uploaded_by: event.auth.userId,
      uploaded_by_email: event.auth.email,
      uploaded_at: new Date().toISOString(),
    });
    return success({ saved: true, attachmentId });
  } catch (err) {
    console.error('Failed to save attachment:', err);
    return error(ErrorCodes.DYNAMODB_ERROR, 'Failed to save attachment metadata', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
