import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, MarkNotSuitableRequestSchema } from '../../lib/validation.js';
import { getRequirementById, getCandidateById, getShortlistEntry, saveShortlist, updateShortlistStatus } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { safeResolveTask, compositeEntityRef } from '../../lib/recruiterTasks.js';
import type { ShortlistItem } from '../../types/index.js';

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

    const validation = validate(MarkNotSuitableRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { requirementId, candidateId, notes } = validation.data;

    // Verify requirement and candidate exist in parallel
    const [requirement, candidate] = await Promise.all([
      getRequirementById(requirementId),
      getCandidateById(candidateId),
    ]);

    if (!requirement) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }
    if (!candidate) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }

    // Check if a shortlist entry already exists
    const existing = await getShortlistEntry(requirementId, candidateId);
    if (existing) {
      if (existing.status === 'not_suitable') {
        return error(ErrorCodes.VALIDATION_ERROR, 'Candidate is already marked as not suitable for this requirement', 409);
      }
      // Update existing entry to not_suitable
      await updateShortlistStatus(requirementId, candidateId, 'not_suitable', event.auth.userId);
    } else {
      // Create new entry with not_suitable status
      const item: ShortlistItem = {
        requirement_id: requirementId,
        candidate_id: candidateId,
        tagged_by: event.auth.userId,
        tagged_at: new Date().toISOString(),
        notes,
        status: 'not_suitable',
      };
      await saveShortlist(item);
    }

    logAuditEvent(event.auth, event, {
      action: 'SHORTLIST_MARK_NOT_SUITABLE',
      entityType: 'shortlist',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId, candidateName: candidate.full_name },
    });

    // The match has been triaged — clear the requirement-bound found task.
    await safeResolveTask({
      entityRef: compositeEntityRef(requirementId, candidateId),
      type: 'found_candidate_for_requirement',
      completedBy: event.auth.userId,
    });

    return success({ success: true });
  } catch (err) {
    console.error('Error marking candidate as not suitable:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to mark candidate as not suitable',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
