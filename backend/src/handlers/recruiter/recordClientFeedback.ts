import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, RecordClientFeedbackRequestSchema } from '../../lib/validation.js';
import { getShortlistEntry, updateShortlistPipelineStage } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { getEffectiveStage, createPipelineActivity, isValidTransition, transitionPipelineStage } from '../../lib/pipelineService.js';

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

    const validation = validate(RecordClientFeedbackRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { rating, feedbackText, round, source } = validation.data;

    const shortlistEntry = await getShortlistEntry(requirementId, candidateId);
    if (!shortlistEntry) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate is not shortlisted for this requirement', 404);
    }

    const currentStage = getEffectiveStage(shortlistEntry);

    // Record the feedback activity
    await createPipelineActivity(requirementId, candidateId, 'client_feedback', event.auth.userId, {
      rating,
      feedback_text: feedbackText,
      round: round ?? 0,
      source,
    });

    // Update denormalized fields on shortlist
    const now = new Date().toISOString();
    await updateShortlistPipelineStage(requirementId, candidateId, currentStage, event.auth.userId, {
      client_feedback_summary: feedbackText.slice(0, 200),
      client_feedback_rating: rating,
      last_activity_at: now,
    });

    // Auto-advance to client_reviewed if positive/neutral feedback and in submitted stage
    if ((currentStage === 'submitted_to_client' || currentStage === 'submitted') && rating !== 'negative') {
      if (isValidTransition(currentStage, 'client_reviewed')) {
        await transitionPipelineStage(
          requirementId, candidateId, currentStage, 'client_reviewed',
          event.auth.userId, 'Auto-advanced on positive client feedback'
        );
      }
    }

    // Auto-reject if negative feedback and in early stage
    if (rating === 'negative' && (currentStage === 'submitted_to_client' || currentStage === 'submitted' || currentStage === 'client_reviewed')) {
      await transitionPipelineStage(
        requirementId, candidateId, currentStage, 'rejected_by_client',
        event.auth.userId, feedbackText.slice(0, 200),
        { rejection_reason: feedbackText.slice(0, 500) }
      );
    }

    logAuditEvent(event.auth, event, {
      action: 'PIPELINE_CLIENT_FEEDBACK',
      entityType: 'pipeline',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId, rating, source },
    });

    return success({ recorded: true });
  } catch (err) {
    console.error('Error recording client feedback:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to record client feedback', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
