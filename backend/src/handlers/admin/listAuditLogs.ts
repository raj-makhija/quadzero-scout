import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { queryAuditLogsByUser, queryAuditLogsByAction } from '../../lib/dynamodb.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const params = event.queryStringParameters || {};
    const limit = Math.min(parseInt(params.limit || '50', 10), 100);
    const nextToken = params.nextToken;
    const userId = params.userId;
    const action = params.action;
    const startDate = params.startDate;
    const endDate = params.endDate;

    // If filtering by action + date, use ActionTypeIndex
    if (action && (startDate || endDate)) {
      // Query each date in range using ActionTypeIndex
      const date = startDate || endDate || new Date().toISOString().slice(0, 10);
      const result = await queryAuditLogsByAction(action, date, { limit, nextToken });
      return success({
        logs: result.logs,
        pagination: {
          count: result.logs.length,
          hasMore: !!result.nextToken,
          nextToken: result.nextToken,
        },
      });
    }

    // If filtering by userId, query by user PK
    if (userId) {
      const result = await queryAuditLogsByUser(userId, { limit, nextToken, startDate, endDate });
      return success({
        logs: result.logs,
        pagination: {
          count: result.logs.length,
          hasMore: !!result.nextToken,
          nextToken: result.nextToken,
        },
      });
    }

    return error(
      ErrorCodes.VALIDATION_ERROR,
      'At least one filter is required: userId, or action with startDate/endDate',
      400
    );
  } catch (err) {
    console.error('Error listing audit logs:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to list audit logs', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
