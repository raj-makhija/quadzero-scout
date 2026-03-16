import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateCandidateCtcRequestSchema } from '../../lib/validation.js';
import { updateCandidateCtc as updateCtcInDb } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.auth.isInternal) {
      return error(ErrorCodes.FORBIDDEN, 'Only internal recruiters can update candidate CTC', 403);
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

    const validation = validate(UpdateCandidateCtcRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { candidateId, expectedCtc, currentCtc } = validation.data;

    await updateCtcInDb(candidateId, expectedCtc, currentCtc);

    logAuditEvent(event.auth, event, {
      action: 'CANDIDATE_SCREEN',
      entityType: 'candidate',
      entityId: candidateId,
      metadata: { candidateId, field: 'ctc' },
    });

    return success({ candidateId, expectedCtc, currentCtc });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }
    console.error('Error updating candidate CTC:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to update candidate CTC', 500);
  }
}

export const handler = withAuth(['recruiter', 'admin'], handleRequest);
