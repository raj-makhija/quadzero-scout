import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { releaseScreeningLockByToken } from '../../lib/dynamodb.js';

/**
 * Public endpoint for sendBeacon-based lock release.
 * Used when the browser tab/window is closing and auth headers can't be sent.
 * Secured by requiring the lock_token (random UUID) that was returned at acquire time.
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: { candidateId?: string; lockToken?: string };
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const { candidateId, lockToken } = body;
    if (!candidateId || !lockToken) {
      return error(ErrorCodes.VALIDATION_ERROR, 'candidateId and lockToken are required', 400);
    }

    try {
      await releaseScreeningLockByToken(candidateId, lockToken);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        // Lock already released or token mismatch — idempotent success
        return success({ released: true });
      }
      throw err;
    }

    return success({ released: true });
  } catch (err) {
    console.error('Error releasing screening lock via beacon:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to release screening lock',
      500
    );
  }
}
