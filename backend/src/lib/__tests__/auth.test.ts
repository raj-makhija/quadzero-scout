import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { EncryptJWT } from 'jose';
import { withAuth, type AuthenticatedEvent } from '../auth.js';

// ---------------------------------------------------------------------------
// Mock dynamodb for user lookup fallback
// ---------------------------------------------------------------------------

vi.mock('../dynamodb.js', () => ({
  getUserById: vi.fn(),
}));

import { getUserById } from '../dynamodb.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-secret-key-for-unit-tests';

// Derive the encryption key the same way NextAuth does (HKDF)
async function getDerivedEncryptionKey(secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode('NextAuth.js Generated Encryption Key'),
    },
    keyMaterial,
    256
  );

  return new Uint8Array(derivedBits);
}

async function createTestToken(
  payload: Record<string, unknown>,
  secret: string = TEST_SECRET
): Promise<string> {
  const encryptionKey = await getDerivedEncryptionKey(secret);
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .encrypt(encryptionKey);
}

function makeEvent(
  overrides: Partial<APIGatewayProxyEventV2> = {}
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: {
        method: 'POST',
        path: '/',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

function parseBody(result: APIGatewayProxyResultV2) {
  const body = typeof result === 'object' && 'body' in result ? result.body : undefined;
  return JSON.parse(body || '{}');
}

// A dummy handler that returns auth context
const dummyHandler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => ({
  statusCode: 200,
  body: JSON.stringify({
    userId: event.auth.userId,
    email: event.auth.email,
    role: event.auth.role,
  }),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Disable SKIP_AUTH for these tests so the real middleware logic runs
const originalSkipAuth = process.env.SKIP_AUTH;
const originalIsOffline = process.env.IS_OFFLINE;

describe('withAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = TEST_SECRET;
    process.env.SKIP_AUTH = undefined;
    process.env.IS_OFFLINE = undefined;
  });

  afterEach(() => {
    process.env.SKIP_AUTH = originalSkipAuth;
    process.env.IS_OFFLINE = originalIsOffline;
  });

  // ------ 401 Unauthorized cases ------

  it('returns 401 when no Authorization header is present', async () => {
    const handler = withAuth(['candidate'], dummyHandler);
    const event = makeEvent();
    const result = await handler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toContain('Authorization');
  });

  it('returns 401 for malformed Authorization header (no Bearer prefix)', async () => {
    const handler = withAuth(['candidate'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: 'Token some-value' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for invalid/corrupted token', async () => {
    const handler = withAuth(['candidate'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: 'Bearer invalid.token.here' },
    });
    const result = await handler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toContain('Invalid or expired');
  });

  it('returns 401 when token is encrypted with wrong secret', async () => {
    const token = await createTestToken(
      { id: 'user_1', email: 'test@example.com', role: 'candidate' },
      'wrong-secret-key-that-does-not-match'
    );
    const handler = withAuth(['candidate'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
  });

  // ------ 403 Forbidden cases ------

  it('returns 403 when candidate tries to access recruiter endpoint', async () => {
    const token = await createTestToken({
      id: 'user_1',
      email: 'candidate@example.com',
      role: 'candidate',
    });
    const handler = withAuth(['recruiter'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await handler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('recruiter');
  });

  it('returns 403 when recruiter tries to access candidate endpoint', async () => {
    const token = await createTestToken({
      id: 'user_2',
      email: 'recruiter@example.com',
      role: 'recruiter',
    });
    const handler = withAuth(['candidate'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(403);
  });

  // ------ 200 Success cases ------

  it('allows candidate to access candidate endpoint', async () => {
    const token = await createTestToken({
      id: 'user_1',
      email: 'candidate@example.com',
      role: 'candidate',
    });
    const handler = withAuth(['candidate'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await handler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.userId).toBe('user_1');
    expect(body.email).toBe('candidate@example.com');
    expect(body.role).toBe('candidate');
  });

  it('allows recruiter to access recruiter endpoint', async () => {
    const token = await createTestToken({
      id: 'user_2',
      email: 'recruiter@example.com',
      role: 'recruiter',
    });
    const handler = withAuth(['recruiter'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await handler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.userId).toBe('user_2');
    expect(body.role).toBe('recruiter');
  });

  // ------ Admin bypass ------

  it('allows admin to access candidate endpoint', async () => {
    const token = await createTestToken({
      id: 'admin_1',
      email: 'admin@example.com',
      role: 'admin',
    });
    const handler = withAuth(['candidate'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await handler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.role).toBe('admin');
  });

  it('allows admin to access recruiter endpoint', async () => {
    const token = await createTestToken({
      id: 'admin_1',
      email: 'admin@example.com',
      role: 'admin',
    });
    const handler = withAuth(['recruiter'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
  });

  // ------ DB fallback when role not in token ------

  it('falls back to DB lookup when token has no role', async () => {
    const token = await createTestToken({
      id: 'user_3',
      email: 'norole@example.com',
    });
    vi.mocked(getUserById).mockResolvedValueOnce({
      id: 'user_3',
      email: 'norole@example.com',
      role: 'candidate',
      provider: 'credentials',
      createdAt: '2024-01-01T00:00:00Z',
    });

    const handler = withAuth(['candidate'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await handler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.role).toBe('candidate');
    expect(getUserById).toHaveBeenCalledWith('user_3');
  });

  it('returns 401 when token has no role and user not found in DB', async () => {
    const token = await createTestToken({
      id: 'user_missing',
      email: 'gone@example.com',
    });
    vi.mocked(getUserById).mockResolvedValueOnce(null);

    const handler = withAuth(['candidate'], dummyHandler);
    const event = makeEvent({
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
  });

  // ------ Dev bypass ------

  it('skips auth when IS_OFFLINE and SKIP_AUTH are set', async () => {
    process.env.IS_OFFLINE = 'true';
    process.env.SKIP_AUTH = 'true';

    const handler = withAuth(['recruiter'], dummyHandler);
    const event = makeEvent(); // No auth header
    const result = await handler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.userId).toBe('dev-user-1');
    expect(body.role).toBe('candidate'); // default when no x-dev-role header
  });

  it('uses x-dev-role header in dev bypass mode', async () => {
    process.env.IS_OFFLINE = 'true';
    process.env.SKIP_AUTH = 'true';

    const handler = withAuth(['recruiter'], dummyHandler);
    const event = makeEvent({
      headers: { 'x-dev-role': 'recruiter' },
    });
    const result = await handler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.role).toBe('recruiter');
  });
});
