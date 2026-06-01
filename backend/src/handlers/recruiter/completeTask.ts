import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { completeTaskById, POOL_OWNER } from '../../lib/recruiterTasks.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'taskId is required', 400);
    }

    let body: { pool?: boolean } = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
      }
    }

    const ownerId = body.pool ? POOL_OWNER : event.auth.userId;
    await completeTaskById({ ownerId, taskId, completedBy: event.auth.userId });

    return success({ completed: true });
  } catch (err) {
    console.error('Error completing task:', err);
    return error(ErrorCodes.DYNAMODB_ERROR, 'Failed to complete task', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
