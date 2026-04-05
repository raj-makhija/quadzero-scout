import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SubmitBatchToClientRequestSchema } from '../../lib/validation.js';
import { getRequirementById, getCandidateById, getShortlistEntry } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { getEffectiveStage, transitionPipelineStage, createPipelineActivity } from '../../lib/pipelineService.js';
import { sendBatchSubmissionEmail, getFormattedResumeUrl } from '../../lib/emailService.js';
import { getUserById } from '../../lib/dynamodb.js';
import type { CandidateItem } from '../../types/index.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId is required', 400);
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

    const validation = validate(SubmitBatchToClientRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { candidateIds, clientEmail, clientName, coverNote, ccEmails } = validation.data;

    // Fetch requirement
    const requirement = await getRequirementById(requirementId);
    if (!requirement) return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);

    // Fetch all candidates and shortlist entries in parallel
    const [candidates, shortlistEntries] = await Promise.all([
      Promise.all(candidateIds.map(id => getCandidateById(id))),
      Promise.all(candidateIds.map(id => getShortlistEntry(requirementId, id))),
    ]);

    // Validate all candidates exist and are shortlisted
    const errors: string[] = [];
    for (let i = 0; i < candidateIds.length; i++) {
      if (!candidates[i]) errors.push(`Candidate ${candidateIds[i]} not found`);
      else if (!shortlistEntries[i]) errors.push(`Candidate ${candidateIds[i]} is not shortlisted`);
      else if (getEffectiveStage(shortlistEntries[i]!) !== 'shortlisted') {
        errors.push(`Candidate ${candidates[i]!.full_name} is already in stage: ${getEffectiveStage(shortlistEntries[i]!)}`);
      }
    }
    if (errors.length > 0) {
      return error(ErrorCodes.VALIDATION_ERROR, errors.join('; '), 400);
    }

    // Get recruiter info
    const recruiter = await getUserById(event.auth.userId);
    const recruiterName = recruiter?.name || event.auth.email;

    // Generate resume URLs in parallel
    const resumeUrls = await Promise.all(
      candidates.map(c => c ? getFormattedResumeUrl(c) : Promise.resolve(null))
    );

    // Build candidate list for email
    const candidateList = candidates.map((c, i) => ({
      candidate: c as CandidateItem,
      resumeUrl: resumeUrls[i],
    }));

    // Send batch email
    await sendBatchSubmissionEmail({
      clientEmail,
      clientName,
      ccEmails,
      requirementId,
      jobTitle: requirement.job_title,
      clientCompany: requirement.client_name,
      coverNote,
      candidates: candidateList,
      recruiterName,
    });

    // Transition all candidates and log activities in parallel
    const now = new Date().toISOString();
    await Promise.all(
      candidateIds.map(async (cid) => {
        await transitionPipelineStage(
          requirementId, cid, 'shortlisted', 'submitted_to_client',
          event.auth.userId, undefined,
          { submitted_at: now, submitted_by: event.auth.userId }
        );
        await createPipelineActivity(requirementId, cid, 'email_sent', event.auth.userId, {
          email_type: 'batch_submission',
          recipient_email: clientEmail,
          subject: `Batch submission: ${candidateIds.length} candidates`,
          candidate_ids: candidateIds,
        });
      })
    );

    logAuditEvent(event.auth, event, {
      action: 'PIPELINE_BATCH_SUBMIT',
      entityType: 'pipeline',
      entityId: requirementId,
      metadata: { requirementId, candidateIds, clientEmail, count: candidateIds.length },
    });

    return success({ submitted: true, candidateIds, requirementId });
  } catch (err) {
    console.error('Error batch submitting candidates:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to batch submit candidates', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
