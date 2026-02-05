import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getUsersByStatus } from '../../lib/dynamodb.js';

async function handleRequest(_event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const pendingRecruiters = await getUsersByStatus('pending', 'recruiter');

    // Don't expose password hashes
    const sanitizedUsers = pendingRecruiters.map(({ passwordHash, ...user }) => user);

    return success({ recruiters: sanitizedUsers, count: sanitizedUsers.length });
  } catch (err) {
    console.error('Error listing pending recruiters:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to list pending recruiters', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
