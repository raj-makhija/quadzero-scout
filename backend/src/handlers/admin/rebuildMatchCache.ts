import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { rebuildAllMatchCaches } from '../../lib/matchCacheService.js';

async function handleRequest(_event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    await rebuildAllMatchCaches();
    return success({ rebuilt: true });
  } catch (err) {
    console.error('[adminRebuildMatchCache] rebuild failed:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to rebuild match cache', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
