import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRecentProfiles } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const params = event.queryStringParameters || {};
    const limit = params.limit ? Math.min(parseInt(params.limit, 10), 50) : 10;

    const items = await getRecentProfiles(limit);

    const profiles = items.map((item) => ({
      candidateId: item.candidate_id,
      fullName: item.full_name,
      primarySkills: item.primary_skills || [],
      totalExperience: item.total_experience,
      seniority: item.seniority,
      location: item.location,
      lastUpdated: item.last_updated,
      createdAt: item.created_at,
    }));

    return success({ profiles });
  } catch (err) {
    console.error('Error listing recent profiles:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to list recent profiles',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
