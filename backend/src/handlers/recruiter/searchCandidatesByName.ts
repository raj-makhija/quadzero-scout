import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { searchCandidatesByName } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';

interface CandidateNameSearchResult {
  candidateId: string;
  fullName: string;
  primarySkills: string[];
  totalExperience: number;
  seniority: string;
  location?: string;
  lastUpdated: string;
  lastScreenedAt?: string;
}

interface CandidateNameSearchResponse {
  candidates: CandidateNameSearchResult[];
}

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const q = event.queryStringParameters?.q;
    const limitParam = event.queryStringParameters?.limit;

    if (!q || q.trim().length < 2) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Query parameter "q" must be at least 2 characters', 400);
    }

    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 100) : 50;

    const items = await searchCandidatesByName(q.trim(), limit);

    const candidates: CandidateNameSearchResult[] = items.map((item) => ({
      candidateId: item.candidate_id,
      fullName: item.full_name,
      primarySkills: item.primary_skills || [],
      totalExperience: item.total_experience,
      seniority: item.seniority,
      location: item.location ?? undefined,
      lastUpdated: item.last_updated,
      lastScreenedAt: item.last_screened_at ?? undefined,
    }));

    const response: CandidateNameSearchResponse = { candidates };

    logAuditEvent(event.auth, event, {
      action: 'CANDIDATE_SEARCH_BY_NAME',
      entityType: 'search',
      entityId: 'name-search',
      metadata: { query: q.trim() },
    });

    return success(response);
  } catch (err) {
    console.error('Error searching candidates by name:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to search candidates',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter', 'admin'], handleRequest);
