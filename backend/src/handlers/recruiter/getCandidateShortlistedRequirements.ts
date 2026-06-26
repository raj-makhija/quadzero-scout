import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getShortlistsForCandidate, getRequirementById } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import type { ShortlistItem, RequirementItem } from '../../types/index.js';

interface ShortlistedRequirement {
  requirementId: string;
  clientName: string;
  endClient?: string;
  jobTitle?: string;
  engagementModel: string;
  mustHaveSkills: string[];
  roles?: string[];
  taggedAt: string;
  taggedBy: string;
  notes?: string;
  status: ShortlistItem['status'];
}

interface CandidateShortlistedRequirementsResponse {
  shortlistedRequirements: ShortlistedRequirement[];
}

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const candidateId = event.pathParameters?.candidateId;
    if (!candidateId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'candidateId is required', 400);
    }

    const allShortlists = await getShortlistsForCandidate(candidateId);
    const shortlists = allShortlists.filter((s) => s.status !== 'not_suitable');
    if (shortlists.length === 0) {
      return success({ shortlistedRequirements: [] } as CandidateShortlistedRequirementsResponse);
    }

    // Fetch requirement details in parallel
    const requirementResults = await Promise.all(
      shortlists.map((entry) => getRequirementById(entry.requirement_id))
    );

    const shortlistedRequirements: ShortlistedRequirement[] = [];
    for (let i = 0; i < shortlists.length; i++) {
      const entry = shortlists[i];
      const req = requirementResults[i] as RequirementItem | null;
      if (req) {
        shortlistedRequirements.push({
          requirementId: req.requirement_id,
          clientName: req.client_name,
          endClient: req.end_client ?? undefined,
          jobTitle: req.job_title ?? undefined,
          engagementModel: req.engagement_model,
          mustHaveSkills: req.parsed_criteria?.mustHaveSkills || [],
          roles: req.parsed_criteria?.roles || [],
          taggedAt: entry.tagged_at,
          taggedBy: entry.tagged_by,
          notes: entry.notes ?? undefined,
          status: entry.status,
        });
      }
    }

    // Sort by tagged_at descending
    shortlistedRequirements.sort(
      (a, b) => new Date(b.taggedAt).getTime() - new Date(a.taggedAt).getTime()
    );

    const response: CandidateShortlistedRequirementsResponse = { shortlistedRequirements };
    return success(response);
  } catch (err) {
    console.error('Error fetching shortlisted requirements for candidate:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to fetch shortlisted requirements',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter', 'admin'], handleRequest);
