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
  getActivePricingConfig: vi.fn().mockResolvedValue({
    gstRatePct: 0.18,
    minContributionPerMonth: 30000,
    costOfCapitalPctAnnual: 0.12,
  }),
  saveLinkedInToken: vi.fn().mockResolvedValue(undefined),
  getLinkedInToken: vi.fn().mockResolvedValue(null),
  savePendingLinkedInState: vi.fn().mockResolvedValue(undefined),
  markLinkedInTokenExpired: vi.fn().mockResolvedValue(undefined),
  writeLinkedInPost: vi.fn().mockResolvedValue(undefined),
}));

const mockMatchAndRank = vi.fn();
vi.mock('../candidateMatching.js', () => ({
  matchAndRankCandidates: (...a: unknown[]) => mockMatchAndRank(...a),
}));

import {
  updateCacheForCandidates,
  rebuildCacheForRequirement,
  rebuildAllMatchCaches,
  rebuildMatchCachesForRequirements,
  auditMatchCacheHealth,
  CACHE_DELTA_THRESHOLD,
  REBUILD_CHUNK_SIZE,
  deleteMatchCache,
} from '../matchCacheService.js';
import { getLlmRerank, putLlmRerank } from '../dynamodb.js';

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
// rebuildCacheForRequirement — bounded retry (ticket #447)
// ---------------------------------------------------------------------------

describe('rebuildCacheForRequirement retry', () => {
  it('retries and succeeds after a transient putMatchCache failure', async () => {
    mockGetAllActiveCandidates.mockResolvedValue([cand('c1')]);
    mockMatchAndRank.mockReturnValue(scored([['c1', 0.7]]));
    mockPutMatchCache.mockRejectedValueOnce(new Error('throttle')).mockResolvedValueOnce(undefined);

    await rebuildCacheForRequirement(req('req_1'));

    expect(mockPutMatchCache).toHaveBeenCalledTimes(2);
    expect(mockPutMatchCache).toHaveBeenLastCalledWith('req_1', [
      { candidate_id: 'c1', rank: 1, score: 0.7 },
    ]);
  });

  it('retries and succeeds after a transient getAllActiveCandidates failure', async () => {
    mockGetAllActiveCandidates
      .mockRejectedValueOnce(new Error('scan failed'))
      .mockResolvedValue([cand('c1')]);
    mockMatchAndRank.mockReturnValue(scored([['c1', 0.5]]));

    await rebuildCacheForRequirement(req('req_1'));

    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'c1', rank: 1, score: 0.5 },
    ]);
  });

  it('succeeds on the third attempt when the first two fail', async () => {
    mockGetAllActiveCandidates
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockResolvedValue([cand('c1')]);
    mockMatchAndRank.mockReturnValue(scored([['c1', 0.9]]));

    await rebuildCacheForRequirement(req('req_1'));

    expect(mockGetAllActiveCandidates).toHaveBeenCalledTimes(3);
    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'c1', rank: 1, score: 0.9 },
    ]);
  });

  it('throws after exhausting 3 bounded attempts on persistent failure', async () => {
    mockGetAllActiveCandidates.mockRejectedValue(new Error('table down'));

    await expect(rebuildCacheForRequirement(req('req_1'))).rejects.toThrow('table down');
    expect(mockGetAllActiveCandidates).toHaveBeenCalledTimes(3);
    expect(mockPutMatchCache).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// auditMatchCacheHealth — scheduled cache-health audit (ticket #447)
// ---------------------------------------------------------------------------

function cacheEntries(n: number) {
  return Array.from({ length: n }, (_, i) => ({ candidate_id: `c${i}`, rank: i + 1, score: 1 }));
}
function scoredN(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    candidate: cand(`c${i}`),
    score: 1,
    details: {},
    budgetFit: true,
  }));
}

describe('auditMatchCacheHealth', () => {
  it('exposes a delta threshold of 20', () => {
    expect(CACHE_DELTA_THRESHOLD).toBe(20);
  });

  it('warns EMPTY_CACHE when cached is 0 but a fresh re-score returns matches', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1')]);
    mockGetAllActiveCandidates.mockResolvedValue([cand('c0'), cand('c1')]);
    mockGetMatchCache.mockResolvedValue([]); // cached = 0
    mockMatchAndRank.mockReturnValue(scoredN(5)); // fresh = 5

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await auditMatchCacheHealth();

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('EMPTY_CACHE');
    expect(String(warn.mock.calls[0][0])).toContain('req_1');
    warn.mockRestore();
  });

  it('does NOT trigger an inline rebuild — never writes the cache', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1')]);
    mockGetAllActiveCandidates.mockResolvedValue([cand('c0')]);
    mockGetMatchCache.mockResolvedValue([]);
    mockMatchAndRank.mockReturnValue(scoredN(5));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await auditMatchCacheHealth();

    expect(mockPutMatchCache).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not warn when both cached and fresh are zero (genuinely matchless)', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1')]);
    mockGetAllActiveCandidates.mockResolvedValue([]);
    mockGetMatchCache.mockResolvedValue([]);
    mockMatchAndRank.mockReturnValue([]);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await auditMatchCacheHealth();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns LARGE_DELTA on over-count drift beyond the threshold (50 vs 10)', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1')]);
    mockGetAllActiveCandidates.mockResolvedValue([cand('c0')]);
    mockGetMatchCache.mockResolvedValue(cacheEntries(50));
    mockMatchAndRank.mockReturnValue(scoredN(10));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await auditMatchCacheHealth();

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('LARGE_DELTA');
    warn.mockRestore();
  });

  it('warns LARGE_DELTA on under-count drift beyond the threshold (5 vs 30)', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1')]);
    mockGetAllActiveCandidates.mockResolvedValue([cand('c0')]);
    mockGetMatchCache.mockResolvedValue(cacheEntries(5));
    mockMatchAndRank.mockReturnValue(scoredN(30));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await auditMatchCacheHealth();

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('LARGE_DELTA');
    warn.mockRestore();
  });

  it('does not warn when the delta is within the threshold (15 vs 10)', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1')]);
    mockGetAllActiveCandidates.mockResolvedValue([cand('c0')]);
    mockGetMatchCache.mockResolvedValue(cacheEntries(15));
    mockMatchAndRank.mockReturnValue(scoredN(10));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await auditMatchCacheHealth();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
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
// rebuildMatchCachesForRequirements (chunked nightly rebuild — ticket #462)
// ---------------------------------------------------------------------------

describe('rebuildMatchCachesForRequirements', () => {
  it('exposes a positive REBUILD_CHUNK_SIZE constant', () => {
    expect(REBUILD_CHUNK_SIZE).toBeGreaterThan(0);
  });

  it('fetches candidates once and writes a cache per requirement', async () => {
    mockGetAllActiveCandidates.mockResolvedValue([cand('c1'), cand('c2')]);
    mockMatchAndRank
      .mockReturnValueOnce(scored([['c1', 0.9]]))
      .mockReturnValueOnce(scored([['c2', 0.7]]));

    await rebuildMatchCachesForRequirements([req('req_1'), req('req_2')]);

    expect(mockGetAllActiveCandidates).toHaveBeenCalledOnce();
    expect(mockPutMatchCache).toHaveBeenCalledTimes(2);
    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', [
      { candidate_id: 'c1', rank: 1, score: 0.9 },
    ]);
    expect(mockPutMatchCache).toHaveBeenCalledWith('req_2', [
      { candidate_id: 'c2', rank: 1, score: 0.7 },
    ]);
  });

  it('returns immediately without scanning candidates when given an empty list', async () => {
    await rebuildMatchCachesForRequirements([]);

    expect(mockGetAllActiveCandidates).not.toHaveBeenCalled();
    expect(mockPutMatchCache).not.toHaveBeenCalled();
  });

  it('writes an empty cache for a requirement whose candidate pool produces no matches', async () => {
    mockGetAllActiveCandidates.mockResolvedValue([cand('c1')]);
    mockMatchAndRank.mockReturnValue([]);

    await rebuildMatchCachesForRequirements([req('req_1')]);

    expect(mockPutMatchCache).toHaveBeenCalledWith('req_1', []);
  });

  it('is idempotent: writing the same requirement twice produces the same final cache', async () => {
    mockGetAllActiveCandidates.mockResolvedValue([cand('c1')]);
    mockMatchAndRank.mockReturnValue(scored([['c1', 0.5]]));

    await rebuildMatchCachesForRequirements([req('req_1')]);
    await rebuildMatchCachesForRequirements([req('req_1')]);

    const calls = mockPutMatchCache.mock.calls.filter(([id]) => id === 'req_1');
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toEqual(calls[1][1]);
  });

  it('logs and continues when putMatchCache fails for one requirement', async () => {
    mockGetAllActiveCandidates.mockResolvedValue([cand('c1')]);
    mockMatchAndRank.mockReturnValue(scored([['c1', 0.6]]));
    mockPutMatchCache
      .mockRejectedValueOnce(new Error('throttle'))
      .mockResolvedValueOnce(undefined);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await rebuildMatchCachesForRequirements([req('req_1'), req('req_2')]);

    expect(errSpy).toHaveBeenCalledOnce();
    expect(mockPutMatchCache).toHaveBeenCalledTimes(2);
    errSpy.mockRestore();
  });

  it('never reads getMatchCache (authoritative write, no read-modify-write)', async () => {
    mockGetAllActiveCandidates.mockResolvedValue([cand('c1')]);
    mockMatchAndRank.mockReturnValue(scored([['c1', 0.7]]));

    await rebuildMatchCachesForRequirements([req('req_1')]);

    expect(mockGetMatchCache).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// LLM re-rank regression guard (#239): the cache write paths (candidate ingest,
// requirement rebuild, nightly full rebuild) must NEVER touch the LLM re-rank
// store or fire a recompute. Re-rank is strictly a lazy read-path overlay.
// ---------------------------------------------------------------------------

describe('cache write paths never trigger LLM re-rank', () => {
  it('updateCacheForCandidates (ingest/edit) makes no LLM re-rank calls', async () => {
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.7]]));
    await updateCacheForCandidates([cand('cand_1')], [req('req_1')]);
    expect(vi.mocked(getLlmRerank)).not.toHaveBeenCalled();
    expect(vi.mocked(putLlmRerank)).not.toHaveBeenCalled();
  });

  it('rebuildCacheForRequirement makes no LLM re-rank calls', async () => {
    mockGetAllActiveCandidates.mockResolvedValue([cand('cand_1')]);
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.7]]));
    await rebuildCacheForRequirement(req('req_1'));
    expect(vi.mocked(getLlmRerank)).not.toHaveBeenCalled();
    expect(vi.mocked(putLlmRerank)).not.toHaveBeenCalled();
  });

  it('rebuildAllMatchCaches (nightly) makes no LLM re-rank calls', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([req('req_1')]);
    mockGetAllActiveCandidates.mockResolvedValue([cand('cand_1')]);
    mockMatchAndRank.mockReturnValue(scored([['cand_1', 0.42]]));
    await rebuildAllMatchCaches();
    expect(vi.mocked(getLlmRerank)).not.toHaveBeenCalled();
    expect(vi.mocked(putLlmRerank)).not.toHaveBeenCalled();
  });
});
