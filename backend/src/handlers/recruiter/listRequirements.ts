import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getAllRequirementsPaginated } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const params = event.queryStringParameters || {};

    const search = params.search;
    const dateFrom = params.dateFrom;
    const dateTo = params.dateTo;
    const statusFilter = params.status;
    const limit = params.limit ? parseInt(params.limit, 10) : 20;
    const offset = params.offset ? parseInt(params.offset, 10) : 0;

    const result = await getAllRequirementsPaginated(
      limit,
      offset,
      statusFilter,
      search ? search.toLowerCase().trim() : undefined,
      dateFrom,
      dateTo
    );

    const requirements = result.items.map((item) => ({
      requirementId: item.requirement_id,
      clientName: item.client_name,
      endClient: item.end_client,
      engagementModel: item.engagement_model,
      payroll: item.payroll,
      budgetMinLpa: item.budget_min_lpa,
      budgetMaxLpa: item.budget_max_lpa,
      contractDurationMonths: item.contract_duration_months,
      paymentTermsDays: item.payment_terms_days,
      jobTitle: item.job_title,
      mustHaveSkills: item.parsed_criteria?.mustHaveSkills || [],
      roles: item.parsed_criteria?.roles || [],
      status: item.status,
      createdAt: item.created_at,
      requestCount: item.request_count || 1,
      demandScore: item.demand_score || 0,
      notifyRecruiterIds: item.notify_recruiter_ids,
      additionalFields: item.additional_fields || [],
      contactPersonName: item.contact_person_name,
      coreSkill: item.parsed_criteria?.coreSkill || null,
    }));

    return success({
      requirements,
      pagination: {
        count: requirements.length,
        total: result.total,
        hasMore: result.hasMore,
        offset,
      },
    });
  } catch (err) {
    console.error('Error listing requirements:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to list requirements',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
