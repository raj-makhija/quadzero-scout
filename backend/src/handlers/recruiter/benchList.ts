import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getBenchListCandidates } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    // Enforce internal-only access
    if (!event.auth.isInternal) {
      return error(ErrorCodes.FORBIDDEN, 'Bench list is only available to internal recruiters', 403);
    }

    const result = await getBenchListCandidates();

    const candidates = result.items.map((item) => ({
      candidateId: item.candidate_id,
      fullName: item.full_name,
      totalExperience: item.total_experience,
      location: item.location,
      roles: item.roles || [],
      availability: item.availability,
      lastScreenedAt: item.last_screened_at,
    }));

    return success({
      candidates,
      totalCount: candidates.length,
    });
  } catch (err) {
    console.error('Error generating bench list:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to generate bench list',
      500
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
