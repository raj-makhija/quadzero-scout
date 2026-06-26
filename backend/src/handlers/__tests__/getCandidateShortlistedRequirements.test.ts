import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../lib/dynamodb.js', () => ({
  getShortlistsForCandidate: vi.fn(),
  getRequirementById: vi.fn(),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: vi.fn((_roles: string[], handler: Function) => {
    return (event: Record<string, unknown>) => {
      event.auth = { userId: 'test-user', email: 'test@quadzero.com', role: 'recruiter', isInternal: true };
      return handler(event);
    };
  }),
}));

import { handler } from '../recruiter/getCandidateShortlistedRequirements.js';
import { getShortlistsForCandidate, getRequirementById } from '../../lib/dynamodb.js';

function makeEvent(candidateId?: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: `/recruiter/candidates/${candidateId}/shortlisted`,
    rawQueryString: '',
    headers: { authorization: 'Bearer token123' },
    pathParameters: candidateId ? { candidateId } : {},
    requestContext: {
      accountId: '123456789',
      apiId: 'abc123',
      domainName: 'api.example.com',
      domainPrefix: 'api',
      http: {
        method: 'GET',
        path: `/recruiter/candidates/${candidateId}/shortlisted`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'req123',
      routeKey: '$default',
      stage: '$default',
      time: '15/Jan/2024:10:30:00 +0000',
      timeEpoch: 1705315800000,
    },
    isBase64Encoded: false,
  };
}

const baseRequirement = {
  requirement_id: 'req_1',
  client_name: 'TechCorp',
  end_client: null,
  job_title: 'Developer',
  engagement_model: 'full_time',
  created_at: '2024-01-01T00:00:00Z',
  parsed_criteria: { mustHaveSkills: ['react'], roles: [] },
};

const shortlistedEntry = {
  requirement_id: 'req_1',
  candidate_id: 'cand_1',
  tagged_by: 'user_r',
  tagged_at: '2024-01-15T10:30:00Z',
  status: 'shortlisted' as const,
};

const notSuitableEntry = {
  requirement_id: 'req_2',
  candidate_id: 'cand_1',
  tagged_by: 'user_r',
  tagged_at: '2024-01-14T10:30:00Z',
  status: 'not_suitable' as const,
};

describe('getCandidateShortlistedRequirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when candidateId is missing', async () => {
    const result = await handler(makeEvent() as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(false);
    expect((result as any).statusCode).toBe(400);
  });

  it('returns empty array when candidate has no shortlist entries', async () => {
    vi.mocked(getShortlistsForCandidate).mockResolvedValueOnce([]);

    const result = await handler(makeEvent('cand_1') as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(true);
    expect(body.data.shortlistedRequirements).toHaveLength(0);
  });

  it('excludes not_suitable entries from the response', async () => {
    vi.mocked(getShortlistsForCandidate).mockResolvedValueOnce([notSuitableEntry]);

    const result = await handler(makeEvent('cand_1') as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(true);
    expect(body.data.shortlistedRequirements).toHaveLength(0);
    expect(getRequirementById).not.toHaveBeenCalled();
  });

  it('returns only shortlisted entries when candidate has both shortlisted and not_suitable', async () => {
    vi.mocked(getShortlistsForCandidate).mockResolvedValueOnce([shortlistedEntry, notSuitableEntry]);
    vi.mocked(getRequirementById).mockResolvedValueOnce(baseRequirement);

    const result = await handler(makeEvent('cand_1') as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(true);
    expect(body.data.shortlistedRequirements).toHaveLength(1);
    expect(body.data.shortlistedRequirements[0].requirementId).toBe('req_1');
    expect(getRequirementById).toHaveBeenCalledTimes(1);
    expect(getRequirementById).toHaveBeenCalledWith('req_1');
  });

  it('does not filter out genuine shortlisted entries', async () => {
    vi.mocked(getShortlistsForCandidate).mockResolvedValueOnce([shortlistedEntry]);
    vi.mocked(getRequirementById).mockResolvedValueOnce(baseRequirement);

    const result = await handler(makeEvent('cand_1') as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(true);
    expect(body.data.shortlistedRequirements).toHaveLength(1);
    expect(body.data.shortlistedRequirements[0].status).toBe('shortlisted');
  });

  it('returns empty array when all entries are not_suitable', async () => {
    vi.mocked(getShortlistsForCandidate).mockResolvedValueOnce([
      notSuitableEntry,
      { ...notSuitableEntry, requirement_id: 'req_3' },
    ]);

    const result = await handler(makeEvent('cand_1') as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(true);
    expect(body.data.shortlistedRequirements).toHaveLength(0);
    expect(getRequirementById).not.toHaveBeenCalled();
  });
});
