import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { savePendingLinkedInState } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { config } from '../../lib/config.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const recruiterId = event.auth.userId;
    const state = crypto.randomUUID();

    await savePendingLinkedInState(recruiterId, state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.linkedin.clientId,
      redirect_uri: config.linkedin.redirectUri,
      state,
      scope: 'openid profile w_member_social',
    });

    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
    return success({ authUrl });
  } catch (err) {
    console.error('Error generating LinkedIn auth URL:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to generate LinkedIn auth URL', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
