import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getSavedSearches } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const recruiterId = event.auth.userId;

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

export const handler = withAuth(['recruiter'], handleRequest);
