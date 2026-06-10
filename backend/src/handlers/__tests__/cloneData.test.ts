import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks — declared before handler imports
// ---------------------------------------------------------------------------

const captured = vi.hoisted(() => ({ roles: [] as string[][] }));

const mockCreateCloneJob = vi.fn().mockResolvedValue(undefined);
const mockGetCloneJob = vi.fn();
const mockInvokeLambdaAsync = vi.fn().mockResolvedValue(undefined);
const mockLogAuditEvent = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  createCloneJob: (...a: unknown[]) => mockCreateCloneJob(...a),
  getCloneJob: (...a: unknown[]) => mockGetCloneJob(...a),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (roles: string[], handler: unknown) => {
    captured.roles.push(roles);
    return handler;
  },
}));

vi.mock('../../lib/audit.js', () => ({
  logAuditEvent: (...a: unknown[]) => mockLogAuditEvent(...a),
}));

vi.mock('../../lib/lambdaInvoke.js', () => ({
  invokeLambdaAsync: (...a: unknown[]) => mockInvokeLambdaAsync(...a),
}));

vi.mock('../../lib/cloneData.js', () => ({
  CLONE_SOURCE_STAGE: 'prod',
  normalizeCloneOptions: (input: unknown) => {
    const o = (input ?? {}) as Record<string, unknown>;
    return {
      includeS3: o.includeS3 !== false,
      includeConfigTables: o.includeConfigTables !== false,
      clearTarget: o.clearTarget !== false,
      dryRun: o.dryRun === true,
    };
  },
}));

vi.mock('../../lib/config.js', () => ({
  config: {
    stage: 'dev',
    region: 'ap-south-1',
    lambda: { cloneDataWorkerName: 'quadzero-scout-dev-cloneDataWorker' },
    dynamodb: { cloneJobsTable: 'CloneJobs-test' },
  },
}));

import { handler as startHandler } from '../admin/cloneDataStart.js';
import { handler as statusHandler } from '../admin/cloneDataStatus.js';
import { config } from '../../lib/config.js';

type AuthedEvent = APIGatewayProxyEventV2 & {
  auth: { userId: string; email: string; role: string };
};

function makeEvent(body?: unknown, pathParameters?: Record<string, string>): AuthedEvent {
  return {
    auth: { userId: 'admin-1', email: 'admin@quadzero.com', role: 'admin' },
    body: body === undefined ? null : JSON.stringify(body),
    pathParameters,
    requestContext: { http: { sourceIp: '1.2.3.4' } },
    headers: {},
  } as unknown as AuthedEvent;
}

function parseBody(res: unknown): { statusCode: number; data: Record<string, unknown> } {
  const r = res as { statusCode: number; body: string };
  return { statusCode: r.statusCode, data: JSON.parse(r.body) };
}

describe('cloneDataStart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.stage = 'dev';
    config.lambda.cloneDataWorkerName = 'quadzero-scout-dev-cloneDataWorker';
  });

  it('is wired with admin-only authorization', () => {
    // withAuth(['admin'], …) is what blocks non-admin (recruiter) callers.
    expect(captured.roles).toContainEqual(['admin']);
  });

  it('rejects with 403 on prod without creating a job or invoking a worker', async () => {
    config.stage = 'prod';
    const res = parseBody(await (startHandler as Function)(makeEvent()));
    expect(res.statusCode).toBe(403);
    expect(mockCreateCloneJob).not.toHaveBeenCalled();
    expect(mockInvokeLambdaAsync).not.toHaveBeenCalled();
  });

  it('forces target to config.stage and ignores a client-supplied target', async () => {
    const res = parseBody(await (startHandler as Function)(makeEvent({ target: 'prod' })));
    expect(res.statusCode).toBe(200);
    expect(mockInvokeLambdaAsync).toHaveBeenCalledTimes(1);
    const payload = mockInvokeLambdaAsync.mock.calls[0][1] as { target: string };
    expect(payload.target).toBe('dev');
    // The created job also records the server-derived target, not the body value.
    const job = mockCreateCloneJob.mock.calls[0][0] as { target: string; source: string };
    expect(job.target).toBe('dev');
    expect(job.source).toBe('prod');
  });

  it('returns a jobId on the happy path', async () => {
    const res = parseBody(await (startHandler as Function)(makeEvent()));
    expect(res.statusCode).toBe(200);
    expect((res.data.data as { jobId: string }).jobId).toMatch(/^clone_/);
  });

  it('writes a CLONE_DATA_START audit event with target metadata', async () => {
    await (startHandler as Function)(makeEvent());
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    const auditArg = mockLogAuditEvent.mock.calls[0][2] as {
      action: string;
      metadata: { target: string };
    };
    expect(auditArg.action).toBe('CLONE_DATA_START');
    expect(auditArg.metadata.target).toBe('dev');
  });

  it('passes normalized clone options to the worker, job record, and audit log', async () => {
    await (startHandler as Function)(
      makeEvent({ options: { includeS3: false, dryRun: true } })
    );

    const payload = mockInvokeLambdaAsync.mock.calls[0][1] as { options: Record<string, boolean> };
    expect(payload.options).toEqual({
      includeS3: false,
      includeConfigTables: true,
      clearTarget: true,
      dryRun: true,
    });

    const job = mockCreateCloneJob.mock.calls[0][0] as { options: Record<string, boolean> };
    expect(job.options.includeS3).toBe(false);
    expect(job.options.dryRun).toBe(true);

    const auditArg = mockLogAuditEvent.mock.calls[0][2] as { metadata: { options: Record<string, boolean> } };
    expect(auditArg.metadata.options.includeS3).toBe(false);
  });

  it('defaults to a full clone when no options are supplied', async () => {
    await (startHandler as Function)(makeEvent());
    const payload = mockInvokeLambdaAsync.mock.calls[0][1] as { options: Record<string, boolean> };
    expect(payload.options).toEqual({
      includeS3: true,
      includeConfigTables: true,
      clearTarget: true,
      dryRun: false,
    });
  });

  it('fails with 500 and creates no job when the worker name is unconfigured', async () => {
    config.lambda.cloneDataWorkerName = '';
    const res = parseBody(await (startHandler as Function)(makeEvent()));
    expect(res.statusCode).toBe(500);
    expect(mockCreateCloneJob).not.toHaveBeenCalled();
    expect(mockInvokeLambdaAsync).not.toHaveBeenCalled();
  });
});

describe('cloneDataStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.stage = 'dev';
  });

  it('returns the job record with a status field on the happy path', async () => {
    mockGetCloneJob.mockResolvedValue({
      job_id: 'clone_1',
      status: 'processing',
      source: 'prod',
      target: 'dev',
      created_at: 'now',
      updated_at: 'now',
      tables: [],
      s3: { copied: 0, failed: 0 },
    });
    const res = parseBody(await (statusHandler as Function)(makeEvent(undefined, { jobId: 'clone_1' })));
    expect(res.statusCode).toBe(200);
    expect((res.data.data as { status: string }).status).toBe('processing');
  });

  it('returns 404 (not 500) for an unknown jobId', async () => {
    mockGetCloneJob.mockResolvedValue(null);
    const res = parseBody(await (statusHandler as Function)(makeEvent(undefined, { jobId: 'nope' })));
    expect(res.statusCode).toBe(404);
  });

  it('rejects with 403 on prod', async () => {
    config.stage = 'prod';
    const res = parseBody(await (statusHandler as Function)(makeEvent(undefined, { jobId: 'clone_1' })));
    expect(res.statusCode).toBe(403);
  });
});
