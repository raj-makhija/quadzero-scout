import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRequirementById } from '../../lib/dynamodb.js';
import { toPublicRequirement } from '../../lib/publicRequirementMapper.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Requirement ID is required', 400);
    }

    const requirement = await getRequirementById(requirementId);
    if (!requirement || requirement.status !== 'active') {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    return success({ requirement: toPublicRequirement(requirement) });
  } catch (err) {
    console.error('Error getting public requirement:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to get requirement', 500);
  }
}
