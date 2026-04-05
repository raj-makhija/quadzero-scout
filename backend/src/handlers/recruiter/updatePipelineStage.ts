import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdatePipelineStageRequestSchema } from '../../lib/validation.js';
import { getShortlistEntry } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { getEffectiveStage, isValidTransition, transitionPipelineStage } from '../../lib/pipelineService.js';
import type { PipelineStage } from '../../types/index.js';

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

    const validation = validate(UpdatePipelineStageRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { stage, reason, metadata } = validation.data;

    const shortlistEntry = await getShortlistEntry(requirementId, candidateId);
    if (!shortlistEntry) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate is not shortlisted for this requirement', 404);
    }

    const currentStage = getEffectiveStage(shortlistEntry);

    if (currentStage === stage) {
      return error(ErrorCodes.VALIDATION_ERROR, `Candidate is already in stage: ${stage}`, 400);
    }

    if (!isValidTransition(currentStage, stage)) {
      return error(
        ErrorCodes.INVALID_STAGE_TRANSITION,
        `Cannot transition from '${currentStage}' to '${stage}'`,
        400
      );
    }

    // Build extra fields based on target stage
    const extraFields: Record<string, unknown> = {};
    if (metadata) {
      if (metadata.ctcLpa !== undefined) extraFields.offered_ctc_lpa = metadata.ctcLpa;
      if (metadata.joiningDate !== undefined) extraFields.expected_joining_date = metadata.joiningDate;
    }
    if (stage === 'rejected_by_client' || stage === 'candidate_withdrawn') {
      extraFields.rejection_reason = reason || '';
    }

    await transitionPipelineStage(
      requirementId, candidateId, currentStage, stage as PipelineStage,
      event.auth.userId, reason, extraFields
    );

    logAuditEvent(event.auth, event, {
      action: 'PIPELINE_STAGE_UPDATE',
      entityType: 'pipeline',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId, fromStage: currentStage, toStage: stage, reason },
    });

    return success({ updated: true, fromStage: currentStage, toStage: stage });
  } catch (err) {
    console.error('Error updating pipeline stage:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to update pipeline stage', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
