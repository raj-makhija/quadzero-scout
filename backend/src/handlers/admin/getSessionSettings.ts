import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getActiveSessionSettings } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(_event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const settings = await getActiveSessionSettings();
    return success({ settings });
  } catch (err) {
    console.error('Error getting session settings:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to get session settings', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
