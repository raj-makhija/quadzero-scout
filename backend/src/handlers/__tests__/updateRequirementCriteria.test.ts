import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetRequirementById = vi.fn();
const mockUpdateRequirementCriteria = vi.fn();
const mockInvokeLambdaAsync = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  getRequirementById: (...args: unknown[]) => mockGetRequirementById(...args),
  updateRequirementCriteria: (...args: unknown[]) => mockUpdateRequirementCriteria(...args),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (
    _roles: string[],
    handler: (event: unknown) => Promise<unknown>
  ) => handler,
}));

vi.mock('../../lib/audit.js', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('../../lib/lambdaInvoke.js', () => ({
  invokeLambdaAsync: (...args: unknown[]) => mockInvokeLambdaAsync(...args),
}));

vi.mock('../../lib/config.js', () => ({
  config: { lambda: { matchCacheRequirementWorkerName: 'match-cache-req-worker' } },
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { handler } from '../recruiter/updateRequirementCriteria.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parsedCriteria = {
  mustHaveSkills: ['react'],
  goodToHaveSkills: ['typescript'],
  minExperience: 3,
  maxExperience: null,
  seniority: ['mid'],
  availability: ['immediate'],
  location: null,
  remote: false,
  industries: [],
  roles: ['Frontend Developer'],
  rateRaw: null,
  rateUnit: null,
  rateLpa: null,
  clientName: null,
  endClient: null,
  engagementModel: null,
  payroll: null,
  budgetMinLpa: null,
  budgetMaxLpa: null,
  coreSkill: 'react',
  contractDurationMonths: null,
  paymentTermsDays: null,
  confidence: 0.9,
  suggestions: [],
};

const validBody = { parsedCriteria, maxBudgetLpa: 25 };

const existingRequirement = {
  requirement_id: 'req-123',
  recruiter_id: 'rec-owner',
  parsed_criteria: parsedCriteria,
  budget_max_lpa: 20,
  status: 'active',
  last_updated: '2026-01-01T00:00:00.000Z',
};

function makeEvent(
  body: unknown,
  userId = 'rec-owner',
  requirementId = 'req-123'
): APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } } {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: `/recruiter/requirements/${requirementId}/criteria`,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: { method: 'PUT', path: `/recruiter/requirements/${requirementId}/criteria`, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    pathParameters: { requirementId },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false,
    auth: { userId, role: 'recruiter', isInternal: true },
  } as unknown as APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } };
}

function parseResponse(result: unknown) {
  const r = result as { statusCode: number; body: string };
  return { statusCode: r.statusCode, body: JSON.parse(r.body) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateRequirementCriteria handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequirementById.mockResolvedValue({ ...existingRequirement });
    mockUpdateRequirementCriteria.mockResolvedValue(undefined);
    mockInvokeLambdaAsync.mockResolvedValue(undefined);
  });

  it('succeeds and dispatches the cache rebuild on a normal criteria edit', async () => {
    const result = parseResponse(await handler(makeEvent(validBody)));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.requirementId).toBe('req-123');
    expect(mockInvokeLambdaAsync).toHaveBeenCalledOnce();
    expect(mockInvokeLambdaAsync).toHaveBeenCalledWith('match-cache-req-worker', {
      requirementId: 'req-123',
    });
  });

  it('does not dispatch the rebuild when the requirement is not active', async () => {
    mockGetRequirementById.mockResolvedValue({ ...existingRequirement, status: 'closed_won' });
    const result = parseResponse(await handler(makeEvent(validBody)));
    expect(result.statusCode).toBe(200);
    expect(mockInvokeLambdaAsync).not.toHaveBeenCalled();
  });

  // ticket #469 — the cache rebuild is dispatched to the async worker (off the
  // 30s request path), not run inline. The rebuild + #447 failure observability
  // is exercised in matchCacheRequirementWorker.test.ts.
  it('TC-CRITERIA-469-a: returns 200 even when the worker dispatch throws', async () => {
    mockInvokeLambdaAsync.mockRejectedValue(new Error('invoke failed'));
    const result = parseResponse(await handler(makeEvent(validBody)));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.requirementId).toBe('req-123');
  });
});
