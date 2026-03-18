import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { queryAuditLogsByUser, queryAuditLogsByAction, queryAuditLogsByDate, getUserByEmail } from '../../lib/dynamodb.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const params = event.queryStringParameters || {};
    const limit = Math.min(parseInt(params.limit || '50', 10), 100);
    const nextToken = params.nextToken;
    const email = params.email;
    const action = params.action;
    const startDate = params.startDate;
    const endDate = params.endDate;

    // If filtering by email, look up user ID first
    if (email) {
      const user = await getUserByEmail(email.toLowerCase());
      if (!user) {
        return success({
          logs: [],
          pagination: { count: 0, hasMore: false },
        });
      }

      const result = await queryAuditLogsByUser(user.id, { limit, nextToken, startDate, endDate });
      return success({
        logs: result.logs,
        pagination: {
          count: result.logs.length,
          hasMore: !!result.nextToken,
          nextToken: result.nextToken,
        },
      });
    }

    // If filtering by action + date, use ActionTypeIndex
    if (action && (startDate || endDate)) {
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

    // If date filters provided (no action/email), use DateIndex
    if (startDate || endDate) {
      const today = new Date().toISOString().slice(0, 10);
      const result = await queryAuditLogsByDate(startDate || today, endDate || today, { limit, nextToken });
      return success({
        logs: result.logs,
        pagination: {
          count: result.logs.length,
          hasMore: !!result.nextToken,
          nextToken: result.nextToken,
        },
      });
    }

    // No filters — default to today's date via DateIndex
    const today = new Date().toISOString().slice(0, 10);
    const result = await queryAuditLogsByDate(today, today, { limit, nextToken });
    return success({
      logs: result.logs,
      pagination: {
        count: result.logs.length,
        hasMore: !!result.nextToken,
        nextToken: result.nextToken,
      },
    });
  } catch (err) {
    console.error('Error listing audit logs:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to list audit logs', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
