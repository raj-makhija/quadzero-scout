import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getActiveSessionSettings } from '../../lib/dynamodb.js';

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const settings = await getActiveSessionSettings();
    return success({ sessionTimeoutSeconds: settings.sessionTimeoutSeconds });
  } catch (err) {
    console.error('Error getting session timeout:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to get session timeout', 500);
  }
}
