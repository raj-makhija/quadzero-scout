import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { queryCandidateSubmissionsByCandidate } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

/**
 * GET /recruiter/candidate-submissions?candidateId=…
 *
 * Returns the full submission history for one candidate (every vendor that has
 * submitted them, newest first) via the CandidateSubmissionsIndex GSI.
 * Internal-recruiter only (#576).
 */
async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const candidateId = event.queryStringParameters?.candidateId;
    if (!candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'candidateId query parameter is required', 400);
    }

    const rows = await queryCandidateSubmissionsByCandidate(candidateId);

    const submissions = rows.map((r) => ({
      vendorKey: r.vendor_key,
      submittedAt: r.submitted_at,
      subVendorId: r.sub_vendor_id,
      subVendorName: r.sub_vendor_name,
      submitterEmail: r.submitter_email,
      requirementId: r.requirement_id,
      wasFirstSubmitter: r.was_first_submitter,
      internetMessageId: r.internet_message_id,
    }));

    return success({ candidateId, submissions });
  } catch (err) {
    console.error('Error fetching candidate submissions:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to fetch candidate submissions',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
