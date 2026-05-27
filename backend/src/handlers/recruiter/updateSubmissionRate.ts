import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateSubmissionRateRequestSchema } from '../../lib/validation.js';
import { getShortlistEntry, updateShortlistQuotedRate } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { getEffectiveStage, createPipelineActivity } from '../../lib/pipelineService.js';
import { convertQuotedRate } from '../../lib/rateConversion.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    const candidateId = event.pathParameters?.candidateId;

    if (!requirementId || !candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId and candidateId are required', 400);
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

    const validation = validate(UpdateSubmissionRateRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { quotedRateHourly, quotedRateDenomination, quotedRateGstInclusive } = validation.data;
    const denomination = quotedRateDenomination || 'hourly';
    const gstInclusive = quotedRateGstInclusive || false;
    const converted = convertQuotedRate(quotedRateHourly, denomination);

    const shortlistEntry = await getShortlistEntry(requirementId, candidateId);
    if (!shortlistEntry) {
      return error(ErrorCodes.NOT_FOUND, 'Shortlist entry not found', 404);
    }

    const currentStage = getEffectiveStage(shortlistEntry);
    if (currentStage === 'shortlisted') {
      return error(ErrorCodes.VALIDATION_ERROR, 'Candidate has not been submitted yet', 400);
    }

    const previousRate = shortlistEntry.quoted_rate_hourly;

    await updateShortlistQuotedRate(requirementId, candidateId, {
      ...converted,
      quoted_rate_denomination: denomination,
      quoted_rate_gst_inclusive: gstInclusive,
    });

    await createPipelineActivity(requirementId, candidateId, 'quoted_rate_updated', event.auth.userId, {
      previous_rate_hourly: previousRate ?? null,
      new_rate_hourly: converted.quoted_rate_hourly,
      denomination,
      gst_inclusive: gstInclusive,
    });

    logAuditEvent(event.auth, event, {
      action: 'PIPELINE_UPDATE_QUOTED_RATE',
      entityType: 'pipeline',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId, previousRate, newRate: converted.quoted_rate_hourly, denomination, gstInclusive },
    });

    return success({ updated: true, candidateId, requirementId, quotedRateHourly: converted.quoted_rate_hourly });
  } catch (err) {
    console.error('Error updating submission rate:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to update submission rate', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
