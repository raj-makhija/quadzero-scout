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
import type { RequirementItem } from '../../../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function req(id: string): RequirementItem {
  return {
    requirement_id: id,
    status: 'active',
    parsed_criteria: {},
  } as unknown as RequirementItem;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchCacheRequirementWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequirementById.mockResolvedValue(req('req-1'));
    mockRebuildCacheForRequirement.mockResolvedValue(undefined);
    mockPutMatchCacheFailureMetric.mockResolvedValue(undefined);
  });

  it('re-fetches the requirement by ID before scoring', async () => {
    await handler({ requirementId: 'req-1' });

    expect(mockGetRequirementById).toHaveBeenCalledOnce();
    expect(mockGetRequirementById).toHaveBeenCalledWith('req-1');
  });

  it('passes the fetched requirement to rebuildCacheForRequirement', async () => {
    const requirement = req('req-1');
    mockGetRequirementById.mockResolvedValue(requirement);

    await handler({ requirementId: 'req-1' });

    expect(mockRebuildCacheForRequirement).toHaveBeenCalledOnce();
    expect(mockRebuildCacheForRequirement).toHaveBeenCalledWith(requirement);
  });

  it('exits gracefully (no rebuild) when the requirement is not found', async () => {
    mockGetRequirementById.mockResolvedValue(null);

    await expect(handler({ requirementId: 'missing-req' })).resolves.toBeUndefined();
    expect(mockRebuildCacheForRequirement).not.toHaveBeenCalled();
  });

  it('logs the requirement ID and emits the failure metric when rebuild throws', async () => {
    mockRebuildCacheForRequirement.mockRejectedValue(new Error('scan failed'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handler({ requirementId: 'req-1' })).resolves.toBeUndefined();

    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('req-1'))).toBe(true);
    expect(mockPutMatchCacheFailureMetric).toHaveBeenCalledOnce();
    expect(mockPutMatchCacheFailureMetric).toHaveBeenCalledWith('req-1');
    errSpy.mockRestore();
  });

  it('does not propagate the error when rebuild throws (non-fatal to worker)', async () => {
    mockRebuildCacheForRequirement.mockRejectedValue(new Error('scan failed'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handler({ requirementId: 'req-1' })).resolves.toBeUndefined();
    errSpy.mockRestore();
  });

  it('does not emit the failure metric on a successful rebuild', async () => {
    await handler({ requirementId: 'req-1' });

    expect(mockPutMatchCacheFailureMetric).not.toHaveBeenCalled();
  });
});
