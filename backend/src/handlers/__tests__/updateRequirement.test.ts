import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetRequirementById = vi.fn();
const mockUpdateRequirementFields = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  getRequirementById: (...args: unknown[]) => mockGetRequirementById(...args),
  updateRequirementFields: (...args: unknown[]) => mockUpdateRequirementFields(...args),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (
    _roles: string[],
    handler: (event: unknown) => Promise<unknown>
  ) => handler,
}));

vi.mock('../../lib/slugify.js', () => ({
  slugifyFieldKey: (label: string) => label.toLowerCase().replace(/\s+/g, '_'),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { handler } from '../recruiter/updateRequirement.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const existingRequirement = {
  requirement_id: 'req-123',
  recruiter_id: 'rec-owner',
  client_name: 'Acme Corp',
  client_name_lower: 'acme corp',
  end_client: 'TechCo',
  engagement_model: 'full_time_contract',
  payroll: 'quadzero',
  budget_min_lpa: 10,
  budget_max_lpa: 20,
  contract_duration_months: 6,
  payment_terms_days: 30,
  job_title: 'React Developer',
  jd_text: 'Looking for a React developer with 3+ years of experience in modern frontend.',
  parsed_criteria: { mustHaveSkills: ['react'], goodToHaveSkills: ['typescript'], minExperience: 3, maxExperience: null, seniority: ['mid'], location: null, remote: false },
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  last_updated: '2026-01-01T00:00:00.000Z',
};

function makeEvent(
  body: unknown,
  userId = 'rec-owner',
  requirementId = 'req-123',
  isInternal = true,
  role = 'recruiter'
): APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } } {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: `/recruiter/requirements/${requirementId}/details`,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: { method: 'PUT', path: `/recruiter/requirements/${requirementId}/details`, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    pathParameters: { requirementId },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false,
    auth: { userId, role, isInternal },
  } as unknown as APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } };
}

function parseResponse(result: unknown) {
  const r = result as { statusCode: number; body: string };
  return { statusCode: r.statusCode, body: JSON.parse(r.body) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateRequirement handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequirementById.mockResolvedValue({ ...existingRequirement });
    mockUpdateRequirementFields.mockResolvedValue(undefined);
  });

  it('returns 400 when requirementId is missing', async () => {
    const event = makeEvent({ clientName: 'New Corp' }, 'rec-owner', '');
    event.pathParameters = {};
    const result = parseResponse(await handler(event));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when body is empty', async () => {
    const event = makeEvent(null);
    event.body = undefined as unknown as string;
    const result = parseResponse(await handler(event));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when body has no updatable fields', async () => {
    const result = parseResponse(await handler(makeEvent({})));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when requirement not found', async () => {
    mockGetRequirementById.mockResolvedValue(null);
    const result = parseResponse(await handler(makeEvent({ clientName: 'New Corp' })));
    expect(result.statusCode).toBe(404);
  });

  it('returns 403 when recruiter is not internal and not admin', async () => {
    const result = parseResponse(await handler(makeEvent({ clientName: 'New Corp' }, 'rec-owner', 'req-123', false)));
    expect(result.statusCode).toBe(403);
  });

  it('allows admin user to edit even when not internal', async () => {
    const result = parseResponse(await handler(makeEvent({ clientName: 'New Corp' }, 'admin-user', 'req-123', false, 'admin')));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.fieldsUpdated).toContain('clientName');
  });

  it('allows a different internal recruiter to edit', async () => {
    const result = parseResponse(await handler(makeEvent({ clientName: 'New Corp' }, 'other-recruiter', 'req-123', true)));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.fieldsUpdated).toContain('clientName');
  });

  it('returns 400 when requirement is a duplicate', async () => {
    mockGetRequirementById.mockResolvedValue({ ...existingRequirement, status: 'duplicate' });
    const result = parseResponse(await handler(makeEvent({ clientName: 'New Corp' })));
    expect(result.statusCode).toBe(400);
  });

  it('succeeds when changing clientName', async () => {
    const result = parseResponse(await handler(makeEvent({ clientName: 'New Corp' })));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.fieldsUpdated).toContain('clientName');
    expect(mockUpdateRequirementFields).toHaveBeenCalledTimes(1);

    // Verify the change entry has the correct diff
    const callArgs = mockUpdateRequirementFields.mock.calls[0];
    expect(callArgs[0]).toBe('req-123');
    expect(callArgs[1]).toHaveProperty('client_name', 'New Corp');
    expect(callArgs[1]).toHaveProperty('client_name_lower', 'new corp');
    expect(callArgs[2].changes).toEqual([
      { field: 'clientName', old_value: 'Acme Corp', new_value: 'New Corp' },
    ]);
  });

  it('returns no changes when values are the same', async () => {
    const result = parseResponse(await handler(makeEvent({ clientName: 'Acme Corp' })));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.fieldsUpdated).toEqual([]);
    expect(result.body.data.message).toBe('No fields changed');
    expect(mockUpdateRequirementFields).not.toHaveBeenCalled();
  });

  it('tracks multiple field changes in single entry', async () => {
    const result = parseResponse(await handler(makeEvent({
      clientName: 'New Corp',
      payroll: 'client',
      budgetMaxLpa: 30,
    })));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.fieldsUpdated).toHaveLength(3);
    expect(result.body.data.fieldsUpdated).toContain('clientName');
    expect(result.body.data.fieldsUpdated).toContain('payroll');
    expect(result.body.data.fieldsUpdated).toContain('budgetMaxLpa');
  });

  it('handles nullable fields correctly', async () => {
    const result = parseResponse(await handler(makeEvent({ budgetMinLpa: null })));
    expect(result.statusCode).toBe(200);
    // budgetMinLpa was 10, now null — should be a change
    expect(result.body.data.fieldsUpdated).toContain('budgetMinLpa');
  });
});
