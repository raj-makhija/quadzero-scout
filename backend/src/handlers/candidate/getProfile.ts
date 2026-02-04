import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getCandidateById } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    // Get candidate ID from path parameters
    const candidateId = event.pathParameters?.candidateId;

    if (!candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Candidate ID is required', 400);
    }

    // Fetch candidate from DynamoDB
    const candidate = await getCandidateById(candidateId);

    if (!candidate) {
      return error(ErrorCodes.NOT_FOUND, 'Candidate not found', 404);
    }

    // Transform to API response format (snake_case to camelCase)
    const response = {
      candidateId: candidate.candidate_id,
      userId: candidate.user_id,
      fullName: candidate.full_name,
      email: candidate.email,
      phone: candidate.phone,
      location: candidate.location,
      primarySkills: candidate.primary_skills,
      primarySkillYears: candidate.primary_skill_years,
      secondarySkills: candidate.secondary_skills,
      totalExperience: candidate.total_experience,
      seniority: candidate.seniority,
      availability: candidate.availability,
      industries: candidate.industries,
      roles: candidate.roles,
      education: candidate.education,
      certifications: candidate.certifications,
      summary: candidate.summary,
      currentCtc: candidate.current_ctc,
      expectedCtc: candidate.expected_ctc,
      resumeS3Key: candidate.resume_s3_key,
      createdAt: candidate.created_at,
      lastUpdated: candidate.last_updated,
    };

    return success(response);
  } catch (err) {
    console.error('Error fetching profile:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to fetch candidate profile',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['candidate'], handleRequest);
