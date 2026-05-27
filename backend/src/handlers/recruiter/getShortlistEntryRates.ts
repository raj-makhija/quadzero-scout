import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getShortlistEntry } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    const candidateId = event.pathParameters?.candidateId;

    if (!requirementId || !candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId and candidateId are required', 400);
    }

    const entry = await getShortlistEntry(requirementId, candidateId);
    if (!entry) {
      return error(ErrorCodes.NOT_FOUND, 'Shortlist entry not found', 404);
    }

    return success({
      requirementId,
      candidateId,
      proposedRateHourly: entry.proposed_rate_hourly ?? null,
      proposedRateMonthly: entry.proposed_rate_monthly ?? null,
      internalRateHourly: entry.internal_rate_hourly ?? null,
      internalRateMonthly: entry.internal_rate_monthly ?? null,
      quotedRateHourly: entry.quoted_rate_hourly ?? null,
      quotedRateMonthly: entry.quoted_rate_monthly ?? null,
      quotedRateAnnual: entry.quoted_rate_annual ?? null,
      quotedRateDenomination: entry.quoted_rate_denomination ?? null,
      quotedRateGstInclusive: entry.quoted_rate_gst_inclusive ?? null,
    });
  } catch (err) {
    console.error('Error fetching shortlist entry rates:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch shortlist entry rates', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
