import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { getUserById, updateUserStatus } from '../../lib/dynamodb.js';
import { validate, formatZodErrors } from '../../lib/validation.js';

const RequestSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(['approve', 'reject']),
});

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON', 400);
    }

    const validation = validate(RequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { userId, action } = validation.data;

    // Verify user exists
    const user = await getUserById(userId);
    if (!user) {
      return error(ErrorCodes.NOT_FOUND, 'User not found', 404);
    }

    // Only allow status changes for recruiters
    if (user.role !== 'recruiter') {
      return error(ErrorCodes.VALIDATION_ERROR, 'Can only approve/reject recruiters', 400);
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const statusUpdatedAt = new Date().toISOString();
    await updateUserStatus(userId, newStatus, event.auth.userId);

    logAuditEvent(event.auth, event, {
      action: action === 'approve' ? 'USER_APPROVE' : 'USER_REJECT',
      entityType: 'user',
      entityId: userId,
      metadata: { targetUserId: userId, targetEmail: user.email },
    });

    return success({ userId, status: newStatus, statusUpdatedAt });
  } catch (err) {
    console.error('Error updating user status:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to update user status', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
