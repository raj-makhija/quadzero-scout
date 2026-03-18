import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRecentProfiles } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const params = event.queryStringParameters || {};
    const limit = params.limit ? Math.min(parseInt(params.limit, 10), 100) : 10;

    // Decode pagination key if provided
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    if (params.lastEvaluatedKey) {
      try {
        lastEvaluatedKey = JSON.parse(
          Buffer.from(params.lastEvaluatedKey, 'base64').toString()
        );
      } catch {
        return error(ErrorCodes.VALIDATION_ERROR, 'Invalid pagination key', 400);
      }
    }

    const result = await getRecentProfiles(limit, lastEvaluatedKey);

    const profiles = result.items.map((item) => ({
      candidateId: item.candidate_id,
      fullName: item.full_name,
      primarySkills: item.primary_skills || [],
      totalExperience: item.total_experience,
      seniority: item.seniority,
      location: item.location,
      lastUpdated: item.last_updated,
      createdAt: item.created_at,
      lastScreenedAt: item.last_screened_at,
    }));

    // Encode next page key
    let encodedLastKey: string | undefined;
    if (result.lastKey) {
      encodedLastKey = Buffer.from(JSON.stringify(result.lastKey)).toString('base64');
    }

    return success({
      profiles,
      pagination: {
        count: profiles.length,
        hasMore: !!result.lastKey,
        lastEvaluatedKey: encodedLastKey,
      },
    });
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
