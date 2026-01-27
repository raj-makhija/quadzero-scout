import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getSavedSearches } from '../../lib/dynamodb.js';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Extract recruiter ID from JWT (in production)
    const recruiterId = (event.requestContext as { authorizer?: { jwt?: { claims?: { sub?: string } } } })
      ?.authorizer?.jwt?.claims?.sub || `recruiter_${uuidv4()}`;

    const searches = await getSavedSearches(recruiterId);

    // Transform to API response format
    const response = {
      searches: searches.map((search) => ({
        searchId: search.searchId,
        name: search.name,
        criteria: search.criteria,
        lastRun: search.lastRun,
        resultCount: search.resultCount,
        createdAt: search.createdAt,
      })),
    };

    return success(response);
  } catch (err) {
    console.error('Error fetching searches:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to fetch saved searches',
      500,
      { message: (err as Error).message }
    );
  }
}
