import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { deleteSavedSearch } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    // Get search ID from path parameters
    const searchId = event.pathParameters?.searchId;

    if (!searchId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Search ID is required', 400);
    }

    const recruiterId = event.auth.userId;

    await deleteSavedSearch(recruiterId, searchId);

    return success({ deleted: true });
  } catch (err) {
    console.error('Error deleting search:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to delete saved search',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
