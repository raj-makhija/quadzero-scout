import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetRequirementById = vi.fn();
const mockRebuildCacheForRequirement = vi.fn();
const mockPutMatchCacheFailureMetric = vi.fn();

vi.mock('../../../lib/dynamodb.js', () => ({
  getRequirementById: (...args: unknown[]) => mockGetRequirementById(...args),
}));

vi.mock('../../../lib/matchCacheService.js', () => ({
  rebuildCacheForRequirement: (...args: unknown[]) => mockRebuildCacheForRequirement(...args),
}));

vi.mock('../../../lib/cloudwatchMetrics.js', () => ({
  putMatchCacheFailureMetric: (...args: unknown[]) => mockPutMatchCacheFailureMetric(...args),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { handler } from '../matchCacheRequirementWorker.js';

const activeRequirement = {
  requirement_id: 'req-1',
  status: 'active',
};

describe('matchCacheRequirementWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequirementById.mockResolvedValue({ ...activeRequirement });
    mockRebuildCacheForRequirement.mockResolvedValue(undefined);
    mockPutMatchCacheFailureMetric.mockResolvedValue(undefined);
  });

  it('re-fetches the requirement and rebuilds its cache', async () => {
    await handler({ requirementId: 'req-1' });
    expect(mockGetRequirementById).toHaveBeenCalledWith('req-1');
    expect(mockRebuildCacheForRequirement).toHaveBeenCalledOnce();
    expect(mockRebuildCacheForRequirement.mock.calls[0][0]).toMatchObject({ requirement_id: 'req-1' });
    expect(mockPutMatchCacheFailureMetric).not.toHaveBeenCalled();
  });

  it('is a no-op when the requirement is not found', async () => {
    mockGetRequirementById.mockResolvedValue(null);
    await handler({ requirementId: 'missing' });
    expect(mockRebuildCacheForRequirement).not.toHaveBeenCalled();
    expect(mockPutMatchCacheFailureMetric).not.toHaveBeenCalled();
  });

  it('skips a requirement that is no longer active', async () => {
    mockGetRequirementById.mockResolvedValue({ ...activeRequirement, status: 'closed_won' });
    await handler({ requirementId: 'req-1' });
    expect(mockRebuildCacheForRequirement).not.toHaveBeenCalled();
    expect(mockPutMatchCacheFailureMetric).not.toHaveBeenCalled();
  });

  // ticket #447 observability now lives in the worker — a failed rebuild is
  // logged with the requirement ID and emits the CloudWatch failure metric.
  it('logs the requirement ID and emits the failure metric when the rebuild throws', async () => {
    mockRebuildCacheForRequirement.mockRejectedValue(new Error('scan failed'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handler({ requirementId: 'req-1' })).resolves.toBeUndefined();

    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('req-1'))).toBe(true);
    expect(mockPutMatchCacheFailureMetric).toHaveBeenCalledOnce();
    expect(mockPutMatchCacheFailureMetric).toHaveBeenCalledWith('req-1');
    errSpy.mockRestore();
  });
});
