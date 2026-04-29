import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getShortlistsForRequirement, getCandidateById } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getEffectiveStage, ACTIVE_STAGES, EXIT_STAGES, NOT_SUITABLE_STAGES } from '../../lib/pipelineService.js';
import type { PipelineCandidateView, PipelineViewResponse } from '../../types/index.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId is required', 400);
    }

    // Get all shortlisted candidates for this requirement
    const shortlistItems = await getShortlistsForRequirement(requirementId);

    // Fetch candidate profiles in parallel
    const candidates = await Promise.all(
      shortlistItems.map(item => getCandidateById(item.candidate_id))
    );

    // Build pipeline view grouped by stage
    const stages: Record<string, PipelineCandidateView[]> = {};
    let activeCount = 0;
    let exitedCount = 0;
    let notSuitableCount = 0;
    const byStage: Record<string, number> = {};

    for (let i = 0; i < shortlistItems.length; i++) {
      const item = shortlistItems[i];
      const candidate = candidates[i];
      if (!candidate) continue;

      const stage = getEffectiveStage(item);

      if (!stages[stage]) stages[stage] = [];
      byStage[stage] = (byStage[stage] || 0) + 1;

      if (ACTIVE_STAGES.has(stage)) activeCount++;
      if (EXIT_STAGES.has(stage)) exitedCount++;
      if (NOT_SUITABLE_STAGES.has(stage)) notSuitableCount++;

      stages[stage].push({
        candidateId: item.candidate_id,
        fullName: candidate.full_name,
        primarySkills: candidate.primary_skills,
        totalExperience: candidate.total_experience,
        seniority: candidate.seniority,
        expectedCtc: candidate.expected_ctc,
        pipelineStage: stage,
        stageEnteredAt: item.stage_entered_at,
        lastActivityAt: item.last_activity_at,
        clientFeedbackSummary: item.client_feedback_summary,
        clientFeedbackRating: item.client_feedback_rating,
        nextInterviewAt: item.next_interview_at,
        interviewRoundCount: item.interview_round_count,
        offeredCtcLpa: item.offered_ctc_lpa,
        expectedJoiningDate: item.expected_joining_date,
        rejectionReason: item.rejection_reason,
        taggedAt: item.tagged_at,
        notes: item.notes,
        customFields: candidate.custom_fields,
        linkedinUrl: candidate.linkedin_url,
        githubUrl: candidate.github_url,
        hackerrankUrl: candidate.hackerrank_url,
        hackerrankScore: candidate.hackerrank_score,
        notInterested: candidate.not_interested,
        proposedRateHourly: item.proposed_rate_hourly,
        proposedRateMonthly: item.proposed_rate_monthly,
        proposedRateAnnual: item.proposed_rate_annual,
        internalRateHourly: item.internal_rate_hourly,
        internalRateMonthly: item.internal_rate_monthly,
        internalRateAnnual: item.internal_rate_annual,
      });
    }

    const response: PipelineViewResponse = {
      stages,
      summary: {
        total: shortlistItems.length,
        activeCount,
        exitedCount,
        notSuitableCount,
        byStage,
      },
    };

    return success(response);
  } catch (err) {
    console.error('Error getting pipeline view:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to get pipeline view', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
