import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SubmitCandidateToClientRequestSchema } from '../../lib/validation.js';
import { getRequirementById, getCandidateById, getShortlistEntry } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { getEffectiveStage, transitionPipelineStage, createPipelineActivity } from '../../lib/pipelineService.js';
import { sendCandidateSubmissionEmail, getFormattedResumeUrl } from '../../lib/emailService.js';
import { getUserById } from '../../lib/dynamodb.js';

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

    const validation = validate(SubmitCandidateToClientRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { clientEmail, clientName, coverNote, ccEmails } = validation.data;

    // Fetch requirement, candidate, and shortlist entry in parallel
    const [requirement, candidate, shortlistEntry] = await Promise.all([
      getRequirementById(requirementId),
      getCandidateById(candidateId),
      getShortlistEntry(requirementId, candidateId),
    ]);

    if (!requirement) return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    if (!candidate) return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    if (!shortlistEntry) return error(ErrorCodes.NOT_FOUND, 'Candidate is not shortlisted for this requirement', 404);

    // Check current stage allows submission
    const currentStage = getEffectiveStage(shortlistEntry);
    if (currentStage !== 'shortlisted') {
      return error(ErrorCodes.DUPLICATE_SUBMISSION, `Candidate is already in stage: ${currentStage}. Cannot submit again.`, 409);
    }

    // Get recruiter info for email
    const recruiter = await getUserById(event.auth.userId);
    const recruiterName = recruiter?.name || event.auth.email;

    // Generate presigned resume URL
    const resumeUrl = await getFormattedResumeUrl(candidate);

    // Send email to client
    await sendCandidateSubmissionEmail({
      clientEmail,
      clientName,
      ccEmails,
      requirementId,
      jobTitle: requirement.job_title,
      clientCompany: requirement.client_name,
      coverNote,
      candidate,
      resumeUrl,
      recruiterName,
    });

    // Transition stage and log activity
    await transitionPipelineStage(
      requirementId,
      candidateId,
      currentStage,
      'submitted_to_client',
      event.auth.userId,
      undefined,
      {
        submitted_at: new Date().toISOString(),
        submitted_by: event.auth.userId,
      }
    );

    // Log email sent activity
    await createPipelineActivity(requirementId, candidateId, 'email_sent', event.auth.userId, {
      email_type: 'submission',
      recipient_email: clientEmail,
      subject: `Candidate Profile: ${candidate.full_name}`,
    });

    logAuditEvent(event.auth, event, {
      action: 'PIPELINE_SUBMIT_TO_CLIENT',
      entityType: 'pipeline',
      entityId: `${requirementId}:${candidateId}`,
      metadata: { requirementId, candidateId, clientEmail, candidateName: candidate.full_name },
    });

    return success({ submitted: true, candidateId, requirementId });
  } catch (err) {
    console.error('Error submitting candidate to client:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to submit candidate to client', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
