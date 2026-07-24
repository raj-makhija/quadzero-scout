import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { queryCandidateSubmissionsByVendor } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

/**
 * GET /recruiter/sub-vendor-submissions?vendorKey=…
 *
 * Returns every candidate submission for a vendor partition, newest first.
 * `vendorKey` is a sub_vendor_id, a `domain:<domain>` key (unmatched corporate
 * sender), or an `email:<address>` key (free-mail sender). Internal-recruiter
 * only (#576).
 */
async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const vendorKey = event.queryStringParameters?.vendorKey;
    if (!vendorKey) {
      return error(ErrorCodes.VALIDATION_ERROR, 'vendorKey query parameter is required', 400);
    }

    const rows = await queryCandidateSubmissionsByVendor(vendorKey);

    const submissions = rows.map((r) => ({
      candidateId: r.candidate_id,
      submittedAt: r.submitted_at,
      subVendorId: r.sub_vendor_id,
      subVendorName: r.sub_vendor_name,
      submitterEmail: r.submitter_email,
      requirementId: r.requirement_id,
      wasFirstSubmitter: r.was_first_submitter,
      internetMessageId: r.internet_message_id,
    }));

    return success({ vendorKey, submissions });
  } catch (err) {
    console.error('Error fetching sub-vendor submissions:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to fetch sub-vendor submissions',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
