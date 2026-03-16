import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { deleteShortlist } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    const candidateId = event.pathParameters?.candidateId;

    if (!requirementId || !candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId and candidateId are required', 400);
    }

    await deleteShortlist(requirementId, candidateId);

    logAuditEvent(event.auth, event, {
      action: 'SHORTLIST_REMOVE',
      entityType: 'shortlist',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId },
    });

    return success({ success: true });
  } catch (err) {
    console.error('Error removing shortlist:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to remove shortlist',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
