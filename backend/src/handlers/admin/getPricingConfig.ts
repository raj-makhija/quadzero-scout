import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getActivePricingConfig } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(_event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const config = await getActivePricingConfig();
    return success({ config });
  } catch (err) {
    console.error('Error getting pricing config:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to get pricing config', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
