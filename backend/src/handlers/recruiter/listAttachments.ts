import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { listAttachments } from '../../lib/dynamodb.js';

async function handleRequest(event: AuthenticatedEvent) {
  const candidateId = event.pathParameters?.candidateId;
  if (!candidateId) {
    return error(ErrorCodes.VALIDATION_ERROR, 'candidateId is required', 400);
  }

  try {
    const items = await listAttachments(candidateId);
    const attachments = items.map((item) => ({
      attachmentId: item.attachment_id,
      candidateId: item.candidate_id,
      fileName: item.filename,
      contentType: item.content_type,
      fileSize: item.file_size,
      tag: item.tag,
      uploadedBy: item.uploaded_by,
      uploadedByEmail: item.uploaded_by_email,
      uploadedAt: item.uploaded_at,
    }));
    return success({ attachments });
  } catch (err) {
    console.error('Failed to list attachments:', err);
    return error(ErrorCodes.DYNAMODB_ERROR, 'Failed to list attachments', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
