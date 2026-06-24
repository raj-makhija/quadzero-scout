import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateRequirementStatusRequestSchema } from '../../lib/validation.js';
import { getRequirementById, updateRequirementStatus } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { deleteMatchCache } from '../../lib/matchCacheService.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import { safeResolveFoundTasksForRequirement } from '../../lib/recruiterTasks.js';
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

    // Reopen (→ active) rebuilds the cache off the request path (ticket #469) —
    // the full scan can't finish inside the 30s request timeout at prod scale,
    // so it runs in matchCacheRequirementWorker, which carries the ticket #447
    // failure observability. Any other transition (close / on-hold / duplicate)
    // drops the cache entry. Non-fatal — cache work must not fail the status
    // change. The drop path is best-effort log-only (a failed delete self-heals).
    if (newStatus === 'active') {
      if (config.lambda.matchCacheRequirementWorkerName) {
        try {
          await invokeLambdaAsync(config.lambda.matchCacheRequirementWorkerName, {
            requirementId,
          });
        } catch (cacheErr) {
          console.error('Failed to dispatch match-cache rebuild on reopen:', cacheErr);
        }
      }
    } else {
      try {
        await deleteMatchCache(requirementId);
      } catch (cacheErr) {
        console.error(`[matchCache] Failed to delete cache for requirement ${requirementId}:`, cacheErr);
      }
    }

    // Expire open found-candidate tasks when closing/putting on-hold.
    // Best-effort — failure must not block the status update.
    if (newStatus === 'closed_on_hold') {
      try {
        await safeResolveFoundTasksForRequirement({ requirementId, completedBy: event.auth.userId });
      } catch (cleanupErr) {
        console.error('Failed to expire found-candidate tasks after status change:', cleanupErr);
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
