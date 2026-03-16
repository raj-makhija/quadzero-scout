import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { queryAuditLogsByEntity } from '../../lib/dynamodb.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const entityType = event.pathParameters?.entityType;
    const entityId = event.pathParameters?.entityId;

    if (!entityType || !entityId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Entity type and ID are required', 400);
    }

    const validEntityTypes = ['session', 'search', 'candidate', 'shortlist', 'requirement', 'client', 'user', 'config'];
    if (!validEntityTypes.includes(entityType)) {
      return error(ErrorCodes.VALIDATION_ERROR, `Invalid entity type. Must be one of: ${validEntityTypes.join(', ')}`, 400);
    }

    const params = event.queryStringParameters || {};
    const limit = Math.min(parseInt(params.limit || '50', 10), 100);
    const nextToken = params.nextToken;

    const result = await queryAuditLogsByEntity(entityType, entityId, { limit, nextToken });

    return success({
      logs: result.logs,
      pagination: {
        count: result.logs.length,
        hasMore: !!result.nextToken,
        nextToken: result.nextToken,
      },
    });
  } catch (err) {
    console.error('Error fetching entity audit logs:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch entity audit logs', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
