import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetRequirementById = vi.fn();
const mockUpdateRequirementStatus = vi.fn();
const mockSafeResolveFoundTasksForRequirement = vi.fn();
const mockRebuildCacheForRequirement = vi.fn();
const mockDeleteMatchCache = vi.fn();
const mockPutMatchCacheFailureMetric = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  getRequirementById: (...args: unknown[]) => mockGetRequirementById(...args),
  updateRequirementStatus: (...args: unknown[]) => mockUpdateRequirementStatus(...args),
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

vi.mock('../../lib/matchCacheService.js', () => ({
  rebuildCacheForRequirement: (...args: unknown[]) => mockRebuildCacheForRequirement(...args),
  deleteMatchCache: (...args: unknown[]) => mockDeleteMatchCache(...args),
}));

vi.mock('../../lib/cloudwatchMetrics.js', () => ({
  putMatchCacheFailureMetric: (...args: unknown[]) => mockPutMatchCacheFailureMetric(...args),
}));

vi.mock('../../lib/recruiterTasks.js', () => ({
  safeResolveFoundTasksForRequirement: (...args: unknown[]) =>
    mockSafeResolveFoundTasksForRequirement(...args),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { handler } from '../recruiter/updateRequirementStatus.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeRequirement = {
  requirement_id: 'req-1',
  job_title: 'React Developer',
  client_name: 'Acme Corp',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  last_updated: '2026-01-01T00:00:00.000Z',
};

function makeEvent(
  body: unknown,
  requirementId = 'req-1',
  userId = 'rec-1',
  isInternal = true
): APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } } {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: `/recruiter/requirements/${requirementId}/status`,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: {
        method: 'PUT',
        path: `/recruiter/requirements/${requirementId}/status`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    pathParameters: { requirementId },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false,
    auth: { userId, role: 'recruiter', isInternal },
  } as unknown as APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } };
}

function parseResponse(result: unknown) {
  const r = result as { statusCode: number; body: string };
  return { statusCode: r.statusCode, body: JSON.parse(r.body) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateRequirementStatus handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequirementById.mockResolvedValue({ ...activeRequirement });
    mockUpdateRequirementStatus.mockResolvedValue(undefined);
    mockSafeResolveFoundTasksForRequirement.mockResolvedValue(undefined);
    mockRebuildCacheForRequirement.mockResolvedValue(undefined);
    mockDeleteMatchCache.mockResolvedValue(undefined);
    mockPutMatchCacheFailureMetric.mockResolvedValue(undefined);
  });

  it('returns 400 when requirementId is missing', async () => {
    const event = makeEvent({ status: 'closed_on_hold' });
    event.pathParameters = {};
    const result = parseResponse(await handler(event));
    expect(result.statusCode).toBe(400);
  });

  it('returns 403 when recruiter is not internal', async () => {
    const result = parseResponse(
      await handler(makeEvent({ status: 'closed_on_hold' }, 'req-1', 'rec-1', false))
    );
    expect(result.statusCode).toBe(403);
  });

  it('returns 400 when body is missing', async () => {
    const event = makeEvent({ status: 'closed_on_hold' });
    event.body = undefined as unknown as string;
    const result = parseResponse(await handler(event));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid status value', async () => {
    const result = parseResponse(await handler(makeEvent({ status: 'unknown_status' })));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when requirement not found', async () => {
    mockGetRequirementById.mockResolvedValue(null);
    const result = parseResponse(await handler(makeEvent({ status: 'closed_on_hold' })));
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when requirement is a duplicate', async () => {
    mockGetRequirementById.mockResolvedValue({ ...activeRequirement, status: 'duplicate' });
    const result = parseResponse(await handler(makeEvent({ status: 'active' })));
    expect(result.statusCode).toBe(400);
  });

  it('returns 200 no-op when status is already the target value', async () => {
    mockGetRequirementById.mockResolvedValue({ ...activeRequirement, status: 'closed_on_hold' });
    const result = parseResponse(await handler(makeEvent({ status: 'closed_on_hold' })));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.status).toBe('closed_on_hold');
    expect(mockUpdateRequirementStatus).not.toHaveBeenCalled();
    expect(mockSafeResolveFoundTasksForRequirement).not.toHaveBeenCalled();
  });

  it('calls safeResolveFoundTasksForRequirement with the requirement ID when transitioning to closed_on_hold', async () => {
    const result = parseResponse(await handler(makeEvent({ status: 'closed_on_hold' }, 'req-1', 'rec-1')));
    expect(result.statusCode).toBe(200);
    expect(mockSafeResolveFoundTasksForRequirement).toHaveBeenCalledOnce();
    expect(mockSafeResolveFoundTasksForRequirement).toHaveBeenCalledWith({
      requirementId: 'req-1',
      completedBy: 'rec-1',
    });
  });

  it('does NOT call safeResolveFoundTasksForRequirement when transitioning to active', async () => {
    mockGetRequirementById.mockResolvedValue({ ...activeRequirement, status: 'closed_on_hold' });
    const result = parseResponse(await handler(makeEvent({ status: 'active' }, 'req-1', 'rec-1')));
    expect(result.statusCode).toBe(200);
    expect(mockSafeResolveFoundTasksForRequirement).not.toHaveBeenCalled();
  });

  it('returns 200 even when safeResolveFoundTasksForRequirement throws', async () => {
    mockSafeResolveFoundTasksForRequirement.mockRejectedValue(new Error('DynamoDB down'));
    const result = parseResponse(await handler(makeEvent({ status: 'closed_on_hold' })));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.status).toBe('closed_on_hold');
  });

  it('succeeds with zero found-candidate tasks (no-op cleanup path)', async () => {
    mockSafeResolveFoundTasksForRequirement.mockResolvedValue(undefined);
    const result = parseResponse(await handler(makeEvent({ status: 'closed_on_hold' })));
    expect(result.statusCode).toBe(200);
    expect(result.body.data.requirementId).toBe('req-1');
  });

  // ticket #447 — a failed cache rebuild on reopen (→ active) must be non-fatal
  // + observable, and the drop path (→ non-active) must not emit the metric.
  it('TC-STATUS-447-a: returns 200 with status active even when the reopen cache rebuild throws', async () => {
    mockGetRequirementById.mockResolvedValue({ ...activeRequirement, status: 'closed_on_hold' });
    mockRebuildCacheForRequirement.mockRejectedValue(new Error('scan failed'));

    const result = parseResponse(await handler(makeEvent({ status: 'active' })));

    expect(result.statusCode).toBe(200);
    expect(result.body.data.status).toBe('active');
  });

  it('TC-STATUS-447-b: logs the requirement ID at error level when the reopen rebuild fails', async () => {
    mockGetRequirementById.mockResolvedValue({ ...activeRequirement, status: 'closed_on_hold' });
    mockRebuildCacheForRequirement.mockRejectedValue(new Error('scan failed'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler(makeEvent({ status: 'active' }));

    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('req-1'))).toBe(true);
    errSpy.mockRestore();
  });

  it('TC-STATUS-447-c: emits the cache-build failure metric once when the reopen rebuild fails', async () => {
    mockGetRequirementById.mockResolvedValue({ ...activeRequirement, status: 'closed_on_hold' });
    mockRebuildCacheForRequirement.mockRejectedValue(new Error('scan failed'));

    await handler(makeEvent({ status: 'active' }));

    expect(mockPutMatchCacheFailureMetric).toHaveBeenCalledOnce();
    expect(mockPutMatchCacheFailureMetric).toHaveBeenCalledWith('req-1');
  });

  it('TC-STATUS-447-d: does not emit the failure metric on a non-active transition (drop path)', async () => {
    const result = parseResponse(await handler(makeEvent({ status: 'closed_on_hold' })));

    expect(result.statusCode).toBe(200);
    expect(mockDeleteMatchCache).toHaveBeenCalledWith('req-1');
    expect(mockRebuildCacheForRequirement).not.toHaveBeenCalled();
    expect(mockPutMatchCacheFailureMetric).not.toHaveBeenCalled();
  });
});
