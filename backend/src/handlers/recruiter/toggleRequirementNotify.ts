import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ToggleRequirementNotifyRequestSchema } from '../../lib/validation.js';
import { getRequirementById, updateRequirementNotifyIds } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Requirement ID is required', 400);
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

    const validation = validate(ToggleRequirementNotifyRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { notify } = validation.data;
    const recruiterId = event.auth.userId;

    const requirement = await getRequirementById(requirementId);
    if (!requirement) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    const current = requirement.notify_recruiter_ids || [];

    let updated: string[];
    if (notify) {
      // Add recruiter (dedup)
      updated = current.includes(recruiterId) ? current : [...current, recruiterId];
    } else {
      // Remove recruiter
      updated = current.filter(id => id !== recruiterId);
    }

    await updateRequirementNotifyIds(requirementId, updated);

    logAuditEvent(event.auth, event, {
      action: 'REQUIREMENT_TOGGLE_NOTIFY',
      entityType: 'requirement',
      entityId: requirementId,
      metadata: { requirementId, subscribed: notify },
    });

    return success({
      requirementId,
      notify,
      notifyRecruiterIds: updated,
    });
  } catch (err) {
    console.error('Error toggling requirement notify:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to update notification preference',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
