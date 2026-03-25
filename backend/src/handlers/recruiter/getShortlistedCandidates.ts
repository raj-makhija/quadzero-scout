import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getShortlistsForRequirement, getCandidateById } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import type { ShortlistedCandidate, ShortlistedCandidatesResponse } from '../../types/index.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const requirementId = event.pathParameters?.requirementId;
    if (!requirementId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'requirementId is required', 400);
    }

    const shortlists = await getShortlistsForRequirement(requirementId);

    // Fetch candidate details for each shortlist entry in parallel
    const candidates: ShortlistedCandidate[] = [];
    const candidatePromises = shortlists.map(async (entry) => {
      const candidate = await getCandidateById(entry.candidate_id);
      if (candidate) {
        candidates.push({
          candidateId: candidate.candidate_id,
          fullName: candidate.full_name,
          primarySkills: candidate.primary_skills,
          totalExperience: candidate.total_experience,
          seniority: candidate.seniority,
          expectedCtc: candidate.expected_ctc,
          taggedAt: entry.tagged_at,
          notes: entry.notes,
          status: entry.status,
          customFields: candidate.custom_fields || {},
          notInterested: candidate.not_interested || false,
          notInterestedAt: candidate.not_interested_at,
        });
      }
    });

    await Promise.all(candidatePromises);

    // Sort by tagged_at descending (most recent first)
    candidates.sort((a, b) => new Date(b.taggedAt).getTime() - new Date(a.taggedAt).getTime());

    const response: ShortlistedCandidatesResponse = { candidates };
    return success(response);
  } catch (err) {
    console.error('Error fetching shortlisted candidates:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to fetch shortlisted candidates',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
