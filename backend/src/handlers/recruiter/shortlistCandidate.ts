import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ShortlistCandidateRequestSchema } from '../../lib/validation.js';
import { getRequirementById, getCandidateById, getShortlistEntry, saveShortlist, updateShortlistStatus, listAttachments } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { safeGenerateTask, buildSubmitToClientTask } from '../../lib/recruiterTasks.js';
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

    const {
      requirementId, candidateId, notes,
      proposedRateHourly, proposedRateMonthly, proposedRateAnnual,
      internalRateHourly, internalRateMonthly, internalRateAnnual,
    } = validation.data;

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

    // Check required documents (PAN + Aadhaar must both be attached and tagged).
    // Runs before the existing-entry check so it also blocks not_suitable re-shortlisting.
    // Tags use the exact canonical strings from ticket #363 (case-sensitive).
    const attachments = await listAttachments(candidateId);
    const hasPan = attachments.some((a) => a.tag === 'PAN');
    const hasAadhaar = attachments.some((a) => a.tag === 'Aadhaar');
    if (!hasPan || !hasAadhaar) {
      const missing = [!hasPan && 'PAN', !hasAadhaar && 'Aadhaar'].filter(Boolean).join(' and ');
      return error(
        ErrorCodes.DOCUMENTS_REQUIRED,
        `Required document(s) missing: ${missing}. Please attach the candidate's ${missing} document before shortlisting.`,
        422
      );
    }

    // Check if already shortlisted
    const existing = await getShortlistEntry(requirementId, candidateId);
    if (existing) {
      if (existing.status === 'not_suitable') {
        // Allow re-shortlisting a candidate previously marked as not suitable
        const rateFields: Record<string, unknown> = {};
        if (proposedRateHourly != null) {
          rateFields.proposed_rate_hourly = proposedRateHourly;
          rateFields.proposed_rate_monthly = proposedRateMonthly;
          rateFields.proposed_rate_annual = proposedRateAnnual;
          rateFields.internal_rate_hourly = internalRateHourly;
          rateFields.internal_rate_monthly = internalRateMonthly;
          rateFields.internal_rate_annual = internalRateAnnual;
          rateFields.proposed_rate_calculated_at = new Date().toISOString();
        }
        await updateShortlistStatus(
          requirementId, candidateId, 'shortlisted', event.auth.userId,
          Object.keys(rateFields).length > 0 ? rateFields : undefined
        );

        logAuditEvent(event.auth, event, {
          action: 'SHORTLIST_ADD',
          entityType: 'shortlist',
          entityId: `${requirementId}:${candidateId}`,
          metadata: { requirementId, candidateId, candidateName: candidate.full_name, previousStatus: 'not_suitable' },
        });

        await safeGenerateTask(
          buildSubmitToClientTask({
            ownerId: event.auth.userId,
            requirementId,
            candidateId,
            context: {
              candidate_name: candidate.full_name,
              requirement_title: requirement.job_title,
              client_name: requirement.client_name,
            },
            now: new Date(),
          })
        );

        const result: Record<string, unknown> = { success: true };
        if (candidate.not_interested) {
          result.warning = 'NOT_INTERESTED';
          result.notInterestedAt = candidate.not_interested_at;
        }
        return success(result);
      }
      return error(ErrorCodes.VALIDATION_ERROR, 'Candidate is already shortlisted for this requirement', 409);
    }

    const item: ShortlistItem = {
      requirement_id: requirementId,
      candidate_id: candidateId,
      tagged_by: event.auth.userId,
      tagged_at: new Date().toISOString(),
      notes,
      status: 'shortlisted',
      ...(proposedRateHourly != null && {
        proposed_rate_hourly: proposedRateHourly,
        proposed_rate_monthly: proposedRateMonthly,
        proposed_rate_annual: proposedRateAnnual,
        internal_rate_hourly: internalRateHourly,
        internal_rate_monthly: internalRateMonthly,
        internal_rate_annual: internalRateAnnual,
        proposed_rate_calculated_at: new Date().toISOString(),
      }),
    };

    await saveShortlist(item);

    logAuditEvent(event.auth, event, {
      action: 'SHORTLIST_ADD',
      entityType: 'shortlist',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId, candidateName: candidate.full_name },
    });

    await safeGenerateTask(
      buildSubmitToClientTask({
        ownerId: event.auth.userId,
        requirementId,
        candidateId,
        context: {
          candidate_name: candidate.full_name,
          requirement_title: requirement.job_title,
          client_name: requirement.client_name,
        },
        now: new Date(),
      })
    );

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
