import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ScreenCandidateRequestSchema } from '../../lib/validation.js';
import { getCandidateById, saveScreening, updateCandidateProfileFields, getUserById, getSubVendorById } from '../../lib/dynamodb.js';
import { getExperienceBucket } from '../../lib/dynamodb.js';
import { recalcShortlistRatesForCandidate } from '../../lib/recalcShortlistRates.js';
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
  lastWorkingDay: 'last_working_day',
  engagementModel: 'engagement_model',
  industries: 'industries',
  roles: 'roles',
  education: 'education',
  certifications: 'certifications',
  summary: 'summary',
  currentCtc: 'current_ctc',
  expectedCtc: 'expected_ctc',
  expectedCtcType: 'expected_ctc_type',
  headline: 'headline',
  linkedinUrl: 'linkedin_url',
  githubUrl: 'github_url',
  notInterested: 'not_interested',
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

    const now = new Date().toISOString();

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

    // If not_interested flag changed, manage timestamp and attribution fields
    if (dbFields['not_interested'] !== undefined) {
      if (dbFields['not_interested'] === true) {
        dbFields['not_interested_at'] = now;
        dbFields['not_interested_by'] = event.auth.userId;
      } else {
        dbFields['not_interested_at'] = null; // triggers DynamoDB REMOVE
        dbFields['not_interested_by'] = null;
      }
    }

    // Handle sub-vendor updates (requires denormalization, not in FIELD_MAP)
    if (updatedValues.subVendorId !== undefined) {
      const svFields = ['sub_vendor_id', 'sub_vendor_name', 'sub_vendor_contact_person', 'sub_vendor_contact_phone', 'sub_vendor_contact_email'] as const;
      // Record previous values for audit
      for (const f of svFields) {
        (previousValues as Record<string, unknown>)[f] = candidate[f as keyof typeof candidate];
      }

      if (updatedValues.subVendorId === null) {
        // Remove sub-vendor
        for (const f of svFields) {
          dbFields[f] = null;
        }
        fieldsUpdated.push(...svFields);
      } else {
        // Set/change sub-vendor
        const subVendor = await getSubVendorById(updatedValues.subVendorId);
        if (!subVendor) {
          return error(ErrorCodes.VALIDATION_ERROR, 'Sub-vendor not found', 400);
        }
        dbFields['sub_vendor_id'] = subVendor.sub_vendor_id;
        dbFields['sub_vendor_name'] = subVendor.sub_vendor_name;
        dbFields['sub_vendor_contact_person'] = subVendor.contact_person_name || null;
        dbFields['sub_vendor_contact_phone'] = subVendor.contact_person_phone || null;
        dbFields['sub_vendor_contact_email'] = subVendor.contact_person_email || null;
        fieldsUpdated.push(...svFields);
      }
    }

    // Build updated values snapshot for audit
    const updatedValuesSnapshot: ScreeningProfileData = {};
    for (const [snakeKey, value] of Object.entries(dbFields)) {
      if (snakeKey === 'experience_bucket' || snakeKey === 'not_interested_at' || snakeKey === 'not_interested_by') continue; // Don't include derived/meta fields in audit
      (updatedValuesSnapshot as Record<string, unknown>)[snakeKey] = value;
    }

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
      metadata: { candidateId, candidateName: candidate.full_name, fieldsUpdated, notes, notInterested: updatedValues.notInterested },
    });

    // If expectedCtc changed, recalculate rates on all active shortlist entries
    if (dbFields['expected_ctc'] !== undefined) {
      const newCtcLpa = dbFields['expected_ctc'] as number;
      const newExperienceYears = (dbFields['total_experience'] as number | undefined) ?? (candidate.total_experience as number);
      await recalcShortlistRatesForCandidate(candidateId, newCtcLpa, newExperienceYears);
    }

    return success({
      candidateId,
      screenedAt: now,
      fieldsUpdated,
      notInterested: updatedValues.notInterested,
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
