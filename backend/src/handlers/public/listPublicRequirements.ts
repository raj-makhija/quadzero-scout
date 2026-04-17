import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getAllRequirementsPaginated } from '../../lib/dynamodb.js';
import { toPublicRequirement } from '../../lib/publicRequirementMapper.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const params = event.queryStringParameters || {};
    const limit = Math.min(Math.max(parseInt(params.limit || '20', 10) || 20, 1), 50);
    const offset = Math.max(parseInt(params.offset || '0', 10) || 0, 0);

    const result = await getAllRequirementsPaginated(limit, offset, 'active');

    const requirements = result.items.map(toPublicRequirement);

    return success({
      requirements,
      pagination: {
        count: requirements.length,
        total: result.total,
        hasMore: result.hasMore,
        offset,
      },
    });
  } catch (err) {
    console.error('Error listing public requirements:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to list requirements', 500);
  }
}
