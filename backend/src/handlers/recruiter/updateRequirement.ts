import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateRequirementRequestSchema } from '../../lib/validation.js';
import { getRequirementById, updateRequirementFields } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { slugifyFieldKey } from '../../lib/slugify.js';
import type { RequirementChangeEntry, RequirementChangeDetail } from '../../types/index.js';

// Maps camelCase request fields to snake_case DynamoDB attribute names
const FIELD_MAP: Record<string, string> = {
  clientName: 'client_name',
  endClient: 'end_client',
  engagementModel: 'engagement_model',
  payroll: 'payroll',
  budgetMinLpa: 'budget_min_lpa',
  budgetMaxLpa: 'budget_max_lpa',
  contractDurationMonths: 'contract_duration_months',
  paymentTermsDays: 'payment_terms_days',
  jobTitle: 'job_title',
  jdText: 'jd_text',
  parsedCriteria: 'parsed_criteria',
  additionalFields: 'additional_fields',
};

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const key of keys) {
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Requirement ID is required', 400);
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

    const validation = validate(UpdateRequirementRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const data = validation.data;
    const recruiterId = event.auth.userId;

    // Verify requirement exists; any internal recruiter may edit
    const existing = await getRequirementById(requirementId);
    if (!existing) {
      return error(ErrorCodes.NOT_FOUND, 'Requirement not found', 404);
    }

    if (!event.auth.isInternal) {
      return error(ErrorCodes.FORBIDDEN, 'Only internal recruiters can modify requirements', 403);
    }

    if (existing.status === 'duplicate') {
      return error(ErrorCodes.VALIDATION_ERROR, 'Cannot update a duplicate requirement', 400);
    }

    // Compute field-level diff — only include fields that actually changed
    const changes: RequirementChangeDetail[] = [];
    const fieldsToUpdate: Record<string, unknown> = {};

    for (const [camelKey, dbKey] of Object.entries(FIELD_MAP)) {
      if (!(camelKey in data) || (data as Record<string, unknown>)[camelKey] === undefined) continue;

      let newValue = (data as Record<string, unknown>)[camelKey];
      const oldValue = (existing as unknown as Record<string, unknown>)[dbKey];

      // Process additional fields — slugify keys
      if (camelKey === 'additionalFields' && Array.isArray(newValue)) {
        newValue = newValue.map((field: Record<string, unknown>) => ({
          ...field,
          key: slugifyFieldKey(field.label as string),
        }));
      }

      // Also update client_name_lower when clientName changes
      if (camelKey === 'clientName' && typeof newValue === 'string') {
        fieldsToUpdate['client_name_lower'] = newValue.toLowerCase().trim();
      }

      if (!deepEqual(oldValue, newValue)) {
        changes.push({ field: camelKey, old_value: oldValue, new_value: newValue });
        fieldsToUpdate[dbKey] = newValue;
      }
    }

    if (changes.length === 0) {
      return success({
        requirementId,
        lastUpdated: existing.last_updated,
        fieldsUpdated: [],
        message: 'No fields changed',
      });
    }

    const now = new Date().toISOString();
    const changeEntry: RequirementChangeEntry = {
      changed_at: now,
      changed_by: recruiterId,
      changes,
    };

    await updateRequirementFields(requirementId, fieldsToUpdate, changeEntry);

    return success({
      requirementId,
      lastUpdated: now,
      fieldsUpdated: changes.map(c => c.field),
    });
  } catch (err) {
    console.error('Error updating requirement:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to update requirement',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
