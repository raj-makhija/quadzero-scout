import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ShortlistCandidateRequestSchema } from '../../lib/validation.js';
import { getRequirementById, getCandidateById, getShortlistEntry, saveShortlist } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
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

    return success({ success: true });
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
