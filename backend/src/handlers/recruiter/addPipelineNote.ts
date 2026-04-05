import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, AddPipelineNoteRequestSchema } from '../../lib/validation.js';
import { getShortlistEntry, updateShortlistPipelineStage } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { getEffectiveStage, createPipelineActivity } from '../../lib/pipelineService.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    const candidateId = event.pathParameters?.candidateId;

    if (!requirementId || !candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId and candidateId are required', 400);
    }

    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const validation = validate(AddPipelineNoteRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { text, source } = validation.data;

    const shortlistEntry = await getShortlistEntry(requirementId, candidateId);
    if (!shortlistEntry) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate is not shortlisted for this requirement', 404);
    }

    // Record note activity
    const activity = await createPipelineActivity(requirementId, candidateId, 'note', event.auth.userId, {
      text,
      source,
    });

    // Update last activity timestamp
    const currentStage = getEffectiveStage(shortlistEntry);
    await updateShortlistPipelineStage(requirementId, candidateId, currentStage, event.auth.userId, {
      last_activity_at: new Date().toISOString(),
    });

    logAuditEvent(event.auth, event, {
      action: 'PIPELINE_NOTE_ADDED',
      entityType: 'pipeline',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId, source },
    });

    return success({ added: true, activityId: activity.activity_id });
  } catch (err) {
    console.error('Error adding pipeline note:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to add pipeline note', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
