import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateRequirementStatusRequestSchema } from '../../lib/validation.js';
import { getRequirementById, updateRequirementStatus } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { deleteMatchCache } from '../../lib/matchCacheService.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import { safeResolveFoundTasksForRequirement, safeResolveCloseRequirementTask } from '../../lib/recruiterTasks.js';
import type { StatusHistoryEntry } from '../../types/index.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Requirement ID is required', 400);
    }

    if (!event.auth.isInternal) {
      return error(ErrorCodes.FORBIDDEN, 'Only internal recruiters can change requirement status', 403);
    }

    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const validation = validate(UpdateRequirementStatusRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { status: newStatus, reason } = validation.data;

    const existing = await getRequirementById(requirementId);
    if (!existing) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    if (existing.status === 'duplicate') {
      return error(ErrorCodes.VALIDATION_ERROR, 'Cannot change status of a duplicate requirement', 400);
    }

    // No-op if status is already the target value
    if (existing.status === newStatus) {
      return success({
        requirementId,
        status: newStatus,
        lastUpdated: existing.last_updated,
      });
    }

    const now = new Date().toISOString();
    const historyEntry: StatusHistoryEntry = {
      changed_at: now,
      changed_by: event.auth.userId,
      from_status: existing.status,
      to_status: newStatus,
      reason,
    };

    await updateRequirementStatus(requirementId, newStatus, historyEntry);

    // Reopen (→ active) dispatches the cache rebuild asynchronously so the full
    // active-candidate scan runs off the 30s request path (ticket #469). Any other
    // transition (close / on-hold / duplicate) drops the cache entry synchronously.
    // Both paths are non-fatal.
    if (newStatus === 'active') {
      try {
        await invokeLambdaAsync(config.lambda.matchCacheRequirementWorkerName, { requirementId });
      } catch (dispatchErr) {
        console.error(`[matchCache] Failed to dispatch cache worker for requirement ${requirementId}:`, dispatchErr);
      }
    } else {
      try {
        await deleteMatchCache(requirementId);
      } catch (cacheErr) {
        console.error(`[matchCache] Failed to delete cache for requirement ${requirementId}:`, cacheErr);
      }
    }

    // Expire open found-candidate and close_requirement tasks when closing/putting on-hold.
    // Best-effort — failure must not block the status update.
    if (newStatus === 'closed_on_hold') {
      try {
        await safeResolveFoundTasksForRequirement({ requirementId, completedBy: event.auth.userId });
      } catch (cleanupErr) {
        console.error('Failed to expire found-candidate tasks after status change:', cleanupErr);
      }
      try {
        await safeResolveCloseRequirementTask({ requirementId, completedBy: event.auth.userId });
      } catch (cleanupErr) {
        console.error('Failed to expire close-requirement task after status change:', cleanupErr);
      }
    }

    logAuditEvent(event.auth, event, {
      action: 'REQUIREMENT_UPDATE_STATUS',
      entityType: 'requirement',
      entityId: requirementId,
      metadata: { requirementId, fromStatus: existing.status, toStatus: newStatus },
    });

    return success({
      requirementId,
      status: newStatus,
      lastUpdated: now,
    });
  } catch (err) {
    console.error('Error updating requirement status:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to update requirement status',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
