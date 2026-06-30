import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { listAllJobSources } from '../../lib/dynamodb.js';

async function handleRequest(_event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const sources = await listAllJobSources();
    return success({ sources });
  } catch (err) {
    console.error('Error listing job sources:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to list job sources', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
