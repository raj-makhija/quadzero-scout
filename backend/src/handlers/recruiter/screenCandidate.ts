import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ScreenCandidateRequestSchema } from '../../lib/validation.js';
import { getCandidateById, saveScreening, updateCandidateProfileFields, getUserById } from '../../lib/dynamodb.js';
import { getExperienceBucket } from '../../lib/dynamodb.js';
import { normalizeSkills } from '../../lib/skillNormalizer.js';
import { calculateNegotiableCtc } from '../../lib/ctcConversion.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import type { ScreeningItem, ScreeningProfileData } from '../../types/index.js';

// Map camelCase request fields to snake_case DynamoDB fields
const FIELD_MAP: Record<string, string> = {
  fullName: 'full_name',
  email: 'email',
  phone: 'phone',
  location: 'location',
  primarySkills: 'primary_skills',
  primarySkillYears: 'primary_skill_years',
  secondarySkills: 'secondary_skills',
  totalExperience: 'total_experience',
  seniority: 'seniority',
  availability: 'availability',
  engagementModel: 'engagement_model',
  industries: 'industries',
  roles: 'roles',
  education: 'education',
  certifications: 'certifications',
  summary: 'summary',
  currentCtc: 'current_ctc',
  expectedCtc: 'expected_ctc',
  expectedCtcType: 'expected_ctc_type',
};

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

    const validation = validate(ScreenCandidateRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { candidateId, updatedValues, notes } = validation.data;

    // Fetch current candidate profile
    const candidate = await getCandidateById(candidateId);
    if (!candidate) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }

    // If expectedCtcType is 'negotiable', compute expectedCtc server-side
    if (updatedValues.expectedCtcType === 'negotiable') {
      const currentCtc = updatedValues.currentCtc ?? candidate.current_ctc;
      const totalExp = updatedValues.totalExperience ?? candidate.total_experience;
      if (currentCtc == null || currentCtc <= 0) {
        return error(ErrorCodes.VALIDATION_ERROR, 'Current CTC is required to calculate negotiable expected CTC', 400);
      }
      if (totalExp == null) {
        return error(ErrorCodes.VALIDATION_ERROR, 'Total experience is required to calculate negotiable expected CTC', 400);
      }
      updatedValues.expectedCtc = calculateNegotiableCtc(currentCtc, totalExp);
    }

    // Build previous values snapshot and DB update fields
    const previousValues: ScreeningProfileData = {};
    const dbFields: Record<string, unknown> = {};
    const fieldsUpdated: string[] = [];

    for (const [camelKey, value] of Object.entries(updatedValues)) {
      if (value === undefined) continue;

      const snakeKey = FIELD_MAP[camelKey];
      if (!snakeKey) continue;

      const currentValue = candidate[snakeKey as keyof typeof candidate];

      // Record the previous value for audit
      (previousValues as Record<string, unknown>)[snakeKey] = currentValue;

      // Normalize skills if applicable
      let processedValue = value;
      if (camelKey === 'primarySkills' && Array.isArray(value)) {
        processedValue = normalizeSkills(value as string[]);
      }

      dbFields[snakeKey] = processedValue;
      fieldsUpdated.push(snakeKey);
    }

    // Handle custom_fields separately (not in FIELD_MAP)
    if (updatedValues.customFields && Object.keys(updatedValues.customFields).length > 0) {
      const existingCustomFields = candidate.custom_fields || {};
      const mergedCustomFields = { ...existingCustomFields, ...updatedValues.customFields };
      dbFields['custom_fields'] = mergedCustomFields;
      (previousValues as Record<string, unknown>)['custom_fields'] = existingCustomFields;
      fieldsUpdated.push('custom_fields');
    }

    // If totalExperience changed, also update experience_bucket
    if (dbFields['total_experience'] !== undefined) {
      const newBucket = getExperienceBucket(dbFields['total_experience'] as number);
      dbFields['experience_bucket'] = newBucket;
    }

    // Build updated values snapshot for audit
    const updatedValuesSnapshot: ScreeningProfileData = {};
    for (const [snakeKey, value] of Object.entries(dbFields)) {
      if (snakeKey === 'experience_bucket') continue; // Don't include derived field in audit
      (updatedValuesSnapshot as Record<string, unknown>)[snakeKey] = value;
    }

    const now = new Date().toISOString();

    // Save screening record
    const screeningItem: ScreeningItem = {
      candidate_id: candidateId,
      screened_at: now,
      screened_by: event.auth.userId,
      screener_email: event.auth.email,
      previous_values: previousValues,
      updated_values: updatedValuesSnapshot,
      fields_updated: fieldsUpdated,
      notes,
    };

    // Look up screener's name for display purposes
    let screenerName: string | undefined;
    try {
      const screenerUser = await getUserById(event.auth.userId);
      screenerName = screenerUser?.name || undefined;
    } catch {
      // Non-critical — proceed without name
    }

    // Save screening record and update candidate profile in parallel
    await Promise.all([
      saveScreening(screeningItem),
      Object.keys(dbFields).length > 0
        ? updateCandidateProfileFields(candidateId, dbFields, event.auth.userId, screenerName)
        : Promise.resolve(),
    ]);

    // If no fields were changed but we still want to record the screening
    // (e.g., recruiter just verified everything is correct), update screening timestamps
    if (Object.keys(dbFields).length === 0) {
      await updateCandidateProfileFields(candidateId, {}, event.auth.userId, screenerName);
    }

    logAuditEvent(event.auth, event, {
      action: 'CANDIDATE_SCREEN',
      entityType: 'candidate',
      entityId: candidateId,
      metadata: { candidateId, fieldsUpdated, notes },
    });

    return success({
      candidateId,
      screenedAt: now,
      fieldsUpdated,
    });
  } catch (err) {
    console.error('Error screening candidate:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to screen candidate',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
