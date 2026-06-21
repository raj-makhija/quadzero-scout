import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getLinkedInToken, saveLinkedInToken } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { config } from '../../lib/config.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const recruiterId = event.auth.userId;

    let body: { code?: string; state?: string };
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON body', 400);
    }

    const { code, state } = body;
    if (!code || !state) {
      return error(ErrorCodes.VALIDATION_ERROR, 'code and state are required', 400);
    }

    // Verify CSRF state
    const existing = await getLinkedInToken(recruiterId);
    if (!existing?.pending_state || existing.pending_state !== state) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid or expired state', 400);
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.linkedin.clientId,
        client_secret: config.linkedin.clientSecret,
        redirect_uri: config.linkedin.redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('LinkedIn token exchange failed:', errText);
      return error(ErrorCodes.INTERNAL_ERROR, 'LinkedIn token exchange failed', 502);
    }

    const tokenData = await tokenResponse.json() as { access_token: string; expires_in: number; scope: string };
    const accessToken = tokenData.access_token;

    // Resolve member URN via userinfo
    const userInfoResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoResponse.ok) {
      return error(ErrorCodes.INTERNAL_ERROR, 'Failed to resolve LinkedIn user info', 502);
    }

    const userInfo = await userInfoResponse.json() as { sub: string };
    const memberUrn = `urn:li:person:${userInfo.sub}`;

    const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

    await saveLinkedInToken({
      recruiter_id: recruiterId,
      access_token: accessToken,
      member_urn: memberUrn,
      scope: tokenData.scope,
      expires_at: expiresAt,
    });

    return success({ connected: true });
  } catch (err) {
    console.error('Error exchanging LinkedIn code:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'LinkedIn exchange failed', 500);
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
