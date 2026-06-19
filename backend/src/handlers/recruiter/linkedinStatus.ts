import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getLinkedInToken } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

const REFRESH_WINDOW_SECONDS = 7 * 24 * 60 * 60; // 7 days

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const recruiterId = event.auth.userId;
    const token = await getLinkedInToken(recruiterId);

    if (!token?.access_token || !token.expires_at) {
      return success({ connected: false, needsReconnect: false });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = token.expires_at;

    if (nowSeconds >= expiresAt) {
      return success({ connected: false, needsReconnect: true });
    }

    const expiresAtIso = new Date(expiresAt * 1000).toISOString();
    const needsReconnect = (expiresAt - nowSeconds) < REFRESH_WINDOW_SECONDS;

    return success({ connected: true, expiresAt: expiresAtIso, needsReconnect });
  } catch (err) {
    console.error('Error fetching LinkedIn status:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch LinkedIn status', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
