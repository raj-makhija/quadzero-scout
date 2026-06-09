import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the worker.
// ---------------------------------------------------------------------------

const mockGetRequirementById = vi.fn();
const mockGetCandidatesByIds = vi.fn();
const mockPutLlmRerank = vi.fn();
const mockRerankTopN = vi.fn();
const mockPutLlmRerankMetric = vi.fn();

vi.mock('../../../lib/dynamodb.js', () => ({
  getRequirementById: (...a: unknown[]) => mockGetRequirementById(...a),
  getCandidatesByIds: (...a: unknown[]) => mockGetCandidatesByIds(...a),
  putLlmRerank: (...a: unknown[]) => mockPutLlmRerank(...a),
}));

vi.mock('../../../lib/llm/index.js', () => ({
  rerankTopN: (...a: unknown[]) => mockRerankTopN(...a),
}));

vi.mock('../../../lib/config.js', () => ({
  config: {
    featureFlags: { llmRerankEnabled: true },
    llm: { provider: 'gemini' },
  },
}));

vi.mock('../../../lib/cloudwatchMetrics.js', () => ({
  putLlmRerankMetric: (...a: unknown[]) => mockPutLlmRerankMetric(...a),
}));

import { config } from '../../../lib/config.js';
import { handler } from '../llmRerankWorker.js';

const REQ_ID = 'req-239';

const candidate = (id: string) => ({
  candidate_id: id,
  full_name: `Name ${id}`,
  primary_skills: ['react'],
  total_experience: 5,
  seniority: 'mid',
  location: 'Remote',
  roles: ['Frontend'],
  headline: `Engineer ${id}`,
});

const requirement = { requirement_id: REQ_ID, jd_text: 'Senior React role' };

const rerankResult = {
  entries: [
    { candidate_id: 'c2', llmScore: 0.9, rationale: 'better' },
    { candidate_id: 'c1', llmScore: 0.5, rationale: 'ok' },
  ],
  model: 'gemini-2.0-flash',
  promptVersion: 3,
  topNHash: 'hash-abc',
  usage: { inputTokens: 1200, outputTokens: 300 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPutLlmRerankMetric.mockResolvedValue(undefined);
  config.featureFlags.llmRerankEnabled = true;
  mockGetRequirementById.mockResolvedValue(requirement);
  mockGetCandidatesByIds.mockResolvedValue([candidate('c1'), candidate('c2')]);
  mockPutLlmRerank.mockResolvedValue(undefined);
  mockRerankTopN.mockResolvedValue(rerankResult);
});

describe('llmRerankWorker', () => {
  it('cold/stale path: calls rerankTopN once and stores the result via putLlmRerank', async () => {
    await handler({ requirementId: REQ_ID, candidateIds: ['c1', 'c2'], topNHash: 'hash-abc' });

    expect(mockRerankTopN).toHaveBeenCalledTimes(1);
    const arg = mockRerankTopN.mock.calls[0][0];
    expect(arg.jobDescription).toBe('Senior React role');
    expect(arg.topNHash).toBe('hash-abc');
    expect(arg.candidates.map((c: { candidate_id: string }) => c.candidate_id)).toEqual(['c1', 'c2']);

    expect(mockPutLlmRerank).toHaveBeenCalledTimes(1);
    const [reqId, stored] = mockPutLlmRerank.mock.calls[0];
    expect(reqId).toBe(REQ_ID);
    expect(stored.top_n_hash).toBe('hash-abc');
    expect(stored.model).toBe('gemini-2.0-flash');
    expect(stored.prompt_version).toBe(3);
    expect(stored.entries).toHaveLength(2);
    expect(typeof stored.computed_at).toBe('string');
  });

  it('preserves the caller deterministic id order when building the prompt', async () => {
    // Store returns candidates in arbitrary order; the worker must re-order to the
    // caller-supplied id sequence before ranking.
    mockGetCandidatesByIds.mockResolvedValue([candidate('c2'), candidate('c1')]);

    await handler({ requirementId: REQ_ID, candidateIds: ['c1', 'c2'], topNHash: 'h' });

    const arg = mockRerankTopN.mock.calls[0][0];
    expect(arg.candidates.map((c: { candidate_id: string }) => c.candidate_id)).toEqual(['c1', 'c2']);
  });

  it('happy path: emits LlmCallCount, LlmLatencyMs, InputTokens, OutputTokens metrics', async () => {
    await handler({ requirementId: REQ_ID, candidateIds: ['c1', 'c2'], topNHash: 'hash-abc' });

    const calls = mockPutLlmRerankMetric.mock.calls;
    const metricNames = calls.map((c: unknown[]) => c[0] as string);
    expect(metricNames).toContain('LlmCallCount');
    expect(metricNames).toContain('LlmLatencyMs');
    expect(metricNames).toContain('InputTokens');
    expect(metricNames).toContain('OutputTokens');

    // LlmCallCount should be 1
    const callCountCall = calls.find((c: unknown[]) => c[0] === 'LlmCallCount');
    expect(callCountCall).toBeDefined();
    expect(callCountCall![1]).toBe(1);

    // Token metrics should carry model+provider dimensions
    const inputTokenCall = calls.find((c: unknown[]) => c[0] === 'InputTokens');
    expect(inputTokenCall![1]).toBe(1200);
    const dims = inputTokenCall![3] as Array<{ Name: string; Value: string }>;
    expect(dims).toEqual(expect.arrayContaining([
      { Name: 'Model', Value: 'gemini-2.0-flash' },
      { Name: 'Provider', Value: 'gemini' },
    ]));

    const outputTokenCall = calls.find((c: unknown[]) => c[0] === 'OutputTokens');
    expect(outputTokenCall![1]).toBe(300);

    // Latency should be a non-negative number
    const latencyCall = calls.find((c: unknown[]) => c[0] === 'LlmLatencyMs');
    expect(typeof latencyCall![1]).toBe('number');
    expect(latencyCall![1]).toBeGreaterThanOrEqual(0);
  });

  it('no usage field: skips token metrics without throwing', async () => {
    mockRerankTopN.mockResolvedValue({ ...rerankResult, usage: undefined });

    await handler({ requirementId: REQ_ID, candidateIds: ['c1', 'c2'], topNHash: 'hash-abc' });

    const metricNames = mockPutLlmRerankMetric.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(metricNames).not.toContain('InputTokens');
    expect(metricNames).not.toContain('OutputTokens');
    expect(metricNames).toContain('LlmCallCount');
    expect(metricNames).toContain('LlmLatencyMs');
  });

  it('kill switch off: emits KillSwitchDisabled and no LLM metrics', async () => {
    config.featureFlags.llmRerankEnabled = false;

    await handler({ requirementId: REQ_ID, candidateIds: ['c1'], topNHash: 'h' });

    expect(mockRerankTopN).not.toHaveBeenCalled();
    expect(mockPutLlmRerank).not.toHaveBeenCalled();

    const metricNames = mockPutLlmRerankMetric.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(metricNames).toContain('KillSwitchDisabled');
    expect(metricNames).not.toContain('LlmCallCount');
    expect(metricNames).not.toContain('InputTokens');
    expect(metricNames).not.toContain('LlmLatencyMs');
  });

  it('empty top-N: no LLM call, no store write, no LLM metrics', async () => {
    await handler({ requirementId: REQ_ID, candidateIds: [], topNHash: 'h' });

    expect(mockGetRequirementById).not.toHaveBeenCalled();
    expect(mockRerankTopN).not.toHaveBeenCalled();
    expect(mockPutLlmRerank).not.toHaveBeenCalled();
    const metricNames = mockPutLlmRerankMetric.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(metricNames).not.toContain('LlmCallCount');
  });

  it('missing requirement: skips without calling the LLM, no LLM metrics', async () => {
    mockGetRequirementById.mockResolvedValue(null);

    await handler({ requirementId: REQ_ID, candidateIds: ['c1'], topNHash: 'h' });

    expect(mockRerankTopN).not.toHaveBeenCalled();
    expect(mockPutLlmRerank).not.toHaveBeenCalled();
    const metricNames = mockPutLlmRerankMetric.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(metricNames).not.toContain('LlmCallCount');
  });

  it('all candidate rows vanished: skips without calling the LLM, no LLM metrics', async () => {
    mockGetCandidatesByIds.mockResolvedValue([]);

    await handler({ requirementId: REQ_ID, candidateIds: ['c1', 'c2'], topNHash: 'h' });

    expect(mockRerankTopN).not.toHaveBeenCalled();
    expect(mockPutLlmRerank).not.toHaveBeenCalled();
    const metricNames = mockPutLlmRerankMetric.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(metricNames).not.toContain('LlmCallCount');
  });

  it('LLM error: swallowed (non-fatal), emits FallbackCount, no store write', async () => {
    mockRerankTopN.mockRejectedValue(new Error('LLM timeout'));

    await expect(
      handler({ requirementId: REQ_ID, candidateIds: ['c1'], topNHash: 'h' })
    ).resolves.toBeUndefined();

    expect(mockPutLlmRerank).not.toHaveBeenCalled();

    const metricNames = mockPutLlmRerankMetric.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(metricNames).toContain('FallbackCount');
    const fallbackCall = mockPutLlmRerankMetric.mock.calls.find((c: unknown[]) => c[0] === 'FallbackCount');
    expect(fallbackCall![1]).toBe(1);
  });

  it('metrics are fire-and-forget: worker stores result even when metric mock is no-op', async () => {
    // putLlmRerankMetric never rejects in production (it catches internally).
    // This test confirms store always runs regardless of metric state.
    mockPutLlmRerankMetric.mockResolvedValue(undefined);

    await handler({ requirementId: REQ_ID, candidateIds: ['c1', 'c2'], topNHash: 'hash-abc' });

    expect(mockPutLlmRerank).toHaveBeenCalledTimes(1);
    expect(mockPutLlmRerankMetric.mock.calls.length).toBeGreaterThan(0);
  });
});
