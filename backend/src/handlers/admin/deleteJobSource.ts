import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { deleteJobSource } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const sourceId = event.pathParameters?.source_id;
    if (!sourceId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'source_id path parameter is required', 400);
    }

    try {
      await deleteJobSource(sourceId);
    } catch (err) {
      if ((err as Error).name === 'ConditionalCheckFailedException') {
        return error(ErrorCodes.NOT_FOUND, 'Job source not found', 404);
      }
      throw err;
    }

    return success({});
  } catch (err) {
    console.error('Error deleting job source:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to delete job source', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
