import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../lib/dynamodb.js', () => ({
  getShortlistsForRequirement: vi.fn(),
  getCandidateById: vi.fn(),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: vi.fn((_roles: string[], handler: Function) => {
    return (event: Record<string, unknown>) => {
      event.auth = { userId: 'test-user', email: 'test@quadzero.com', role: 'recruiter', isInternal: true };
      return handler(event);
    };
  }),
}));

import { handler } from '../recruiter/getShortlistedCandidates.js';
import { getShortlistsForRequirement, getCandidateById } from '../../lib/dynamodb.js';

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/recruiter/requirements/req_1/shortlisted',
    rawQueryString: '',
    headers: { authorization: 'Bearer token123' },
    pathParameters: { requirementId: 'req_1' },
    requestContext: {
      accountId: '123456789',
      apiId: 'abc123',
      domainName: 'api.example.com',
      domainPrefix: 'api',
      http: {
        method: 'GET',
        path: '/recruiter/requirements/req_1/shortlisted',
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
    ...overrides,
  };
}

const baseCandidateItem = {
  candidate_id: 'cand_1',
  user_id: 'user_1',
  full_name: 'John Doe',
  email: 'john@example.com',
  primary_skills: ['react', 'nodejs'],
  primary_skill_years: { react: 3, nodejs: 2 },
  secondary_skills: [],
  total_experience: 5,
  seniority: 'senior',
  availability: 'immediate',
  experience_bucket: '3-5',
  resume_s3_key: 'resumes/2024/01/test.pdf',
  created_at: '2024-01-10T00:00:00Z',
  last_updated: '2024-01-15T00:00:00Z',
  _type: 'PROFILE',
};

const baseShortlistItem = {
  requirement_id: 'req_1',
  candidate_id: 'cand_1',
  tagged_by: 'user_r',
  tagged_at: '2024-01-15T10:30:00Z',
  status: 'shortlisted' as const,
};

describe('getShortlistedCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes rate fields from the shortlist entry in the response', async () => {
    vi.mocked(getShortlistsForRequirement).mockResolvedValueOnce([
      {
        ...baseShortlistItem,
        proposed_rate_hourly: 1500,
        proposed_rate_monthly: 240000,
        internal_rate_hourly: 1200,
        internal_rate_monthly: 192000,
      },
    ]);
    vi.mocked(getCandidateById).mockResolvedValueOnce(baseCandidateItem);

    const result = await handler(makeEvent() as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(true);
    const candidate = body.data.candidates[0];
    expect(candidate.proposedRateHourly).toBe(1500);
    expect(candidate.proposedRateMonthly).toBe(240000);
    expect(candidate.internalRateHourly).toBe(1200);
    expect(candidate.internalRateMonthly).toBe(192000);
  });

  it('returns successfully with no rate fields when none were stored at shortlist time', async () => {
    vi.mocked(getShortlistsForRequirement).mockResolvedValueOnce([baseShortlistItem]);
    vi.mocked(getCandidateById).mockResolvedValueOnce(baseCandidateItem);

    const result = await handler(makeEvent() as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(true);
    const candidate = body.data.candidates[0];
    expect(candidate.proposedRateHourly).toBeUndefined();
    expect(candidate.proposedRateMonthly).toBeUndefined();
    expect(candidate.internalRateHourly).toBeUndefined();
    expect(candidate.internalRateMonthly).toBeUndefined();
  });

  it('correctly passes through zero rates (does not drop falsy values)', async () => {
    vi.mocked(getShortlistsForRequirement).mockResolvedValueOnce([
      {
        ...baseShortlistItem,
        proposed_rate_hourly: 0,
        proposed_rate_monthly: 0,
        internal_rate_hourly: 0,
        internal_rate_monthly: 0,
      },
    ]);
    vi.mocked(getCandidateById).mockResolvedValueOnce(baseCandidateItem);

    const result = await handler(makeEvent() as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(true);
    const candidate = body.data.candidates[0];
    expect(candidate.proposedRateHourly).toBe(0);
    expect(candidate.proposedRateMonthly).toBe(0);
    expect(candidate.internalRateHourly).toBe(0);
    expect(candidate.internalRateMonthly).toBe(0);
  });

  it('excludes not_suitable candidates from the response', async () => {
    vi.mocked(getShortlistsForRequirement).mockResolvedValueOnce([
      { ...baseShortlistItem, status: 'not_suitable' as const },
    ]);

    const result = await handler(makeEvent() as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(true);
    expect(body.data.candidates).toHaveLength(0);
    expect(getCandidateById).not.toHaveBeenCalled();
  });

  it('returns 400 when requirementId is missing', async () => {
    const event = makeEvent({ pathParameters: {} });
    const result = await handler(event as any);
    const body = JSON.parse((result as any).body);

    expect(body.success).toBe(false);
    expect((result as any).statusCode).toBe(400);
  });
});
