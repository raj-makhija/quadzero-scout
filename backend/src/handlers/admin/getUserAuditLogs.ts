import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { queryAuditLogsByUser } from '../../lib/dynamodb.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'User ID is required', 400);
    }

    const params = event.queryStringParameters || {};
    const limit = Math.min(parseInt(params.limit || '50', 10), 100);
    const nextToken = params.nextToken;
    const startDate = params.startDate;
    const endDate = params.endDate;

    const result = await queryAuditLogsByUser(userId, { limit, nextToken, startDate, endDate });

    return success({
      logs: result.logs,
      pagination: {
        count: result.logs.length,
        hasMore: !!result.nextToken,
        nextToken: result.nextToken,
      },
    });
  } catch (err) {
    console.error('Error fetching user audit logs:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch user audit logs', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
