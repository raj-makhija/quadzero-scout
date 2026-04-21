import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { queryAuditLogsByUserWithSummary } from '../../lib/dynamodb.js';
import { getDateRangeForPeriod, isValidPeriod } from '../../lib/dateUtils.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const params = event.queryStringParameters || {};

    const periodParam = params.period || 'today';
    if (!isValidPeriod(periodParam)) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid period. Must be: today, previousDay, week, month, year', 400);
    }

    const { startDate, endDate } = getDateRangeForPeriod(periodParam);
    const detail = params.detail === 'true';
    const limit = Math.min(parseInt(params.limit || '100', 10), 100);
    const nextToken = params.nextToken;

    // For day/week default to detail, for month/year default to summary only
    const summaryOnly = !detail && (periodParam === 'month' || periodParam === 'year');

    const result = await queryAuditLogsByUserWithSummary(event.auth.userId, {
      startDate,
      endDate,
      summaryOnly,
      limit,
      nextToken,
    });

    return success({
      summary: result.summary,
      logs: result.logs,
      period: periodParam,
      startDate,
      endDate,
      pagination: {
        count: result.logs.length,
        hasMore: !!result.nextToken,
        nextToken: result.nextToken,
      },
    });
  } catch (err) {
    console.error('Error fetching recruiter activity:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch activity data', 500);
  }
}

export const handler = withAuth(['recruiter', 'admin'], handleRequest);
