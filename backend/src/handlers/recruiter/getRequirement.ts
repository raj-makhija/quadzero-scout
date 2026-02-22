import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRequirementById } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId is required', 400);
    }

    const item = await getRequirementById(requirementId);
    if (!item) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    return success({
      requirementId: item.requirement_id,
      recruiterId: item.recruiter_id,
      clientName: item.client_name,
      endClient: item.end_client,
      engagementModel: item.engagement_model,
      payroll: item.payroll,
      budgetMinLpa: item.budget_min_lpa,
      budgetMaxLpa: item.budget_max_lpa,
      jobTitle: item.job_title,
      jdText: item.jd_text,
      parsedCriteria: item.parsed_criteria,
      status: item.status,
      duplicateOf: item.duplicate_of,
      createdAt: item.created_at,
      lastUpdated: item.last_updated,
      requestHistory: item.request_history || [],
      requestCount: item.request_count || 1,
      lastRequestedAt: item.last_requested_at || item.created_at,
      contributingRecruiters: item.contributing_recruiters || [item.recruiter_id],
      demandScore: item.demand_score || 0,
    });
  } catch (err) {
    console.error('Error fetching requirement:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to fetch requirement',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
