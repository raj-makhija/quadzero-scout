import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetRequirementById = vi.fn();
const mockUpdateRequirementNotifyIds = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  getRequirementById: (...args: unknown[]) => mockGetRequirementById(...args),
  updateRequirementNotifyIds: (...args: unknown[]) => mockUpdateRequirementNotifyIds(...args),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (
    _roles: string[],
    handler: (event: unknown) => Promise<unknown>
  ) => handler,
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { handler } from '../recruiter/toggleRequirementNotify.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  requirementId: string,
  body: unknown,
  userId = 'rec_1'
): APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } } {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: `/recruiter/requirements/${requirementId}/notify`,
    rawQueryString: '',
    headers: {},
    pathParameters: { requirementId },
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: { method: 'PUT', path: `/recruiter/requirements/${requirementId}/notify`, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    body: JSON.stringify(body),
    auth: { userId, role: 'recruiter', isInternal: false },
  } as never;
}

function parseBody(result: { body?: string }) {
  return JSON.parse(result.body || '{}');
}

const baseRequirement = {
  requirement_id: 'req_1',
  recruiter_id: 'rec_owner',
  client_name: 'Acme',
  status: 'active',
  notify_recruiter_ids: ['rec_owner'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('toggleRequirementNotify handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateRequirementNotifyIds.mockResolvedValue(undefined);
  });

  it('TC-TOGGLE-001: adds recruiter to notify list when notify=true', async () => {
    mockGetRequirementById.mockResolvedValue({ ...baseRequirement, notify_recruiter_ids: ['rec_owner'] });
    const event = makeEvent('req_1', { notify: true }, 'rec_1');
    const result = await handler(event as never);
    const body = parseBody(result as { body?: string });

    expect(body.success).toBe(true);
    expect(body.data.notify).toBe(true);
    expect(body.data.notifyRecruiterIds).toContain('rec_owner');
    expect(body.data.notifyRecruiterIds).toContain('rec_1');
    expect(mockUpdateRequirementNotifyIds).toHaveBeenCalledWith('req_1', expect.arrayContaining(['rec_owner', 'rec_1']));
  });

  it('TC-TOGGLE-002: removes recruiter from notify list when notify=false', async () => {
    mockGetRequirementById.mockResolvedValue({ ...baseRequirement, notify_recruiter_ids: ['rec_owner', 'rec_1'] });
    const event = makeEvent('req_1', { notify: false }, 'rec_1');
    const result = await handler(event as never);
    const body = parseBody(result as { body?: string });

    expect(body.success).toBe(true);
    expect(body.data.notify).toBe(false);
    expect(body.data.notifyRecruiterIds).not.toContain('rec_1');
    expect(body.data.notifyRecruiterIds).toContain('rec_owner');
  });

  it('TC-TOGGLE-003: opt-in is idempotent (no duplicates)', async () => {
    mockGetRequirementById.mockResolvedValue({ ...baseRequirement, notify_recruiter_ids: ['rec_owner', 'rec_1'] });
    const event = makeEvent('req_1', { notify: true }, 'rec_1');
    const result = await handler(event as never);
    const body = parseBody(result as { body?: string });

    expect(body.success).toBe(true);
    const ids: string[] = body.data.notifyRecruiterIds;
    expect(ids.filter((id: string) => id === 'rec_1').length).toBe(1);
  });

  it('TC-TOGGLE-004: opt-out when not subscribed returns empty or unchanged list', async () => {
    mockGetRequirementById.mockResolvedValue({ ...baseRequirement, notify_recruiter_ids: ['rec_owner'] });
    const event = makeEvent('req_1', { notify: false }, 'rec_nobody');
    const result = await handler(event as never);
    const body = parseBody(result as { body?: string });

    expect(body.success).toBe(true);
    expect(body.data.notifyRecruiterIds).toEqual(['rec_owner']);
  });

  it('TC-TOGGLE-005: returns 404 when requirement does not exist', async () => {
    mockGetRequirementById.mockResolvedValue(null);
    const event = makeEvent('req_missing', { notify: true });
    const result = await handler(event as never);
    const body = parseBody(result as { body?: string });

    expect((result as { statusCode: number }).statusCode).toBe(404);
    expect(body.success).toBe(false);
  });

  it('TC-TOGGLE-006: returns 400 when body is missing', async () => {
    const event = makeEvent('req_1', null);
    (event as { body: string | null }).body = null as unknown as string;
    const result = await handler(event as never);
    const body = parseBody(result as { body?: string });

    expect((result as { statusCode: number }).statusCode).toBe(400);
    expect(body.success).toBe(false);
  });

  it('TC-TOGGLE-007: returns 400 when notify field is missing', async () => {
    mockGetRequirementById.mockResolvedValue(baseRequirement);
    const event = makeEvent('req_1', { someOtherField: true });
    const result = await handler(event as never);
    const body = parseBody(result as { body?: string });

    expect((result as { statusCode: number }).statusCode).toBe(400);
    expect(body.success).toBe(false);
  });

  it('TC-TOGGLE-008: handles requirement with no existing notify_recruiter_ids field', async () => {
    const reqWithoutNotify = { ...baseRequirement, notify_recruiter_ids: undefined };
    mockGetRequirementById.mockResolvedValue(reqWithoutNotify);
    const event = makeEvent('req_1', { notify: true }, 'rec_1');
    const result = await handler(event as never);
    const body = parseBody(result as { body?: string });

    expect(body.success).toBe(true);
    expect(body.data.notifyRecruiterIds).toContain('rec_1');
  });
});
