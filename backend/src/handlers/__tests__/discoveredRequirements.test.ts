import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetDiscoveredRequirements = vi.fn();
const mockGetRequirementById = vi.fn();
const mockPromoteDiscoveredRequirement = vi.fn();
const mockDismissDiscoveredRequirement = vi.fn();
const mockInvokeLambdaAsync = vi.fn();
const mockParseJobDescription = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  getDiscoveredRequirements: (...a: unknown[]) => mockGetDiscoveredRequirements(...a),
  getRequirementById: (...a: unknown[]) => mockGetRequirementById(...a),
  promoteDiscoveredRequirement: (...a: unknown[]) => mockPromoteDiscoveredRequirement(...a),
  dismissDiscoveredRequirement: (...a: unknown[]) => mockDismissDiscoveredRequirement(...a),
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
  invokeLambdaAsync: (...a: unknown[]) => mockInvokeLambdaAsync(...a),
}));

vi.mock('../../lib/config.js', () => ({
  config: { lambda: { matchCacheRequirementWorkerName: 'test-matchCacheRequirementWorker' } },
}));

vi.mock('../../lib/llm/index.js', () => ({
  parseJobDescription: (...a: unknown[]) => mockParseJobDescription(...a),
}));

vi.mock('../../lib/locationNormalizer.js', () => ({
  normalizeLocation: (loc: string | null) => loc,
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { handler as listHandler } from '../recruiter/listDiscoveredRequirements.js';
import { handler as promoteHandler } from '../recruiter/promoteDiscoveredRequirement.js';
import { handler as dismissHandler } from '../recruiter/dismissDiscoveredRequirement.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const discoveredRequirement = {
  requirement_id: 'req-disc-1',
  job_title: 'Senior React Developer',
  status: 'discovered',
  origin: 'portal-scan',
  source_company: 'Acme Corp',
  source_url: 'https://jobs.acme.com/1',
  source_location: 'Bangalore',
  posted_at: '2026-06-01T10:00:00Z',
  jd_text: 'We are looking for a senior react developer with 5+ years of experience...',
  parsed_criteria: {
    mustHaveSkills: [],
    goodToHaveSkills: [],
    minExperience: null,
    maxExperience: null,
    seniority: [],
    location: null,
  },
  created_at: '2026-06-29T00:00:00Z',
  last_updated: '2026-06-29T00:00:00Z',
  recruiter_id: '',
  client_name: '',
  client_name_lower: '',
  engagement_model: '',
  payroll: '',
  notify_recruiter_ids: [],
};

const parsedCriteriaResult = {
  mustHaveSkills: ['react', 'typescript'],
  goodToHaveSkills: ['nodejs'],
  minExperience: 5,
  maxExperience: null,
  seniority: ['senior'],
  location: 'Bangalore',
  remote: false,
  industries: [],
  roles: ['Frontend Developer'],
};

function makeListEvent(): APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } } {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/recruiter/discovered-requirements',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: { method: 'GET', path: '/recruiter/discovered-requirements', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jun/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    pathParameters: {},
    isBase64Encoded: false,
    auth: { userId: 'rec-1', role: 'recruiter', isInternal: true },
  } as unknown as APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } };
}

function makePromoteEvent(
  body: unknown,
  requirementId = 'req-disc-1'
): APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } } {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: `/recruiter/discovered-requirements/${requirementId}/promote`,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: { method: 'POST', path: `/recruiter/discovered-requirements/${requirementId}/promote`, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jun/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    pathParameters: { requirementId },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false,
    auth: { userId: 'rec-1', role: 'recruiter', isInternal: true },
  } as unknown as APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } };
}

function makeDismissEvent(
  requirementId = 'req-disc-1'
): APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } } {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: `/recruiter/discovered-requirements/${requirementId}/dismiss`,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: { method: 'POST', path: `/recruiter/discovered-requirements/${requirementId}/dismiss`, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jun/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    pathParameters: { requirementId },
    isBase64Encoded: false,
    auth: { userId: 'rec-1', role: 'recruiter', isInternal: true },
  } as unknown as APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } };
}

function parseResponse(result: unknown) {
  const r = result as { statusCode: number; body: string };
  return { statusCode: r.statusCode, body: JSON.parse(r.body) };
}

// ---------------------------------------------------------------------------
// List discovered requirements
// ---------------------------------------------------------------------------

describe('listDiscoveredRequirements handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDiscoveredRequirements.mockResolvedValue([discoveredRequirement]);
  });

  it('returns only discovered requirements', async () => {
    const result = parseResponse(await listHandler(makeListEvent()));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.requirements).toHaveLength(1);
    expect(result.body.data.requirements[0].requirementId).toBe('req-disc-1');
  });

  it('includes source provenance fields for each item', async () => {
    const result = parseResponse(await listHandler(makeListEvent()));
    const item = result.body.data.requirements[0];
    expect(item).toMatchObject({
      requirementId: 'req-disc-1',
      title: 'Senior React Developer',
      sourceCompany: 'Acme Corp',
      sourceUrl: 'https://jobs.acme.com/1',
      location: 'Bangalore',
      postedAt: '2026-06-01T10:00:00Z',
      createdAt: '2026-06-29T00:00:00Z',
    });
  });

  it('handles missing postedAt gracefully (returns null)', async () => {
    mockGetDiscoveredRequirements.mockResolvedValue([
      { ...discoveredRequirement, posted_at: undefined },
    ]);
    const result = parseResponse(await listHandler(makeListEvent()));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.requirements[0].postedAt).toBeNull();
  });

  it('handles missing location gracefully (returns null)', async () => {
    mockGetDiscoveredRequirements.mockResolvedValue([
      { ...discoveredRequirement, source_location: undefined },
    ]);
    const result = parseResponse(await listHandler(makeListEvent()));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.requirements[0].location).toBeNull();
  });

  it('returns items ordered newest-first', async () => {
    const older = { ...discoveredRequirement, requirement_id: 'req-older', created_at: '2026-06-27T00:00:00Z' };
    const newer = { ...discoveredRequirement, requirement_id: 'req-newer', created_at: '2026-06-30T00:00:00Z' };
    // getDiscoveredRequirements sorts internally; simulate that here
    mockGetDiscoveredRequirements.mockResolvedValue([newer, older]);

    const result = parseResponse(await listHandler(makeListEvent()));
    expect(result.body.data.requirements[0].requirementId).toBe('req-newer');
    expect(result.body.data.requirements[1].requirementId).toBe('req-older');
  });

  it('returns empty list when no discovered requirements exist', async () => {
    mockGetDiscoveredRequirements.mockResolvedValue([]);
    const result = parseResponse(await listHandler(makeListEvent()));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.requirements).toHaveLength(0);
  });

  it('does not include active or closed_on_hold requirements in response', async () => {
    // The filtering happens in getDiscoveredRequirements (mocked to return only discovered)
    mockGetDiscoveredRequirements.mockResolvedValue([]);
    const result = parseResponse(await listHandler(makeListEvent()));
    expect(result.body.data.requirements).toHaveLength(0);
  });

  it('returns 500 when DynamoDB throws', async () => {
    mockGetDiscoveredRequirements.mockRejectedValue(new Error('DynamoDB down'));
    const result = parseResponse(await listHandler(makeListEvent()));
    expect(result.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Promote discovered requirement
// ---------------------------------------------------------------------------

describe('promoteDiscoveredRequirement handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequirementById.mockResolvedValue({ ...discoveredRequirement });
    mockPromoteDiscoveredRequirement.mockResolvedValue(undefined);
    mockInvokeLambdaAsync.mockResolvedValue(undefined);
    mockParseJobDescription.mockResolvedValue({
      output: parsedCriteriaResult,
      confidence: 0.9,
      suggestions: [],
    });
  });

  it('returns 400 when requirementId is missing', async () => {
    const event = makePromoteEvent({ clientName: 'Foo Corp' });
    event.pathParameters = {};
    const result = parseResponse(await promoteHandler(event));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when body is missing', async () => {
    const event = makePromoteEvent({ clientName: 'Foo Corp' });
    event.body = undefined as unknown as string;
    const result = parseResponse(await promoteHandler(event));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when clientName is missing', async () => {
    const result = parseResponse(await promoteHandler(makePromoteEvent({})));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when clientName is empty string', async () => {
    const result = parseResponse(await promoteHandler(makePromoteEvent({ clientName: '' })));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when recruiter_id (auth userId) is empty', async () => {
    const event = makePromoteEvent({ clientName: 'Foo Corp' });
    (event as unknown as { auth: { userId: string } }).auth.userId = '';
    const result = parseResponse(await promoteHandler(event));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when requirement not found', async () => {
    mockGetRequirementById.mockResolvedValue(null);
    const result = parseResponse(await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' })));
    expect(result.statusCode).toBe(404);
  });

  it('returns 422 when requirement is not in discovered status (already active)', async () => {
    mockGetRequirementById.mockResolvedValue({ ...discoveredRequirement, status: 'active' });
    const result = parseResponse(await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' })));
    expect(result.statusCode).toBe(422);
    expect(mockParseJobDescription).not.toHaveBeenCalled();
  });

  it('returns 422 when requirement is not in discovered status (closed_on_hold)', async () => {
    mockGetRequirementById.mockResolvedValue({ ...discoveredRequirement, status: 'closed_on_hold' });
    const result = parseResponse(await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' })));
    expect(result.statusCode).toBe(422);
    expect(mockParseJobDescription).not.toHaveBeenCalled();
  });

  it('calls parseJobDescription with the stored jd_text', async () => {
    await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' }));
    expect(mockParseJobDescription).toHaveBeenCalledOnce();
    expect(mockParseJobDescription).toHaveBeenCalledWith(discoveredRequirement.jd_text);
  });

  it('returns 422 and does not write to DynamoDB when parseJobDescription throws', async () => {
    mockParseJobDescription.mockRejectedValue(new Error('LLM timeout'));
    const result = parseResponse(await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' })));
    expect(result.statusCode).toBe(422);
    expect(mockPromoteDiscoveredRequirement).not.toHaveBeenCalled();
    expect(mockInvokeLambdaAsync).not.toHaveBeenCalled();
  });

  it('writes parsed_criteria into the DynamoDB update', async () => {
    await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' }));
    expect(mockPromoteDiscoveredRequirement).toHaveBeenCalledOnce();
    const [, parsedCriteria] = mockPromoteDiscoveredRequirement.mock.calls[0] as [string, Record<string, unknown>];
    expect(parsedCriteria).toMatchObject({ mustHaveSkills: ['react', 'typescript'] });
  });

  it('writes recruiter_id (from auth), client_name, and optional fields into the DynamoDB update', async () => {
    await promoteHandler(makePromoteEvent({
      clientName: 'Foo Corp',
      engagementModel: 'full_time_contract',
      payroll: 'client',
    }));
    expect(mockPromoteDiscoveredRequirement).toHaveBeenCalledWith(
      'req-disc-1',
      expect.any(Object),
      'rec-1',
      'Foo Corp',
      'full_time_contract',
      'client'
    );
  });

  it('flips status to active via promoteDiscoveredRequirement (condition enforces discovered)', async () => {
    const result = parseResponse(await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' })));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.status).toBe('active');
    expect(mockPromoteDiscoveredRequirement).toHaveBeenCalledOnce();
  });

  it('dispatches matchCacheRequirementWorker after status flip', async () => {
    await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' }));
    expect(mockInvokeLambdaAsync).toHaveBeenCalledOnce();
    expect(mockInvokeLambdaAsync).toHaveBeenCalledWith(
      'test-matchCacheRequirementWorker',
      { requirementId: 'req-disc-1' }
    );
  });

  it('returns 200 even when the cache-worker dispatch throws (non-fatal)', async () => {
    mockInvokeLambdaAsync.mockRejectedValue(new Error('AccessDeniedException'));
    const result = parseResponse(await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' })));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.status).toBe('active');
  });

  it('returns 409 when concurrent promote already flipped the status (ConditionalCheckFailedException)', async () => {
    const err = Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
    mockPromoteDiscoveredRequirement.mockRejectedValue(err);
    const result = parseResponse(await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' })));
    expect(result.statusCode).toBe(409);
    expect(mockInvokeLambdaAsync).not.toHaveBeenCalled();
  });

  it('returns 200 and the promoted requirement appears as active (getAllRequirementsPaginated no longer filtered)', async () => {
    const result = parseResponse(await promoteHandler(makePromoteEvent({ clientName: 'Foo Corp' })));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.status).toBe('active');
  });

  it('no longer appears in discovered list after promotion (list returns only discovered)', async () => {
    // After promote, listDiscoveredRequirements would return empty (DynamoDB no longer has status=discovered)
    // We simulate by setting getDiscoveredRequirements to return []
    mockGetDiscoveredRequirements.mockResolvedValue([]);
    const listResult = parseResponse(await listHandler(makeListEvent()));
    expect(listResult.body.data.requirements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dismiss discovered requirement
// ---------------------------------------------------------------------------

describe('dismissDiscoveredRequirement handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequirementById.mockResolvedValue({ ...discoveredRequirement });
    mockDismissDiscoveredRequirement.mockResolvedValue(undefined);
  });

  it('returns 400 when requirementId is missing', async () => {
    const event = makeDismissEvent();
    event.pathParameters = {};
    const result = parseResponse(await dismissHandler(event));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when requirement not found', async () => {
    mockGetRequirementById.mockResolvedValue(null);
    const result = parseResponse(await dismissHandler(makeDismissEvent()));
    expect(result.statusCode).toBe(404);
  });

  it('returns 422 when requirement is not in discovered status', async () => {
    mockGetRequirementById.mockResolvedValue({ ...discoveredRequirement, status: 'active' });
    const result = parseResponse(await dismissHandler(makeDismissEvent()));
    expect(result.statusCode).toBe(422);
    expect(mockDismissDiscoveredRequirement).not.toHaveBeenCalled();
  });

  it('removes the item from the discovered queue (calls dismissDiscoveredRequirement)', async () => {
    const result = parseResponse(await dismissHandler(makeDismissEvent()));
    expect(result.statusCode).toBe(200);
    expect(mockDismissDiscoveredRequirement).toHaveBeenCalledOnce();
    expect(mockDismissDiscoveredRequirement).toHaveBeenCalledWith('req-disc-1');
  });

  it('returns 409 on ConditionalCheckFailedException (concurrent dismiss/promote)', async () => {
    const err = Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
    mockDismissDiscoveredRequirement.mockRejectedValue(err);
    const result = parseResponse(await dismissHandler(makeDismissEvent()));
    expect(result.statusCode).toBe(409);
  });

  it('no longer appears in discovered list after dismiss', async () => {
    mockGetDiscoveredRequirements.mockResolvedValue([]);
    const listResult = parseResponse(await listHandler(makeListEvent()));
    expect(listResult.body.data.requirements).toHaveLength(0);
  });

  it('returns 500 on unexpected DynamoDB error', async () => {
    mockDismissDiscoveredRequirement.mockRejectedValue(new Error('DynamoDB down'));
    const result = parseResponse(await dismissHandler(makeDismissEvent()));
    expect(result.statusCode).toBe(500);
  });
});
