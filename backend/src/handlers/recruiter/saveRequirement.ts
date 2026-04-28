import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SaveRequirementRequestSchema } from '../../lib/validation.js';
import { saveRequirement } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import type { RequirementItem, LLMJDOutput } from '../../types/index.js';
import { slugifyFieldKey } from '../../lib/slugify.js';
import { normalizeLocation } from '../../lib/locationNormalizer.js';

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

    const validation = validate(SaveRequirementRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const data = validation.data;
    const recruiterId = event.auth.userId;
    const requirementId = uuidv4();
    const now = new Date().toISOString();

    const item: RequirementItem = {
      requirement_id: requirementId,
      recruiter_id: recruiterId,
      client_name: data.clientName,
      client_name_lower: data.clientName.toLowerCase().trim(),
      end_client: data.endClient,
      engagement_model: data.engagementModel,
      payroll: data.payroll,
      budget_min_lpa: data.budgetMinLpa,
      budget_max_lpa: data.budgetMaxLpa,
      contract_duration_months: data.contractDurationMonths,
      payment_terms_days: data.paymentTermsDays,
      job_title: data.jobTitle,
      jd_text: data.jdText,
      parsed_criteria: {
        ...data.parsedCriteria,
        location: normalizeLocation(data.parsedCriteria.location) ?? null,
      } as LLMJDOutput,
      status: data.status || 'active',
      duplicate_of: data.duplicateOf,
      created_at: now,
      last_updated: now,
      request_count: 1,
      last_requested_at: now,
      contributing_recruiters: [recruiterId],
      demand_score: 0,
      notify_recruiter_ids: [recruiterId],
      additional_fields: (data.additionalFields || []).map(field => ({
        ...field,
        key: slugifyFieldKey(field.label),
      })),
      contact_person_name: data.contactPersonName,
      is_rate_gst_inclusive: data.isRateGstInclusive ?? false,
    };

    await saveRequirement(item);

    logAuditEvent(event.auth, event, {
      action: 'REQUIREMENT_CREATE',
      entityType: 'requirement',
      entityId: requirementId,
      metadata: { requirementId, clientName: data.clientName, jobTitle: data.jobTitle },
    });

    return success({
      requirementId,
      createdAt: now,
    });
  } catch (err) {
    console.error('Error saving requirement:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to save requirement',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
