import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getUsersByStatus } from '../../lib/dynamodb.js';

async function handleRequest(_event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const [approvedRecruiters, admins] = await Promise.all([
      getUsersByStatus('approved', 'recruiter'),
      getUsersByStatus('approved', 'admin'),
    ]);

    const recruiters = [...approvedRecruiters, ...admins].map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name || user.email,
    }));

    // Sort by name
    recruiters.sort((a, b) => a.name.localeCompare(b.name));

    return success({ recruiters });
  } catch (err) {
    console.error('Error listing approved recruiters:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to list recruiters', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
