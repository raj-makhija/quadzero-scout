import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRequirementById, dismissDiscoveredRequirement } from '../../lib/dynamodb.js';
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

    const existing = await getRequirementById(requirementId);
    if (!existing) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    if (existing.status !== 'discovered') {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        'Requirement is not in discovered status',
        422
      );
    }

    try {
      await dismissDiscoveredRequirement(requirementId);
    } catch (dbErr) {
      if ((dbErr as Error).name === 'ConditionalCheckFailedException') {
        return error(
          ErrorCodes.VALIDATION_ERROR,
          'Requirement is no longer in discovered status',
          409
        );
      }
      throw dbErr;
    }

    logAuditEvent(event.auth, event, {
      action: 'REQUIREMENT_DISMISS',
      entityType: 'requirement',
      entityId: requirementId,
      metadata: { requirementId },
    });

    return success({ requirementId, status: 'closed_on_hold' });
  } catch (err) {
    console.error('Error dismissing discovered requirement:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to dismiss requirement',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
