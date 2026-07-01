import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mock auth ---
vi.mock('../../../lib/auth.js', () => ({
  withAuth: vi.fn((_roles: string[], handler: Function) => {
    return (event: Record<string, unknown>) => {
      event.auth = { userId: 'admin-user', email: 'admin@quadzero.com', role: 'admin' };
      return handler(event);
    };
  }),
}));

// --- mock adapter registry ---
vi.mock('../../../lib/portalScan/adapters/index.js', () => ({
  VALID_TYPES: ['stub', 'greenhouse', 'lever', 'hirebound'],
}));

// --- mock dynamodb ---
const mockListAllJobSources = vi.fn();
const mockGetJobSource = vi.fn();
const mockCreateJobSource = vi.fn();
const mockReplaceJobSource = vi.fn();
const mockDeleteJobSource = vi.fn();

vi.mock('../../../lib/dynamodb.js', () => ({
  listAllJobSources: (...a: unknown[]) => mockListAllJobSources(...a),
  getJobSource: (...a: unknown[]) => mockGetJobSource(...a),
  createJobSource: (...a: unknown[]) => mockCreateJobSource(...a),
  replaceJobSource: (...a: unknown[]) => mockReplaceJobSource(...a),
  deleteJobSource: (...a: unknown[]) => mockDeleteJobSource(...a),
}));

import { handler as listHandler } from '../listJobSources.js';
import { handler as createHandler } from '../createJobSource.js';
import { handler as updateHandler } from '../updateJobSource.js';
import { handler as deleteHandler } from '../deleteJobSource.js';

const stubSource = {
  source_id: 'src-1',
  type: 'greenhouse',
  identifier: 'acme-corp',
  url: 'https://boards.greenhouse.io/acme-corp',
  cadence: 'daily',
  enabled: true,
};

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    pathParameters: null,
    body: null,
    ...overrides,
  };
}

// ─── LIST ───────────────────────────────────────────────────────────────────

describe('GET /admin/job-sources', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all sources', async () => {
    mockListAllJobSources.mockResolvedValue([stubSource]);

    const res = await listHandler(makeEvent() as never);
    const body = JSON.parse((res as { body: string }).body);

    expect(body.success).toBe(true);
    expect(body.data.sources).toHaveLength(1);
    expect(body.data.sources[0].source_id).toBe('src-1');
  });

  it('returns empty array when no sources exist', async () => {
    mockListAllJobSources.mockResolvedValue([]);

    const res = await listHandler(makeEvent() as never);
    const body = JSON.parse((res as { body: string }).body);

    expect(body.data.sources).toHaveLength(0);
  });

  it('returns 500 on DynamoDB error', async () => {
    mockListAllJobSources.mockRejectedValue(new Error('DynamoDB failure'));

    const res = await listHandler(makeEvent() as never);
    expect((res as { statusCode: number }).statusCode).toBe(500);
  });
});

// ─── CREATE ─────────────────────────────────────────────────────────────────

describe('POST /admin/job-sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateJobSource.mockResolvedValue(undefined);
  });

  it('creates a source and returns it with a generated source_id', async () => {
    const body = { type: 'greenhouse', identifier: 'acme', url: 'https://boards.greenhouse.io/acme', cadence: 'daily', enabled: true };

    const res = await createHandler(makeEvent({ body: JSON.stringify(body) }) as never);
    const parsed = JSON.parse((res as { body: string }).body);

    expect(parsed.success).toBe(true);
    expect(parsed.data.source.source_id).toBeDefined();
    expect(parsed.data.source.type).toBe('greenhouse');
    expect(mockCreateJobSource).toHaveBeenCalledOnce();
  });

  it('accepts hirebound as a valid type (#537)', async () => {
    const body = { type: 'hirebound', identifier: 'acme-org', url: 'https://cpages.hirebound.io/in/overview/org/acme', cadence: 'daily', enabled: true };

    const res = await createHandler(makeEvent({ body: JSON.stringify(body) }) as never);
    const parsed = JSON.parse((res as { body: string }).body);

    expect(parsed.success).toBe(true);
    expect(parsed.data.source.type).toBe('hirebound');
    expect(mockCreateJobSource).toHaveBeenCalledOnce();
  });

  it('rejects an unknown type with 400', async () => {
    const body = { type: 'unknown-portal', identifier: 'x', url: 'https://example.com', cadence: 'daily', enabled: true };

    const res = await createHandler(makeEvent({ body: JSON.stringify(body) }) as never);
    expect((res as { statusCode: number }).statusCode).toBe(400);
    expect(mockCreateJobSource).not.toHaveBeenCalled();
  });

  it('type check is case-sensitive (Greenhouse is rejected)', async () => {
    const body = { type: 'Greenhouse', identifier: 'x', url: 'https://example.com', cadence: 'daily', enabled: true };

    const res = await createHandler(makeEvent({ body: JSON.stringify(body) }) as never);
    expect((res as { statusCode: number }).statusCode).toBe(400);
  });

  it('rejects missing required field with 400', async () => {
    const body = { type: 'greenhouse', identifier: 'acme', cadence: 'daily', enabled: true }; // url missing

    const res = await createHandler(makeEvent({ body: JSON.stringify(body) }) as never);
    expect((res as { statusCode: number }).statusCode).toBe(400);
  });

  it('rejects missing body with 400', async () => {
    const res = await createHandler(makeEvent() as never);
    expect((res as { statusCode: number }).statusCode).toBe(400);
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await createHandler(makeEvent({ body: 'not-json' }) as never);
    expect((res as { statusCode: number }).statusCode).toBe(400);
  });
});

// ─── UPDATE ─────────────────────────────────────────────────────────────────

describe('PUT /admin/job-sources/{source_id}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJobSource.mockResolvedValue(stubSource);
    mockReplaceJobSource.mockResolvedValue(undefined);
  });

  it('updates and returns the merged source', async () => {
    const body = { enabled: false };

    const res = await updateHandler(
      makeEvent({ pathParameters: { source_id: 'src-1' }, body: JSON.stringify(body) }) as never
    );
    const parsed = JSON.parse((res as { body: string }).body);

    expect(parsed.success).toBe(true);
    expect(parsed.data.source.enabled).toBe(false);
    expect(parsed.data.source.source_id).toBe('src-1');
    expect(mockReplaceJobSource).toHaveBeenCalledOnce();
  });

  it('returns 404 when source does not exist', async () => {
    mockGetJobSource.mockResolvedValue(null);

    const res = await updateHandler(
      makeEvent({ pathParameters: { source_id: 'missing' }, body: JSON.stringify({ enabled: false }) }) as never
    );
    expect((res as { statusCode: number }).statusCode).toBe(404);
    expect(mockReplaceJobSource).not.toHaveBeenCalled();
  });

  it('rejects an unknown type with 400 before any write', async () => {
    const body = { type: 'badtype' };

    const res = await updateHandler(
      makeEvent({ pathParameters: { source_id: 'src-1' }, body: JSON.stringify(body) }) as never
    );
    expect((res as { statusCode: number }).statusCode).toBe(400);
    expect(mockReplaceJobSource).not.toHaveBeenCalled();
  });

  it('returns 400 when source_id path parameter is missing', async () => {
    const res = await updateHandler(
      makeEvent({ body: JSON.stringify({ enabled: false }) }) as never
    );
    expect((res as { statusCode: number }).statusCode).toBe(400);
  });
});

// ─── DELETE ─────────────────────────────────────────────────────────────────

describe('DELETE /admin/job-sources/{source_id}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteJobSource.mockResolvedValue(undefined);
  });

  it('deletes the source and returns success', async () => {
    const res = await deleteHandler(
      makeEvent({ pathParameters: { source_id: 'src-1' } }) as never
    );
    const parsed = JSON.parse((res as { body: string }).body);

    expect(parsed.success).toBe(true);
    expect(mockDeleteJobSource).toHaveBeenCalledWith('src-1');
  });

  it('returns 404 when source does not exist (ConditionalCheckFailedException)', async () => {
    const err = Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
    mockDeleteJobSource.mockRejectedValue(err);

    const res = await deleteHandler(
      makeEvent({ pathParameters: { source_id: 'missing' } }) as never
    );
    expect((res as { statusCode: number }).statusCode).toBe(404);
  });

  it('returns 400 when source_id path parameter is missing', async () => {
    const res = await deleteHandler(makeEvent() as never);
    expect((res as { statusCode: number }).statusCode).toBe(400);
  });

  it('returns 500 on unexpected DynamoDB error', async () => {
    mockDeleteJobSource.mockRejectedValue(new Error('DynamoDB boom'));

    const res = await deleteHandler(
      makeEvent({ pathParameters: { source_id: 'src-1' } }) as never
    );
    expect((res as { statusCode: number }).statusCode).toBe(500);
  });
});
