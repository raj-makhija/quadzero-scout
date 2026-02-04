import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SaveProfileRequestSchema } from '../../lib/validation.js';
import { saveCandidateProfile, getExperienceBucket } from '../../lib/dynamodb.js';
import { normalizeSkills, normalizeSkillYears } from '../../lib/skillNormalizer.js';
import type { CandidateItem, SaveProfileResponse } from '../../types/index.js';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Parse request body
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    // Validate request
    const validation = validate(SaveProfileRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { candidateId, profile, resumeS3Key } = validation.data;

    // Use authenticated userId if available, otherwise generate anonymous ID
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    const userId = (event as { auth?: { userId: string } }).auth?.userId
      || (authHeader ? undefined : `anon_${uuidv4()}`)
      || `anon_${uuidv4()}`;

    // Generate candidate ID if not provided
    const finalCandidateId = candidateId || `cand_${uuidv4()}`;
    const now = new Date().toISOString();

    // Normalize skills using ontology
    const normalizedPrimarySkills = normalizeSkills(profile.primarySkills);
    const normalizedSecondarySkills = normalizeSkills(profile.secondarySkills || []);
    const normalizedSkillYears = normalizeSkillYears(profile.primarySkillYears);

    // Build candidate item for DynamoDB (using snake_case for DynamoDB attributes)
    const candidateItem: CandidateItem = {
      candidate_id: finalCandidateId,
      user_id: userId,
      full_name: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      primary_skills: normalizedPrimarySkills,
      primary_skill_years: normalizedSkillYears,
      secondary_skills: normalizedSecondarySkills,
      total_experience: profile.totalExperience,
      experience_bucket: getExperienceBucket(profile.totalExperience),
      seniority: profile.seniority,
      availability: profile.availability,
      industries: profile.industries || [],
      roles: profile.roles || [],
      education: profile.education || [],
      certifications: profile.certifications || [],
      summary: profile.summary,
      current_ctc: profile.currentCtc,
      expected_ctc: profile.expectedCtc,
      resume_s3_key: resumeS3Key,
      created_at: now,
      last_updated: now,
    };

    // Save to DynamoDB (skip in local dev when DynamoDB is not available)
    const isLocal = process.env.IS_OFFLINE === 'true';
    if (isLocal) {
      console.log('Local dev mode: skipping DynamoDB save. Candidate profile:', JSON.stringify(candidateItem, null, 2));
    } else {
      await saveCandidateProfile(candidateItem);
    }

    const response: SaveProfileResponse = {
      candidateId: finalCandidateId,
      lastUpdated: now,
    };

    return success(response);
  } catch (err) {
    console.error('Error saving profile:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to save candidate profile',
      500,
      { message: (err as Error).message }
    );
  }
}

