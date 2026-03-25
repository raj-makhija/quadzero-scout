import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ShortlistCandidateRequestSchema } from '../../lib/validation.js';
import { getRequirementById, getCandidateById, getShortlistEntry, saveShortlist } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
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

    const validation = validate(ShortlistCandidateRequestSchema, body);
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

    // Check screening freshness (must be screened within last 15 days)
    const SCREENING_MAX_AGE_DAYS = 15;
    const lastScreenedAt = candidate.last_screened_at;
    if (!lastScreenedAt) {
      return error(
        ErrorCodes.SCREENING_REQUIRED,
        'Candidate has not been screened. Please screen the candidate before shortlisting.',
        409
      );
    }
    const daysSinceScreening = (Date.now() - new Date(lastScreenedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceScreening > SCREENING_MAX_AGE_DAYS) {
      return error(
        ErrorCodes.SCREENING_REQUIRED,
        `Candidate screening is expired (last screened ${Math.floor(daysSinceScreening)} days ago). Please re-screen the candidate before shortlisting.`,
        409
      );
    }

    // Check if already shortlisted
    const existing = await getShortlistEntry(requirementId, candidateId);
    if (existing) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Candidate is already shortlisted for this requirement', 409);
    }

    const item: ShortlistItem = {
      requirement_id: requirementId,
      candidate_id: candidateId,
      tagged_by: event.auth.userId,
      tagged_at: new Date().toISOString(),
      notes,
      status: 'shortlisted',
    };

    await saveShortlist(item);

    logAuditEvent(event.auth, event, {
      action: 'SHORTLIST_ADD',
      entityType: 'shortlist',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId, candidateName: candidate.full_name },
    });

    const result: Record<string, unknown> = { success: true };
    if (candidate.not_interested) {
      result.warning = 'NOT_INTERESTED';
      result.notInterestedAt = candidate.not_interested_at;
    }
    return success(result);
  } catch (err) {
    console.error('Error shortlisting candidate:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to shortlist candidate',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
