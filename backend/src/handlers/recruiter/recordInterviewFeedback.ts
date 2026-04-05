import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, RecordInterviewFeedbackRequestSchema } from '../../lib/validation.js';
import { getShortlistEntry } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { getEffectiveStage, createPipelineActivity, transitionPipelineStage } from '../../lib/pipelineService.js';
import { updateShortlistPipelineStage } from '../../lib/dynamodb.js';

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

    const validation = validate(RecordInterviewFeedbackRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { round, rating, feedbackText, source, decision } = validation.data;

    const shortlistEntry = await getShortlistEntry(requirementId, candidateId);
    if (!shortlistEntry) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate is not shortlisted for this requirement', 404);
    }

    const currentStage = getEffectiveStage(shortlistEntry);
    if (currentStage !== 'interview_scheduled' && currentStage !== 'interview_completed') {
      return error(ErrorCodes.INVALID_STAGE_TRANSITION, `Cannot record interview feedback in stage: ${currentStage}`, 400);
    }

    // Record interview feedback activity
    await createPipelineActivity(requirementId, candidateId, 'interview_feedback', event.auth.userId, {
      round,
      rating,
      feedback_text: feedbackText,
      source,
      decision,
    });

    const now = new Date().toISOString();

    // Handle decision
    if (decision === 'reject') {
      await transitionPipelineStage(
        requirementId, candidateId, currentStage, 'rejected_by_client',
        event.auth.userId, `Rejected after interview round ${round}: ${feedbackText.slice(0, 200)}`,
        { rejection_reason: feedbackText.slice(0, 500), last_activity_at: now }
      );
    } else if (decision === 'proceed') {
      // Move to interview_completed
      await transitionPipelineStage(
        requirementId, candidateId, currentStage, 'interview_completed',
        event.auth.userId, `Interview round ${round} completed - proceeding`,
        { last_activity_at: now }
      );
    } else {
      // hold - just update activity timestamp
      await updateShortlistPipelineStage(requirementId, candidateId, currentStage, event.auth.userId, {
        last_activity_at: now,
      });
    }

    logAuditEvent(event.auth, event, {
      action: 'PIPELINE_INTERVIEW_FEEDBACK',
      entityType: 'pipeline',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId, round, rating, decision },
    });

    return success({ recorded: true, decision });
  } catch (err) {
    console.error('Error recording interview feedback:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to record interview feedback', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
