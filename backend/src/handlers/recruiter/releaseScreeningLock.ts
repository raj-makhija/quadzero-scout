import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ReleaseScreeningLockRequestSchema } from '../../lib/validation.js';
import { releaseScreeningLock, releaseScreeningLockByToken } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const validation = validate(ReleaseScreeningLockRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { candidateId, lockToken } = validation.data;

    try {
      if (lockToken) {
        // Token-based release (used by sendBeacon where auth headers aren't available)
        await releaseScreeningLockByToken(candidateId, lockToken);
      } else {
        // Standard auth-based release
        await releaseScreeningLock(candidateId, event.auth.userId);
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        // Lock already released or held by someone else — idempotent success
        return success({ released: true });
      }
      throw err;
    }

    return success({ released: true });
  } catch (err) {
    console.error('Error releasing screening lock:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to release screening lock',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
