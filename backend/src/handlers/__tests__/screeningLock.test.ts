import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAcquireScreeningLock = vi.fn().mockResolvedValue(undefined);
const mockReleaseScreeningLock = vi.fn().mockResolvedValue(undefined);
const mockReleaseScreeningLockByToken = vi.fn().mockResolvedValue(undefined);
const mockHeartbeatScreeningLock = vi.fn().mockResolvedValue(undefined);
const mockGetScreeningLock = vi.fn().mockResolvedValue(null);
const mockGetUserById = vi.fn().mockResolvedValue({ id: 'recruiter_1', name: 'Test Recruiter', email: 'recruiter@quadzero.com' });

vi.mock('../../lib/dynamodb.js', () => ({
  getLlmRerank: vi.fn().mockResolvedValue(null),
  putLlmRerank: vi.fn().mockResolvedValue(undefined),
  deleteLlmRerank: vi.fn().mockResolvedValue(undefined),
  acquireScreeningLock: (...args: unknown[]) => mockAcquireScreeningLock(...args),
  releaseScreeningLock: (...args: unknown[]) => mockReleaseScreeningLock(...args),
  releaseScreeningLockByToken: (...args: unknown[]) => mockReleaseScreeningLockByToken(...args),
  heartbeatScreeningLock: (...args: unknown[]) => mockHeartbeatScreeningLock(...args),
  getScreeningLock: (...args: unknown[]) => mockGetScreeningLock(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  SCREENING_LOCK_TTL_SECONDS: 600,
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (_roles: string[], handler: Function) => handler,
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeEvent(body: unknown): APIGatewayProxyEventV2 {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { authorization: 'Bearer test-token' },
    requestContext: {} as any,
    routeKey: '',
    rawPath: '',
    rawQueryString: '',
    isBase64Encoded: false,
    auth: { userId: 'recruiter_1', email: 'recruiter@quadzero.com', role: 'recruiter', isInternal: true },
  } as any;
}

function makeEvent2(body: unknown): APIGatewayProxyEventV2 {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { authorization: 'Bearer test-token' },
    requestContext: {} as any,
    routeKey: '',
    rawPath: '',
    rawQueryString: '',
    isBase64Encoded: false,
    auth: { userId: 'recruiter_2', email: 'recruiter2@quadzero.com', role: 'recruiter', isInternal: true },
  } as any;
}

const existingLock = {
  candidate_id: 'cand_1',
  locked_by: 'recruiter_2',
  locked_by_email: 'recruiter2@quadzero.com',
  locked_by_name: 'Recruiter Two',
  locked_at: '2026-03-25T10:00:00Z',
  lock_token: 'token-abc',
  ttl: Math.floor(Date.now() / 1000) + 600,
};

// ---------------------------------------------------------------------------
// Tests: Acquire Screening Lock
// ---------------------------------------------------------------------------

describe('acquireScreeningLock handler', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../recruiter/acquireScreeningLock.js');
    handler = mod.handler;
  });

  it('should acquire lock on unlocked candidate', async () => {
    const event = makeEvent({ candidateId: 'cand_1' });
    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.acquired).toBe(true);
    expect(body.data.lockToken).toBeDefined();
    expect(body.data.expiresAt).toBeDefined();
    expect(mockAcquireScreeningLock).toHaveBeenCalledOnce();
  });

  it('should return 409 when lock is held by another recruiter', async () => {
    const conditionalError = new Error('ConditionalCheckFailedException');
    conditionalError.name = 'ConditionalCheckFailedException';
    mockAcquireScreeningLock.mockRejectedValueOnce(conditionalError);
    mockGetScreeningLock.mockResolvedValueOnce(existingLock);

    const event = makeEvent({ candidateId: 'cand_1' });
    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(409);
    expect(body.error.code).toBe('SCREENING_LOCKED');
    expect(body.error.details.lockedBy).toBe('Recruiter Two');
    expect(body.error.details.lockedByEmail).toBe('recruiter2@quadzero.com');
    expect(body.error.details.lockedAt).toBe('2026-03-25T10:00:00Z');
  });

  it('should retry when lock expired between conditional check and read', async () => {
    const conditionalError = new Error('ConditionalCheckFailedException');
    conditionalError.name = 'ConditionalCheckFailedException';
    mockAcquireScreeningLock
      .mockRejectedValueOnce(conditionalError)
      .mockResolvedValueOnce(undefined);
    mockGetScreeningLock.mockResolvedValueOnce(null); // Lock expired

    const event = makeEvent({ candidateId: 'cand_1' });
    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.acquired).toBe(true);
    expect(mockAcquireScreeningLock).toHaveBeenCalledTimes(2);
  });

  it('should return 400 for missing candidateId', async () => {
    const event = makeEvent({});
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for invalid JSON body', async () => {
    const event = makeEvent('not-json');
    event.body = 'not-json{';
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for missing body', async () => {
    const event = makeEvent({});
    event.body = undefined as any;
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Release Screening Lock
// ---------------------------------------------------------------------------

describe('releaseScreeningLock handler', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../recruiter/releaseScreeningLock.js');
    handler = mod.handler;
  });

  it('should release lock by lock holder', async () => {
    const event = makeEvent({ candidateId: 'cand_1' });
    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.released).toBe(true);
    expect(mockReleaseScreeningLock).toHaveBeenCalledWith('cand_1', 'recruiter_1');
  });

  it('should release lock by token', async () => {
    const event = makeEvent({ candidateId: 'cand_1', lockToken: 'token-xyz' });
    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.released).toBe(true);
    expect(mockReleaseScreeningLockByToken).toHaveBeenCalledWith('cand_1', 'token-xyz');
  });

  it('should return 200 on ConditionalCheckFailedException (idempotent)', async () => {
    const conditionalError = new Error('ConditionalCheckFailedException');
    conditionalError.name = 'ConditionalCheckFailedException';
    mockReleaseScreeningLock.mockRejectedValueOnce(conditionalError);

    const event = makeEvent({ candidateId: 'cand_1' });
    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.released).toBe(true);
  });

  it('should return 400 for missing candidateId', async () => {
    const event = makeEvent({});
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Heartbeat Screening Lock
// ---------------------------------------------------------------------------

describe('heartbeatScreeningLock handler', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../recruiter/heartbeatScreeningLock.js');
    handler = mod.handler;
  });

  it('should extend lock TTL', async () => {
    const event = makeEvent({ candidateId: 'cand_1' });
    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.extended).toBe(true);
    expect(body.data.expiresAt).toBeDefined();
    expect(mockHeartbeatScreeningLock).toHaveBeenCalledWith('cand_1', 'recruiter_1');
  });

  it('should return 410 when lock has expired', async () => {
    const conditionalError = new Error('ConditionalCheckFailedException');
    conditionalError.name = 'ConditionalCheckFailedException';
    mockHeartbeatScreeningLock.mockRejectedValueOnce(conditionalError);

    const event = makeEvent({ candidateId: 'cand_1' });
    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(410);
    expect(body.error.code).toBe('SCREENING_LOCK_EXPIRED');
  });

  it('should return 410 when lock is held by another user', async () => {
    const conditionalError = new Error('ConditionalCheckFailedException');
    conditionalError.name = 'ConditionalCheckFailedException';
    mockHeartbeatScreeningLock.mockRejectedValueOnce(conditionalError);

    const event = makeEvent2({ candidateId: 'cand_1' });
    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(410);
    expect(body.error.code).toBe('SCREENING_LOCK_EXPIRED');
  });

  it('should return 400 for missing candidateId', async () => {
    const event = makeEvent({});
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Release Screening Lock Beacon (public endpoint)
// ---------------------------------------------------------------------------

describe('releaseScreeningLockBeacon handler', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../recruiter/releaseScreeningLockBeacon.js');
    handler = mod.handler;
  });

  it('should release lock by token without auth', async () => {
    const event = {
      body: JSON.stringify({ candidateId: 'cand_1', lockToken: 'token-xyz' }),
      headers: {},
      requestContext: {} as any,
      routeKey: '',
      rawPath: '',
      rawQueryString: '',
      isBase64Encoded: false,
    } as APIGatewayProxyEventV2;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.released).toBe(true);
    expect(mockReleaseScreeningLockByToken).toHaveBeenCalledWith('cand_1', 'token-xyz');
  });

  it('should return 400 when lockToken is missing', async () => {
    const event = {
      body: JSON.stringify({ candidateId: 'cand_1' }),
      headers: {},
      requestContext: {} as any,
      routeKey: '',
      rawPath: '',
      rawQueryString: '',
      isBase64Encoded: false,
    } as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('should return 200 on ConditionalCheckFailedException (idempotent)', async () => {
    const conditionalError = new Error('ConditionalCheckFailedException');
    conditionalError.name = 'ConditionalCheckFailedException';
    mockReleaseScreeningLockByToken.mockRejectedValueOnce(conditionalError);

    const event = {
      body: JSON.stringify({ candidateId: 'cand_1', lockToken: 'token-xyz' }),
      headers: {},
      requestContext: {} as any,
      routeKey: '',
      rawPath: '',
      rawQueryString: '',
      isBase64Encoded: false,
    } as APIGatewayProxyEventV2;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.released).toBe(true);
  });
});
