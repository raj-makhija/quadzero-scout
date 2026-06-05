import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getRequirementById, getUserById, getActivePricingConfig } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { calculateMaxResourceBudgetLpa } from '../../lib/pricingEngine.js';
import type { RequirementRequestEntry, StatusHistoryEntry, RequirementChangeEntry } from '../../types/index.js';

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

    // Transform request_history from snake_case to camelCase
    const requestHistory = (item.request_history || []).map((entry: RequirementRequestEntry) => ({
      receivedAt: entry.received_at,
      recruiterId: entry.recruiter_id,
      similarityScore: entry.similarity_score,
      jdText: entry.jd_text,
      notes: entry.notes,
    }));

    // Transform status_history from snake_case to camelCase
    const statusHistory = (item.status_history || []).map((entry: StatusHistoryEntry) => ({
      changedAt: entry.changed_at,
      changedBy: entry.changed_by,
      fromStatus: entry.from_status,
      toStatus: entry.to_status,
      reason: entry.reason,
    }));

    // Transform change_history from snake_case to camelCase
    const changeHistory = (item.change_history || []).map((entry: RequirementChangeEntry) => ({
      changedAt: entry.changed_at,
      changedBy: entry.changed_by,
      changes: entry.changes.map(c => ({
        field: c.field,
        oldValue: c.old_value,
        newValue: c.new_value,
      })),
    }));

    // Resolve contributing recruiter IDs to names
    const recruiterIds = item.contributing_recruiters || [item.recruiter_id];
    const recruiters = await Promise.all(
      recruiterIds.map(async (id: string) => {
        try {
          const user = await getUserById(id);
          return { id, name: user?.name || user?.email || id, email: user?.email };
        } catch {
          return { id, name: id };
        }
      })
    );

    let maxResourceBudgetLpa: number | undefined;
    if (item.budget_max_lpa != null) {
      const pricingConfig = await getActivePricingConfig();
      maxResourceBudgetLpa = calculateMaxResourceBudgetLpa(
        item.budget_max_lpa,
        item.payment_terms_days ?? 0,
        item.is_rate_gst_inclusive ?? false,
        pricingConfig,
        item.engagement_model
      );
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
      contractDurationMonths: item.contract_duration_months,
      paymentTermsDays: item.payment_terms_days,
      jobTitle: item.job_title,
      jdText: item.jd_text,
      parsedCriteria: item.parsed_criteria,
      status: item.status,
      duplicateOf: item.duplicate_of,
      createdAt: item.created_at,
      lastUpdated: item.last_updated,
      requestHistory,
      statusHistory,
      requestCount: item.request_count || 1,
      lastRequestedAt: item.last_requested_at || item.created_at,
      contributingRecruiters: recruiters,
      demandScore: item.demand_score || 0,
      notifyRecruiterIds: item.notify_recruiter_ids || [],
      additionalFields: item.additional_fields || [],
      contactPersonName: item.contact_person_name,
      isRateGstInclusive: item.is_rate_gst_inclusive ?? false,
      changeHistory,
      maxResourceBudgetLpa,
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
