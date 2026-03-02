import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getCandidateById, getScreeningHistory } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import type { ScreeningHistoryEntry, ScreeningHistoryResponse } from '../../types/index.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const candidateId = event.pathParameters?.candidateId;
    if (!candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'candidateId path parameter is required', 400);
    }

    // Verify candidate exists
    const candidate = await getCandidateById(candidateId);
    if (!candidate) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }

    // Fetch screening history (latest first)
    const screenings = await getScreeningHistory(candidateId);

    const response: ScreeningHistoryResponse = {
      candidateId,
      screenings: screenings.map((s): ScreeningHistoryEntry => ({
        screenedAt: s.screened_at,
        screenedBy: s.screened_by,
        screenerEmail: s.screener_email,
        previousValues: s.previous_values,
        updatedValues: s.updated_values,
        fieldsUpdated: s.fields_updated,
        notes: s.notes,
      })),
    };

    return success(response);
  } catch (err) {
    console.error('Error fetching screening history:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to fetch screening history',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
