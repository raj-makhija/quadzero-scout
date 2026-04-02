import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SaveProfileRequestSchema } from '../../lib/validation.js';
import { saveCandidateProfile, getExperienceBucket, getCandidateById, getCandidateByEmail, getSubVendorById } from '../../lib/dynamodb.js';
import { deleteObject } from '../../lib/s3.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import { normalizeSkill, normalizeSkills, normalizeSkillYears } from '../../lib/skillNormalizer.js';
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

    // Resolve sub-vendor if provided
    const subVendor = profile.subVendorId
      ? await getSubVendorById(profile.subVendorId)
      : null;

    if (profile.subVendorId && !subVendor) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Sub-vendor not found', 400);
    }

    // Dedup: resolve existing candidate by ID or email
    let existingCandidate = candidateId
      ? await getCandidateById(candidateId)
      : (profile.email ? await getCandidateByEmail(profile.email) : null);

    if (existingCandidate && !candidateId) {
      console.log('Dedup: found existing candidate by email:', profile.email, '→', existingCandidate.candidate_id);
    }

    // Cache invalidation / preservation for formatted resume
    let preserveFormattedResume: { formatted_resume_s3_key: string; formatted_at: string } | null = null;

    if (existingCandidate) {
      if (existingCandidate.resume_s3_key !== resumeS3Key) {
        // Resume changed - invalidate cache
        if (existingCandidate.formatted_resume_s3_key) {
          console.log('Resume changed, invalidating formatted resume cache for candidate:', existingCandidate.candidate_id);
          try {
            await deleteObject(existingCandidate.formatted_resume_s3_key);
          } catch (err) {
            console.warn('Failed to delete old formatted resume:', err);
          }
        }
      } else if (existingCandidate.formatted_resume_s3_key && existingCandidate.formatted_at) {
        // Resume unchanged - preserve formatted resume fields
        preserveFormattedResume = {
          formatted_resume_s3_key: existingCandidate.formatted_resume_s3_key,
          formatted_at: existingCandidate.formatted_at,
        };
      }
    }

    // Use authenticated userId if available, otherwise generate anonymous ID
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    const userId = (event as { auth?: { userId: string } }).auth?.userId
      || (authHeader ? undefined : `anon_${uuidv4()}`)
      || `anon_${uuidv4()}`;

    // Reuse existing candidate ID or generate a new one
    const finalCandidateId = existingCandidate?.candidate_id || candidateId || `cand_${uuidv4()}`;
    const now = new Date().toISOString();

    // Normalize skills using ontology
    const normalizedPrimarySkills = normalizeSkills(profile.primarySkills);
    const normalizedSecondarySkills = normalizeSkills(profile.secondarySkills || []);
    const normalizedSkillYears = normalizeSkillYears(profile.primarySkillYears);

    // Normalize skill synonyms from LLM output (may be null for older resumes)
    let skillSynonyms: Record<string, string[]> | undefined;
    if (profile.skillSynonyms) {
      skillSynonyms = {};
      for (const [skill, syns] of Object.entries(profile.skillSynonyms)) {
        const normalizedKey = normalizeSkill(skill);
        skillSynonyms[normalizedKey] = normalizeSkills(syns);
      }
    }

    // Build candidate item for DynamoDB (using snake_case for DynamoDB attributes)
    const candidateItem: CandidateItem = {
      candidate_id: finalCandidateId,
      user_id: userId,
      full_name: profile.fullName,
      email: profile.email || existingCandidate?.email || '',
      phone: profile.phone,
      location: profile.location ?? undefined,
      primary_skills: normalizedPrimarySkills,
      primary_skill_years: normalizedSkillYears,
      secondary_skills: normalizedSecondarySkills,
      total_experience: profile.totalExperience,
      experience_bucket: getExperienceBucket(profile.totalExperience),
      seniority: profile.seniority,
      availability: profile.availability,
      engagement_model: profile.engagementModel || 'either',
      industries: profile.industries || [],
      roles: profile.roles || [],
      education: profile.education || [],
      certifications: profile.certifications || [],
      summary: profile.summary,
      current_ctc: profile.currentCtc,
      expected_ctc: profile.expectedCtc,
      resume_s3_key: resumeS3Key,
      custom_fields: {
        ...(existingCandidate?.custom_fields || {}),
        ...(profile.customFields || {}),
      },
      linkedin_url: profile.linkedinUrl || existingCandidate?.linkedin_url,
      github_url: profile.githubUrl || existingCandidate?.github_url,
      cover_letter: profile.coverLetter || existingCandidate?.cover_letter,
      sub_vendor_id: profile.subVendorId || existingCandidate?.sub_vendor_id,
      sub_vendor_name: subVendor?.sub_vendor_name || existingCandidate?.sub_vendor_name,
      sub_vendor_contact_person: subVendor?.contact_person_name || existingCandidate?.sub_vendor_contact_person,
      skill_synonyms: skillSynonyms || existingCandidate?.skill_synonyms,
      ...(preserveFormattedResume ? preserveFormattedResume : {}),
      created_at: existingCandidate?.created_at || now,
      last_updated: now,
    };

    // Save to DynamoDB (skip in local dev when DynamoDB is not available)
    const isLocal = process.env.IS_OFFLINE === 'true';
    if (isLocal) {
      console.log('Local dev mode: skipping DynamoDB save. Candidate profile:', JSON.stringify(candidateItem, null, 2));
    } else {
      await saveCandidateProfile(candidateItem);
    }

    // Trigger async resume formatting if new candidate or resume changed
    if (!preserveFormattedResume && config.lambda.formatResumeWorkerName) {
      try {
        await invokeLambdaAsync(config.lambda.formatResumeWorkerName, {
          candidateId: finalCandidateId,
        });
        console.log('Triggered async resume formatting for candidate:', finalCandidateId);
      } catch (err) {
        console.warn('Failed to trigger async resume formatting:', err);
      }
    }

    // Trigger async notification check for matching requirements
    if (!isLocal && config.lambda.notifyWorkerName) {
      try {
        await invokeLambdaAsync(config.lambda.notifyWorkerName, {
          candidateIds: [finalCandidateId],
        });
        console.log('Triggered async notification check for candidate:', finalCandidateId);
      } catch (err) {
        console.warn('Failed to trigger notification worker:', err);
      }
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

