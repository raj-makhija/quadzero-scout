import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { SaveAttachmentRequestSchema } from '../../types/index.js';
import { saveAttachment, listAttachments } from '../../lib/dynamodb.js';
import { safeResolveMandatoryDocsTasks } from '../../lib/recruiterTasks.js';

/** Canonical mandatory-document tags (case-sensitive, per ticket #363). */
const MANDATORY_TAGS = new Set(['PAN', 'Aadhaar']);

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

    // If a mandatory document was just uploaded and both PAN + Aadhaar are now on
    // file, auto-resolve any active get_mandatory_documents task(s) for the
    // candidate (created when shortlisted with bypassDocumentCheck). Best-effort:
    // never let this check or its task resolution block the attachment save.
    if (MANDATORY_TAGS.has(tag)) {
      try {
        const attachments = await listAttachments(candidateId);
        const hasPan = attachments.some((a) => a.tag === 'PAN');
        const hasAadhaar = attachments.some((a) => a.tag === 'Aadhaar');
        if (hasPan && hasAadhaar) {
          await safeResolveMandatoryDocsTasks({ candidateId, completedBy: event.auth.userId });
        }
      } catch (err) {
        console.error('Failed to auto-resolve mandatory-docs task after upload:', err);
      }
    }

    return success({ saved: true, attachmentId });
  } catch (err) {
    console.error('Failed to save attachment:', err);
    return error(ErrorCodes.DYNAMODB_ERROR, 'Failed to save attachment metadata', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
