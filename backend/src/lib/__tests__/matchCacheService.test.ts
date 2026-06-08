import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CandidateItem, RequirementItem } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Mocks — drive scores deterministically via matchAndRankCandidates, and use
// in-memory stand-ins for the store reads/writes.
// ---------------------------------------------------------------------------

const mockGetAllActiveRequirements = vi.fn();
const mockGetAllActiveCandidates = vi.fn();
const mockGetMatchCache = vi.fn();
const mockPutMatchCache = vi.fn();
const mockDeleteMatchCache = vi.fn();

vi.mock('../dynamodb.js', () => ({
  getLlmRerank: vi.fn().mockResolvedValue(null),
  putLlmRerank: vi.fn().mockResolvedValue(undefined),
  deleteLlmRerank: vi.fn().mockResolvedValue(undefined),
  getAllActiveRequirements: (...a: unknown[]) => mockGetAllActiveRequirements(...a),
  getAllActiveCandidates: (...a: unknown[]) => mockGetAllActiveCandidates(...a),
  getMatchCache: (...a: unknown[]) => mockGetMatchCache(...a),
  putMatchCache: (...a: unknown[]) => mockPutMatchCache(...a),
  deleteMatchCache: (...a: unknown[]) => mockDeleteMatchCache(...a),
}));

const mockMatchAndRank = vi.fn();
vi.mock('../candidateMatching.js', () => ({
  matchAndRankCandidates: (...a: unknown[]) => mockMatchAndRank(...a),
}));

import {
  updateCacheForCandidates,
  rebuildCacheForRequirement,
  rebuildAllMatchCaches,
  deleteMatchCache,
} from '../matchCacheService.js';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

function cand(id: string): CandidateItem {
  return { candidate_id: id } as CandidateItem;
}

function req(id: string): RequirementItem {
  return {
    requirement_id: id,
    status: 'active',
    parsed_criteria: {},
    budget_max_lpa: undefined,
  } as unknown as RequirementItem;
}

/** Shape matchAndRankCandidates output: [{ candidate, score }]. */
function scored(pairs: [string, number][]) {
  return pairs.map(([id, score]) => ({ candidate: cand(id), score, details: {}, budgetFit: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPutMatchCache.mockResolvedValue(undefined);
  mockDeleteMatchCache.mockResolvedValue(undefined);
  mockGetMatchCache.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// updateCacheForCandidates (candidate ingest / edit — upsert path)
// ---------------------------------------------------------------------------

describe('updateCacheForCandidates', () => {
  it('upserts the changed candidate into the existing ranked list and re-ranks', async () => {
    mockGetMatchCache.mockResolvedValue([
      { candidate_id: 'cand_2', rank: 1, score: 0.9 },
      { candidate_id: 'cand_3', rank: 2, score: 0.5 },
    ]);
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.7]]));

    await updateCacheForCandidates([cand('cand_1')], [req('req_1')]);

    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'cand_2', rank: 1, score: 0.9 },
      { candidate_id: 'cand_1', rank: 2, score: 0.7 },
      { candidate_id: 'cand_3', rank: 3, score: 0.5 },
    ]);
  });

  it('updates the score of a candidate already present (no duplicate entry)', async () => {
    mockGetMatchCache.mockResolvedValue([{ candidate_id: 'cand_1', rank: 1, score: 0.8 }]);
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.3]]));

    await updateCacheForCandidates([cand('cand_1')], [req('req_1')]);

    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'cand_1', rank: 1, score: 0.3 },
    ]);
  });

  it('drops a candidate that no longer qualifies after the edit (stale score removed)', async () => {
    mockGetMatchCache.mockResolvedValue([{ candidate_id: 'cand_1', rank: 1, score: 0.8 }]);
    mockMatchAndRank.mockReturnValue([]); // candidate no longer matches

    await updateCacheForCandidates([cand('cand_1')], [req('req_1')]);

    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', []);
  });

  it('upserts a low-scoring (score 0) candidate rather than omitting it', async () => {
    mockGetMatchCache.mockResolvedValue([]);
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0]]));

    await updateCacheForCandidates([cand('cand_1')], [req('req_1')]);

    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'cand_1', rank: 1, score: 0 },
    ]);
  });

  it('updates every active requirement, not just the first', async () => {
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.6]]));

    await updateCacheForCandidates([cand('cand_1')], [req('req_1'), req('req_2')]);

    expect(mockPutMatchCache).toHaveBeenCalledTimes(2);
    expect(mockPutMatchCache.mock.calls.map((c) => c[0])).toEqual(['req_1', 'req_2']);
  });

  it('writes nothing when there are no active requirements', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([]);

    await updateCacheForCandidates([cand('cand_1')]);

    expect(mockPutMatchCache).not.toHaveBeenCalled();
  });

  it('fetches active requirements itself when not provided (edit path)', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1')]);
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.6]]));

    await updateCacheForCandidates([cand('cand_1')]);

    expect(mockGetAllActiveRequirements).toHaveBeenCalledOnce();
    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'cand_1', rank: 1, score: 0.6 },
    ]);
  });

  it('reuses the passed-in requirements list without an extra scan (ingest path)', async () => {
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.6]]));

    await updateCacheForCandidates([cand('cand_1')], [req('req_1')]);

    expect(mockGetAllActiveRequirements).not.toHaveBeenCalled();
  });

  it('does nothing for an empty candidate list', async () => {
    await updateCacheForCandidates([], [req('req_1')]);
    expect(mockPutMatchCache).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// rebuildCacheForRequirement (requirement create / criteria edit / reopen)
// ---------------------------------------------------------------------------

describe('rebuildCacheForRequirement', () => {
  it('builds the cache from a full active-candidate scan, scored and ranked', async () => {
    mockGetAllActiveCandidates.mockResolvedValue([cand('cand_1'), cand('cand_2'), cand('cand_3')]);
    mockMatchAndRank.mockReturnValue(scored([['cand_2', 0.9], ['cand_1', 0.7]]));

    await rebuildCacheForRequirement(req('req_1'));

    expect(mockGetAllActiveCandidates).toHaveBeenCalledOnce();
    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'cand_2', rank: 1, score: 0.9 },
      { candidate_id: 'cand_1', rank: 2, score: 0.7 },
    ]);
  });

  it('writes an empty cache (does not skip) when there are no active candidates', async () => {
    mockGetAllActiveCandidates.mockResolvedValue([]);
    mockMatchAndRank.mockReturnValue([]);

    await rebuildCacheForRequirement(req('req_1'));

    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', []);
  });

  it('rebuilds deterministically from scratch (ignores any prior cache)', async () => {
    mockGetAllActiveCandidates.mockResolvedValue([cand('cand_1')]);
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.4]]));

    await rebuildCacheForRequirement(req('req_1'));

    // No read-modify-write: getMatchCache is never consulted on a rebuild.
    expect(mockGetMatchCache).not.toHaveBeenCalled();
    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'cand_1', rank: 1, score: 0.4 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// rebuildAllMatchCaches (scheduled + manual full rebuild — ticket #236)
// ---------------------------------------------------------------------------

describe('rebuildAllMatchCaches', () => {
  it('fetches candidates once and writes N caches for N active requirements', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1'), req('req_2')]);
    mockGetAllActiveCandidates.mockResolvedValue([cand('cand_1'), cand('cand_2')]);
    mockMatchAndRank
      .mockReturnValueOnce(scored([['cand_1', 0.9], ['cand_2', 0.5]]))
      .mockReturnValueOnce(scored([['cand_2', 0.8]]));

    await rebuildAllMatchCaches();

    expect(mockGetAllActiveCandidates).toHaveBeenCalledOnce();
    expect(mockPutMatchCache).toHaveBeenCalledTimes(2);
    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'cand_1', rank: 1, score: 0.9 },
      { candidate_id: 'cand_2', rank: 2, score: 0.5 },
    ]);
    expect(mockPutMatchCache).toHaveBeenCalledWith('req_2', [
      { candidate_id: 'cand_2', rank: 1, score: 0.8 },
    ]);
  });

  it('exits early (no candidate scan, no cache writes) when there are no active requirements', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([]);

    await rebuildAllMatchCaches();

    expect(mockGetAllActiveCandidates).not.toHaveBeenCalled();
    expect(mockPutMatchCache).not.toHaveBeenCalled();
  });

  it('writes empty cache for every requirement when no candidates match', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1'), req('req_2')]);
    mockGetAllActiveCandidates.mockResolvedValue([cand('cand_1')]);
    mockMatchAndRank.mockReturnValue([]);

    await rebuildAllMatchCaches();

    expect(mockPutMatchCache).toHaveBeenCalledTimes(2);
    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', []);
    expect(mockPutMatchCache).toHaveBeenCalledWith('req_2', []);
  });

  it('never reads getMatchCache (no read-modify-write)', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1')]);
    mockGetAllActiveCandidates.mockResolvedValue([cand('cand_1')]);
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.7]]));

    await rebuildAllMatchCaches();

    expect(mockGetMatchCache).not.toHaveBeenCalled();
  });

  it('writes rank 1 with the exact scorer output for a single-req single-candidate fixture', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1')]);
    mockGetAllActiveCandidates.mockResolvedValue([cand('cand_1')]);
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.42]]));

    await rebuildAllMatchCaches();

    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'cand_1', rank: 1, score: 0.42 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// deleteMatchCache (requirement close / delete — drop path)
// ---------------------------------------------------------------------------

describe('deleteMatchCache re-export', () => {
  it('delegates to the dynamodb store delete', async () => {
    await deleteMatchCache('req_1');
    expect(mockDeleteMatchCache).toHaveBeenCalledWith('req_1');
  });
});
