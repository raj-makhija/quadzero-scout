import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test.
// ---------------------------------------------------------------------------

const mockGetLlmRerank = vi.fn();
const mockClaimLlmRerank = vi.fn();
const mockInvokeLambdaAsync = vi.fn();
const mockGetRerankSignature = vi.fn();
const mockPutLlmRerankMetric = vi.fn();

vi.mock('../dynamodb.js', () => ({
  getLlmRerank: (...a: unknown[]) => mockGetLlmRerank(...a),
  claimLlmRerankComputation: (...a: unknown[]) => mockClaimLlmRerank(...a),
  saveLinkedInToken: vi.fn().mockResolvedValue(undefined),
  getLinkedInToken: vi.fn().mockResolvedValue(null),
  savePendingLinkedInState: vi.fn().mockResolvedValue(undefined),
  markLinkedInTokenExpired: vi.fn().mockResolvedValue(undefined),
  writeLinkedInPost: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lambdaInvoke.js', () => ({
  invokeLambdaAsync: (...a: unknown[]) => mockInvokeLambdaAsync(...a),
}));

vi.mock('../llm/index.js', () => ({
  getRerankSignature: (...a: unknown[]) => mockGetRerankSignature(...a),
}));

vi.mock('../cloudwatchMetrics.js', () => ({
  putLlmRerankMetric: (...a: unknown[]) => mockPutLlmRerankMetric(...a),
}));

vi.mock('../config.js', () => ({
  config: {
    featureFlags: { llmRerankEnabled: true },
    lambda: { llmRerankWorkerName: 'llm-rerank-worker' },
  },
}));

import { config } from '../config.js';
import { applyLlmRerankOverlay } from '../llmRerank.js';

// sha256('c1|c2') — precomputed so this test has no runtime dep on crypto
const TOP_N_HASH = 'cd26f669ad88836a49accc10247287c047d736d74c748a07c86e2222bbab5350';

const freshEntry = {
  requirement_id: 'req-1',
  top_n_hash: TOP_N_HASH,
  model: 'gemini-2.0-flash',
  prompt_version: 1,
  computed_at: '2026-01-01T00:00:00Z',
  entries: [
    { candidate_id: 'c1', llmScore: 90, rationale: 'great' },
    { candidate_id: 'c2', llmScore: 70, rationale: 'ok' },
  ],
};

const page = [
  { candidateId: 'c1', score: 0.8 } as any,
  { candidateId: 'c2', score: 0.7 } as any,
];

const topNIds = ['c1', 'c2'];

beforeEach(() => {
  vi.clearAllMocks();
  mockPutLlmRerankMetric.mockResolvedValue(undefined);
  mockInvokeLambdaAsync.mockResolvedValue(undefined);
  mockClaimLlmRerank.mockResolvedValue(true); // default: this view wins the claim
  mockGetRerankSignature.mockResolvedValue({ model: 'gemini-2.0-flash', promptVersion: 1 });
  config.featureFlags.llmRerankEnabled = true;
});

describe('applyLlmRerankOverlay — cache-hit metric', () => {
  it('emits CacheHit when a fresh stored entry is served', async () => {
    mockGetLlmRerank.mockResolvedValue(freshEntry);

    const result = await applyLlmRerankOverlay('req-1', topNIds, page);

    expect(result.ranked).toBe(true);
    expect(result.pending).toBe(false);

    expect(mockPutLlmRerankMetric).toHaveBeenCalledWith('CacheHit', 1, 'Count');
    expect(mockPutLlmRerankMetric).not.toHaveBeenCalledWith('CacheMiss', expect.anything(), expect.anything());
  });
});

describe('applyLlmRerankOverlay — cache-miss metric', () => {
  it('emits CacheMiss when no stored entry exists', async () => {
    mockGetLlmRerank.mockResolvedValue(null);

    const result = await applyLlmRerankOverlay('req-1', topNIds, page);

    expect(result.ranked).toBe(false);
    expect(result.pending).toBe(true);

    expect(mockPutLlmRerankMetric).toHaveBeenCalledWith('CacheMiss', 1, 'Count');
    expect(mockPutLlmRerankMetric).not.toHaveBeenCalledWith('CacheHit', expect.anything(), expect.anything());
  });

  it('emits CacheMiss when stored entry has stale hash', async () => {
    mockGetLlmRerank.mockResolvedValue({ ...freshEntry, top_n_hash: 'old-hash' });

    const result = await applyLlmRerankOverlay('req-1', topNIds, page);

    expect(result.pending).toBe(true);

    expect(mockPutLlmRerankMetric).toHaveBeenCalledWith('CacheMiss', 1, 'Count');
  });
});

describe('applyLlmRerankOverlay — in-flight claim guard', () => {
  it('invokes the worker once when this view wins the claim', async () => {
    mockGetLlmRerank.mockResolvedValue(null);
    mockClaimLlmRerank.mockResolvedValue(true);

    const result = await applyLlmRerankOverlay('req-1', topNIds, page);

    expect(result.pending).toBe(true);
    expect(mockClaimLlmRerank).toHaveBeenCalledTimes(1);
    expect(mockInvokeLambdaAsync).toHaveBeenCalledTimes(1);
  });

  it('does NOT invoke the worker when another view already holds the claim', async () => {
    mockGetLlmRerank.mockResolvedValue(null);
    mockClaimLlmRerank.mockResolvedValue(false);

    const result = await applyLlmRerankOverlay('req-1', topNIds, page);

    // Still pending (compute is in flight elsewhere), but no duplicate LLM call.
    expect(result.pending).toBe(true);
    expect(mockInvokeLambdaAsync).not.toHaveBeenCalled();
  });
});

describe('applyLlmRerankOverlay — no metrics on skip paths', () => {
  it('emits no cache metrics when kill switch is off', async () => {
    config.featureFlags.llmRerankEnabled = false;

    await applyLlmRerankOverlay('req-1', topNIds, page);

    expect(mockPutLlmRerankMetric).not.toHaveBeenCalled();
  });

  it('emits no cache metrics when top-N is empty', async () => {
    await applyLlmRerankOverlay('req-1', [], page);

    expect(mockPutLlmRerankMetric).not.toHaveBeenCalled();
  });
});
