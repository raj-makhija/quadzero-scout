import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// AWS SDK + lib mocks — declared before handler import
// ---------------------------------------------------------------------------

const mockDocSend = vi.fn(async (command: { _cmd: string }) => {
  if (command._cmd === 'scan') {
    return { Items: [{ id: '1' }], LastEvaluatedKey: undefined };
  }
  if (command._cmd === 'batchwrite') {
    return { UnprocessedItems: {} };
  }
  return {};
});

const mockS3Send = vi.fn(async (command: { _cmd: string }) => {
  if (command._cmd === 'list') {
    return { Contents: [{ Key: 'resume.pdf' }], NextContinuationToken: undefined };
  }
  return {};
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {},
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: () => ({ send: (...a: unknown[]) => mockDocSend(...(a as [{ _cmd: string }])) }) },
  ScanCommand: class {
    input: unknown;
    _cmd = 'scan';
    constructor(i: unknown) { this.input = i; }
  },
  BatchWriteCommand: class {
    input: unknown;
    _cmd = 'batchwrite';
    constructor(i: unknown) { this.input = i; }
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send(...a: unknown[]) { return mockS3Send(...(a as [{ _cmd: string }])); }
  },
  ListObjectsV2Command: class {
    input: unknown;
    _cmd = 'list';
    constructor(i: unknown) { this.input = i; }
  },
  CopyObjectCommand: class {
    input: unknown;
    _cmd = 'copy';
    constructor(i: unknown) { this.input = i; }
  },
  DeleteObjectsCommand: class {
    input: unknown;
    _cmd = 'delete';
    constructor(i: unknown) { this.input = i; }
  },
}));

const mockGetCloneJob = vi.fn();
const mockUpdateCloneJob = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../lib/dynamodb.js', () => ({
  getCloneJob: (...a: unknown[]) => mockGetCloneJob(...a),
  updateCloneJob: (...a: unknown[]) => mockUpdateCloneJob(...a),
}));

vi.mock('../../../lib/config.js', () => ({
  config: { region: 'ap-south-1', stage: 'dev' },
}));

import { handler } from '../cloneDataWorker.js';
import { CLONE_TABLE_REGISTRY } from '../../../lib/cloneData.js';

const EXPECTED_TABLES = [
  'TalentProfiles',
  'Requirements',
  'Shortlists',
  'SavedSearches',
  'BulkImportBatches',
  'Clients',
  'CandidateScreenings',
  'Prompts',
  'PricingConfig',
];

function tableNamesTouched(): string[] {
  const names = new Set<string>();
  for (const call of mockDocSend.mock.calls) {
    const cmd = call[0] as { _cmd: string; input?: { TableName?: string; RequestItems?: Record<string, unknown> } };
    if (cmd.input?.TableName) names.add(cmd.input.TableName);
    if (cmd.input?.RequestItems) {
      Object.keys(cmd.input.RequestItems).forEach((n) => names.add(n));
    }
  }
  return [...names];
}

describe('cloneDataWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCloneJob.mockResolvedValue({
      job_id: 'clone_1',
      status: 'processing',
      source: 'prod',
      target: 'dev',
      created_by: 'admin-1',
      created_at: 'now',
      updated_at: 'now',
      tables: [],
      s3: { copied: 0, failed: 0 },
    });
  });

  it('registry contains exactly the 9 expected tables and excludes Users', () => {
    const baseNames = CLONE_TABLE_REGISTRY.map((t) => t.baseName);
    expect(baseNames.sort()).toEqual([...EXPECTED_TABLES].sort());
    expect(baseNames).not.toContain('Users');
  });

  it('never scans or writes any Users-* table during a full run', async () => {
    await handler({ jobId: 'clone_1', target: 'dev' });
    const touched = tableNamesTouched();
    expect(touched.length).toBeGreaterThan(0);
    expect(touched.some((n) => n.startsWith('Users-'))).toBe(false);
  });

  it('reads from prod and writes to the target stage', async () => {
    await handler({ jobId: 'clone_1', target: 'dev' });
    const touched = tableNamesTouched();
    // Source scans hit *-prod, target clear/write hit *-dev
    expect(touched).toContain('TalentProfiles-prod');
    expect(touched).toContain('TalentProfiles-dev');
  });

  it('initiates an S3 list + copy from the prod resumes bucket', async () => {
    await handler({ jobId: 'clone_1', target: 'dev' });
    const s3Cmds = mockS3Send.mock.calls.map((c) => (c[0] as { _cmd: string })._cmd);
    expect(s3Cmds).toContain('list');
    expect(s3Cmds).toContain('copy');
  });

  it('persists per-table progress to the job record', async () => {
    await handler({ jobId: 'clone_1', target: 'dev' });
    const tableUpdates = mockUpdateCloneJob.mock.calls.filter(
      (c) => (c[1] as { tables?: unknown[] }).tables !== undefined
    );
    expect(tableUpdates.length).toBeGreaterThan(0);
    const lastTables = (tableUpdates.at(-1)![1] as { tables: { table: string; scanned: number }[] }).tables;
    expect(lastTables.some((t) => t.table === 'TalentProfiles' && t.scanned >= 1)).toBe(true);
  });

  it('marks the job completed when the run finishes without failures', async () => {
    await handler({ jobId: 'clone_1', target: 'dev' });
    const statusUpdates = mockUpdateCloneJob.mock.calls
      .map((c) => (c[1] as { status?: string }).status)
      .filter(Boolean);
    expect(statusUpdates.at(-1)).toBe('completed');
  });

  it('marks the job in error when the clone throws', async () => {
    mockDocSend.mockRejectedValueOnce(new Error('dynamo boom'));
    await handler({ jobId: 'clone_1', target: 'dev' });
    const errorUpdate = mockUpdateCloneJob.mock.calls.find(
      (c) => (c[1] as { status?: string }).status === 'error'
    );
    expect(errorUpdate).toBeTruthy();
  });

  it('returns early without updates if the job record is missing', async () => {
    mockGetCloneJob.mockResolvedValueOnce(null);
    await handler({ jobId: 'missing', target: 'dev' });
    expect(mockUpdateCloneJob).not.toHaveBeenCalled();
  });
});
