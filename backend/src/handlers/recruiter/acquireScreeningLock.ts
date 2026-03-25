import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ScreeningLockRequestSchema } from '../../lib/validation.js';
import { acquireScreeningLock, getScreeningLock, getUserById, SCREENING_LOCK_TTL_SECONDS } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { randomUUID } from 'crypto';
import type { ScreeningLockItem } from '../../types/index.js';

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

    // Look up recruiter name for display
    let recruiterName = event.auth.email;
    try {
      const user = await getUserById(event.auth.userId);
      if (user?.name) recruiterName = user.name;
    } catch {
      // Non-critical — use email as fallback
    }

    const now = new Date();
    const ttl = Math.floor(now.getTime() / 1000) + SCREENING_LOCK_TTL_SECONDS;
    const lockToken = randomUUID();

    const lockItem: ScreeningLockItem = {
      candidate_id: candidateId,
      locked_by: event.auth.userId,
      locked_by_email: event.auth.email,
      locked_by_name: recruiterName,
      locked_at: now.toISOString(),
      lock_token: lockToken,
      ttl,
    };

    try {
      await acquireScreeningLock(lockItem);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        // Lock is held by someone else — read current lock holder info
        const existingLock = await getScreeningLock(candidateId);
        if (existingLock) {
          return error('SCREENING_LOCKED', 'Candidate is currently being screened by another recruiter', 409, {
            lockedBy: existingLock.locked_by_name,
            lockedByEmail: existingLock.locked_by_email,
            lockedAt: existingLock.locked_at,
          });
        }
        // Lock expired between check and read — retry once
        try {
          await acquireScreeningLock(lockItem);
        } catch {
          return error(ErrorCodes.DYNAMODB_ERROR, 'Failed to acquire screening lock', 500);
        }
      } else {
        throw err;
      }
    }

    const expiresAt = new Date(ttl * 1000).toISOString();

    return success({
      acquired: true,
      expiresAt,
      lockToken,
    });
  } catch (err) {
    console.error('Error acquiring screening lock:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to acquire screening lock',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
