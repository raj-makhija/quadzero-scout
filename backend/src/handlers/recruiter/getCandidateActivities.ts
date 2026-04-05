import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getPipelineActivities } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import type { PipelineActivitiesResponse } from '../../types/index.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    const candidateId = event.pathParameters?.candidateId;

    if (!requirementId || !candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId and candidateId are required', 400);
    }

    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '50', 10), 100);
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    if (event.queryStringParameters?.lastKey) {
      try {
        lastEvaluatedKey = JSON.parse(Buffer.from(event.queryStringParameters.lastKey, 'base64').toString());
      } catch {
        return error(ErrorCodes.VALIDATION_ERROR, 'Invalid lastKey parameter', 400);
      }
    }

    const result = await getPipelineActivities(requirementId, candidateId, limit, lastEvaluatedKey);

    const response: PipelineActivitiesResponse = {
      activities: result.items,
      pagination: {
        count: result.items.length,
        hasMore: !!result.lastEvaluatedKey,
        lastEvaluatedKey: result.lastEvaluatedKey
          ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
          : undefined,
      },
    };

    return success(response);
  } catch (err) {
    console.error('Error getting candidate activities:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to get candidate activities', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
