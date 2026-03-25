import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ScreeningLockRequestSchema } from '../../lib/validation.js';
import { heartbeatScreeningLock, SCREENING_LOCK_TTL_SECONDS } from '../../lib/dynamodb.js';
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

    const validation = validate(ScreeningLockRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { candidateId } = validation.data;

    try {
      await heartbeatScreeningLock(candidateId, event.auth.userId);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        // Lock expired or not held by this user
        return error('SCREENING_LOCK_EXPIRED', 'Screening lock has expired', 410);
      }
      throw err;
    }

    const newTtl = Math.floor(Date.now() / 1000) + SCREENING_LOCK_TTL_SECONDS;
    const expiresAt = new Date(newTtl * 1000).toISOString();

    return success({
      extended: true,
      expiresAt,
    });
  } catch (err) {
    console.error('Error extending screening lock:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to extend screening lock',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
