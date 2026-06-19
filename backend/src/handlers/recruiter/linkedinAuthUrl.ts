import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { savePendingLinkedInState } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { config } from '../../lib/config.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const recruiterId = event.auth.userId;

    // Guard against an unconfigured environment: if the LinkedIn OAuth app
    // credentials are not provisioned (SSM params resolve to empty), building
    // an auth URL with an empty client_id sends the recruiter to LinkedIn's
    // "You need to pass the client_id parameter" error page. Fail loudly here
    // with an actionable message instead.
    if (!config.linkedin.clientId || !config.linkedin.redirectUri) {
      console.error(
        'LinkedIn OAuth is not configured: LINKEDIN_CLIENT_ID and/or LINKEDIN_REDIRECT_URI are empty for this stage.'
      );
      return error(
        ErrorCodes.INTERNAL_ERROR,
        'LinkedIn integration is not configured for this environment. Please contact your administrator.',
        503
      );
    }

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
