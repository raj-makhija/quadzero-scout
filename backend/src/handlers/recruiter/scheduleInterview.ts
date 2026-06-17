import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ScheduleInterviewRequestSchema } from '../../lib/validation.js';
import { getShortlistEntry, updateShortlistPipelineStage } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { getEffectiveStage, createPipelineActivity, transitionPipelineStage } from '../../lib/pipelineService.js';
import { safeGenerateTask, safeResolveTask, buildRecordInterviewFeedbackTask, buildPreInterviewReminderTask, loadTaskContext, compositeEntityRef } from '../../lib/recruiterTasks.js';

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

    const validation = validate(ScheduleInterviewRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { round, interviewType, scheduledAt, durationMinutes, interviewerName, interviewerEmail, locationOrLink, notes } = validation.data;

    const shortlistEntry = await getShortlistEntry(requirementId, candidateId);
    if (!shortlistEntry) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate is not shortlisted for this requirement', 404);
    }

    const currentStage = getEffectiveStage(shortlistEntry);

    // Must be at least client_reviewed or already interview_scheduled to schedule
    const validStagesForScheduling = ['client_reviewed', 'interview_scheduled', 'interview_completed'];
    if (!validStagesForScheduling.includes(currentStage)) {
      return error(ErrorCodes.INVALID_STAGE_TRANSITION, `Cannot schedule interview in stage: ${currentStage}. Must be client_reviewed or later.`, 400);
    }

    // Record interview scheduled activity
    await createPipelineActivity(requirementId, candidateId, 'interview_scheduled', event.auth.userId, {
      round,
      interview_type: interviewType,
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes,
      interviewer_name: interviewerName,
      interviewer_email: interviewerEmail,
      location_or_link: locationOrLink,
      notes,
    });

    // Update shortlist with interview info
    const currentRoundCount = shortlistEntry.interview_round_count || 0;
    const extraFields: Record<string, unknown> = {
      next_interview_at: scheduledAt,
      interview_round_count: Math.max(currentRoundCount, round),
      last_activity_at: new Date().toISOString(),
    };

    // Advance to interview_scheduled if not already
    if (currentStage !== 'interview_scheduled') {
      await transitionPipelineStage(
        requirementId, candidateId, currentStage, 'interview_scheduled',
        event.auth.userId, `Interview round ${round} scheduled`,
        extraFields
      );
    } else {
      await updateShortlistPipelineStage(requirementId, candidateId, currentStage, event.auth.userId, extraFields);
    }

    // Scheduling resolves the "schedule interview" task and queues both a
    // pre-interview reminder (due the morning of the interview day, or one
    // hour before, whichever is earlier) and the "record interview feedback"
    // task due one hour after the interview.
    await safeResolveTask({
      entityRef: compositeEntityRef(requirementId, candidateId),
      type: 'schedule_interview',
      completedBy: event.auth.userId,
    });
    const taskContext = await loadTaskContext(requirementId, candidateId);
    const taskArgs = {
      ownerId: event.auth.userId,
      requirementId,
      candidateId,
      context: taskContext,
      now: new Date(),
      scheduledAt,
    };
    await safeGenerateTask(buildPreInterviewReminderTask(taskArgs));
    await safeGenerateTask(buildRecordInterviewFeedbackTask(taskArgs));

    logAuditEvent(event.auth, event, {
      action: 'PIPELINE_INTERVIEW_SCHEDULED',
      entityType: 'pipeline',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId, round, interviewType, scheduledAt },
    });

    return success({ scheduled: true, round });
  } catch (err) {
    console.error('Error scheduling interview:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to schedule interview', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
