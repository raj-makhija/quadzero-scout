import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateCandidateCustomFieldsRequestSchema } from '../../lib/validation.js';
import { getCandidateById, updateCandidateCustomFields as updateInDb } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { updateCacheForCandidates } from '../../lib/matchCacheService.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const validation = validate(UpdateCandidateCustomFieldsRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { candidateId, customFields } = validation.data;

    const candidate = await getCandidateById(candidateId);
    if (!candidate) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }

    const merged = { ...(candidate.custom_fields || {}), ...customFields };
    await updateInDb(candidateId, merged);

    // Re-score the candidate into each active requirement's cache with the new
    // field values. Non-fatal — a cache failure must not fail the edit.
    try {
      await updateCacheForCandidates([{ ...candidate, custom_fields: merged }]);
    } catch (cacheErr) {
      console.error('Failed to update match-cache after custom-field update:', cacheErr);
    }

    logAuditEvent(event.auth, event, {
      action: 'CANDIDATE_SCREEN',
      entityType: 'candidate',
      entityId: candidateId,
      metadata: { candidateId, field: 'customFields' },
    });

    return success({ candidateId, customFields: merged });
  } catch (err) {
    console.error('Error updating candidate custom fields:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to update candidate custom fields', 500);
  }
}

export const handler = withAuth(['recruiter', 'admin'], handleRequest);
