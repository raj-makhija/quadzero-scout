import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { listActiveTasksForRecruiter } from '../../lib/recruiterTasks.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const tasks = await listActiveTasksForRecruiter(event.auth.userId);
    return success({ tasks });
  } catch (err) {
    console.error('Error listing recruiter tasks:', err);
    return error(ErrorCodes.DYNAMODB_ERROR, 'Failed to list tasks', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
