import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateRequirementCriteriaRequestSchema } from '../../lib/validation.js';
import { getRequirementById, updateRequirementCriteria } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { normalizeLocation } from '../../lib/locationNormalizer.js';
import { logAuditEvent } from '../../lib/audit.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Requirement ID is required', 400);
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

    const validation = validate(UpdateRequirementCriteriaRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const data = validation.data;

    // Verify requirement exists and caller has permission
    const existing = await getRequirementById(requirementId);
    if (!existing) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    if (!event.auth.isInternal && event.auth.role !== 'admin') {
      return error(ErrorCodes.FORBIDDEN, 'Only internal recruiters or admins can modify requirements', 403);
    }

    const now = new Date().toISOString();
    const normalizedCriteria = {
      ...data.parsedCriteria,
      location: normalizeLocation(data.parsedCriteria.location) ?? null,
    };
    await updateRequirementCriteria(
      requirementId,
      normalizedCriteria,
      data.maxBudgetLpa,
      now
    );

    // Dispatch the match-cache rebuild asynchronously so the full active-candidate
    // scan runs off the 30s request path (ticket #469). Non-fatal.
    if (existing.status === 'active') {
      try {
        await invokeLambdaAsync(config.lambda.matchCacheRequirementWorkerName, { requirementId });
      } catch (dispatchErr) {
        console.error(`[matchCache] Failed to dispatch cache worker for requirement ${requirementId}:`, dispatchErr);
      }
    }

    logAuditEvent(event.auth, event, {
      action: 'REQUIREMENT_UPDATE_CRITERIA',
      entityType: 'requirement',
      entityId: requirementId,
      metadata: { requirementId },
    });

    return success({ requirementId, lastUpdated: now });
  } catch (err) {
    console.error('Error updating requirement criteria:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to update requirement criteria',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
