import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getDiscoveredRequirements } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  _event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const items = await getDiscoveredRequirements();

    const requirements = items.map((item) => ({
      requirementId: item.requirement_id,
      title: item.job_title ?? null,
      sourceCompany: item.source_company ?? null,
      sourceUrl: item.source_url ?? null,
      location: item.source_location ?? null,
      postedAt: item.posted_at ?? null,
      createdAt: item.created_at,
    }));

    return success({ requirements });
  } catch (err) {
    console.error('Error listing discovered requirements:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to list discovered requirements',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
