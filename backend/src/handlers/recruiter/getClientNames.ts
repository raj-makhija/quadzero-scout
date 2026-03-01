import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getDistinctClientNames } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await getDistinctClientNames();

    return success({
      clientNames: result.clientNames,
      endClients: result.endClients,
    });
  } catch (err) {
    console.error('Error fetching client names:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to fetch client names',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
