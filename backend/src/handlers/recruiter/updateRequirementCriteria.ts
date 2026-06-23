import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateRequirementCriteriaRequestSchema } from '../../lib/validation.js';
import { getRequirementById, updateRequirementCriteria } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { normalizeLocation } from '../../lib/locationNormalizer.js';
import { logAuditEvent } from '../../lib/audit.js';
import { rebuildCacheForRequirement } from '../../lib/matchCacheService.js';
import { putMatchCacheFailureMetric } from '../../lib/cloudwatchMetrics.js';
import type { LLMJDOutput } from '../../types/index.js';

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
    const recruiterId = event.auth.userId;

    // Verify requirement exists and belongs to this recruiter
    const existing = await getRequirementById(requirementId);
    if (!existing) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    if (existing.recruiter_id !== recruiterId) {
      return error(ErrorCodes.FORBIDDEN, 'Not authorized to modify this requirement', 403);
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

    // Rebuild the requirement's cache from scratch against the new criteria.
    // Non-fatal — cache failure must not fail the criteria update.
    if (existing.status === 'active') {
      try {
        await rebuildCacheForRequirement({
          ...existing,
          parsed_criteria: normalizedCriteria as LLMJDOutput,
          budget_max_lpa: data.maxBudgetLpa ?? existing.budget_max_lpa,
        });
      } catch (cacheErr) {
        // Non-fatal but observable (ticket #447): log with the requirement ID
        // and emit a CloudWatch metric so a silent empty cache is alarmable.
        console.error(`[matchCache] Failed to build cache for requirement ${requirementId}:`, cacheErr);
        await putMatchCacheFailureMetric(requirementId);
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
