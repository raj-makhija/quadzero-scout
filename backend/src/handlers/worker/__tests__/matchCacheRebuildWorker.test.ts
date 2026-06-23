import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRebuildMatchCachesForRequirements = vi.fn();
const mockAuditMatchCacheHealth = vi.fn();

vi.mock('../../../lib/matchCacheService.js', () => ({
  rebuildMatchCachesForRequirements: (...a: unknown[]) =>
    mockRebuildMatchCachesForRequirements(...a),
  auditMatchCacheHealth: (...a: unknown[]) => mockAuditMatchCacheHealth(...a),
  REBUILD_CHUNK_SIZE: 3, // smaller value simplifies chunk-boundary assertions
}));

const mockGetAllActiveRequirements = vi.fn();
const mockGetRequirementById = vi.fn();

vi.mock('../../../lib/dynamodb.js', () => ({
  getAllActiveRequirements: (...a: unknown[]) => mockGetAllActiveRequirements(...a),
  getRequirementById: (...a: unknown[]) => mockGetRequirementById(...a),
}));

const mockInvokeLambdaAsync = vi.fn();

vi.mock('../../../lib/lambdaInvoke.js', () => ({
  invokeLambdaAsync: (...a: unknown[]) => mockInvokeLambdaAsync(...a),
}));

vi.mock('../../../lib/config.js', () => ({
  config: { lambda: { matchCacheRebuildWorkerName: 'test-stage-matchCacheRebuildWorker' } },
}));

import { handler } from '../matchCacheRebuildWorker.js';
import type { RequirementItem } from '../../../types/index.js';

function req(id: string): RequirementItem {
  return {
    requirement_id: id,
    status: 'active',
    parsed_criteria: {},
  } as unknown as RequirementItem;
}

// ---------------------------------------------------------------------------
// Orchestrator path (no requirementIds in event)
// ---------------------------------------------------------------------------

describe('matchCacheRebuildWorker — orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditMatchCacheHealth.mockResolvedValue(undefined);
    mockGetAllActiveRequirements.mockResolvedValue([]);
    mockInvokeLambdaAsync.mockResolvedValue(undefined);
  });

  it('runs the cache-health audit before dispatching chunks', async () => {
    const order: string[] = [];
    mockAuditMatchCacheHealth.mockImplementation(async () => {
      order.push('audit');
    });
    mockGetAllActiveRequirements.mockImplementation(async () => {
      order.push('reqs');
      return [];
    });

    await handler();

    expect(order).toEqual(['audit', 'reqs']);
  });

  it('still dispatches when the audit throws (audit is best-effort)', async () => {
    mockAuditMatchCacheHealth.mockRejectedValue(new Error('audit boom'));
    mockGetAllActiveRequirements.mockResolvedValue([req('r1')]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler();

    expect(mockInvokeLambdaAsync).toHaveBeenCalledOnce();
    errSpy.mockRestore();
  });

  it('dispatches no chunks and exits when there are no active requirements', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([]);

    await handler();

    expect(mockInvokeLambdaAsync).not.toHaveBeenCalled();
  });

  it('dispatches ceil(N / REBUILD_CHUNK_SIZE) chunks for N requirements', async () => {
    // CHUNK_SIZE mocked as 3; 7 reqs → ceil(7/3) = 3 chunks
    mockGetAllActiveRequirements.mockResolvedValue([
      req('r1'),
      req('r2'),
      req('r3'),
      req('r4'),
      req('r5'),
      req('r6'),
      req('r7'),
    ]);

    await handler();

    expect(mockInvokeLambdaAsync).toHaveBeenCalledTimes(3);
  });

  it('passes the correct requirement IDs per chunk', async () => {
    // CHUNK_SIZE = 3; 4 reqs → chunk1=[r1,r2,r3], chunk2=[r4]
    mockGetAllActiveRequirements.mockResolvedValue([
      req('r1'),
      req('r2'),
      req('r3'),
      req('r4'),
    ]);

    await handler();

    expect(mockInvokeLambdaAsync).toHaveBeenCalledWith(expect.any(String), {
      requirementIds: ['r1', 'r2', 'r3'],
    });
    expect(mockInvokeLambdaAsync).toHaveBeenCalledWith(expect.any(String), {
      requirementIds: ['r4'],
    });
  });

  it('passes the configured worker name to each chunk invocation', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('r1')]);

    await handler();

    expect(mockInvokeLambdaAsync).toHaveBeenCalledWith(
      'test-stage-matchCacheRebuildWorker',
      expect.any(Object)
    );
  });
});

// ---------------------------------------------------------------------------
// Chunk worker path (requirementIds present in event)
// ---------------------------------------------------------------------------

describe('matchCacheRebuildWorker — chunk worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRebuildMatchCachesForRequirements.mockResolvedValue(undefined);
    mockGetRequirementById.mockResolvedValue(null);
  });

  it('re-fetches requirements by ID and rebuilds their caches', async () => {
    const r1 = req('r1');
    const r2 = req('r2');
    mockGetRequirementById.mockResolvedValueOnce(r1).mockResolvedValueOnce(r2);

    await handler({ requirementIds: ['r1', 'r2'] });

    expect(mockGetRequirementById).toHaveBeenCalledTimes(2);
    expect(mockRebuildMatchCachesForRequirements).toHaveBeenCalledWith([r1, r2]);
  });

  it('skips requirements that were deleted between dispatch and execution', async () => {
    const r1 = req('r1');
    mockGetRequirementById.mockResolvedValueOnce(r1).mockResolvedValueOnce(null);

    await handler({ requirementIds: ['r1', 'r2'] });

    expect(mockRebuildMatchCachesForRequirements).toHaveBeenCalledWith([r1]);
  });

  it('does not run the orchestrator path (no audit, no getAllActiveRequirements)', async () => {
    mockGetRequirementById.mockResolvedValue(req('r1'));

    await handler({ requirementIds: ['r1'] });

    expect(mockAuditMatchCacheHealth).not.toHaveBeenCalled();
    expect(mockGetAllActiveRequirements).not.toHaveBeenCalled();
    expect(mockInvokeLambdaAsync).not.toHaveBeenCalled();
  });
});
