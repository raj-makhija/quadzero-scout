import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { deleteSavedSearch } from '../../lib/dynamodb.js';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Get search ID from path parameters
    const searchId = event.pathParameters?.searchId;

    if (!searchId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Search ID is required', 400);
    }

    // Extract recruiter ID from JWT (in production)
    const recruiterId = (event.requestContext as { authorizer?: { jwt?: { claims?: { sub?: string } } } })
      ?.authorizer?.jwt?.claims?.sub || `recruiter_${uuidv4()}`;

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
