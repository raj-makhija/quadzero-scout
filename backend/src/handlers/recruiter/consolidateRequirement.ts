import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ConsolidateRequirementRequestSchema } from '../../lib/validation.js';
import { getRequirementById, consolidateRequirement } from '../../lib/dynamodb.js';
import { computeDemandScore } from '../../lib/demandScore.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import type { RequirementRequestEntry } from '../../types/index.js';

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

    const validation = validate(ConsolidateRequirementRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const data = validation.data;
    const recruiterId = event.auth.userId;

    // Fetch the existing requirement
    const existing = await getRequirementById(requirementId);
    if (!existing) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    if (existing.status !== 'active') {
      return error(ErrorCodes.VALIDATION_ERROR, 'Can only consolidate into active requirements', 400);
    }

    // Build the request history entry
    const now = new Date().toISOString();
    const entry: RequirementRequestEntry = {
      received_at: now,
      recruiter_id: recruiterId,
      similarity_score: data.similarityScore,
      jd_text: data.jdText,
      notes: data.notes,
    };

    // Build updated contributing recruiters list
    const existingRecruiters = existing.contributing_recruiters || [existing.recruiter_id];
    const contributingRecruiters = existingRecruiters.includes(recruiterId)
      ? existingRecruiters
      : [...existingRecruiters, recruiterId];

    // Compute new request count and demand score
    const currentCount = existing.request_count || 1;
    const newCount = currentCount + 1;
    const demandScore = computeDemandScore(newCount, now, contributingRecruiters.length);

    // Atomically update the original requirement
    await consolidateRequirement(requirementId, entry, contributingRecruiters, demandScore);

    logAuditEvent(event.auth, event, {
      action: 'REQUIREMENT_CONSOLIDATE',
      entityType: 'requirement',
      entityId: requirementId,
      metadata: { requirementId, similarityScore: data.similarityScore },
    });

    return success({
      requirementId,
      requestCount: newCount,
      lastRequestedAt: now,
    });
  } catch (err) {
    console.error('Error consolidating requirement:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to consolidate requirement',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
