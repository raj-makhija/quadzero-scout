import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the worker.
// ---------------------------------------------------------------------------

const mockGetRequirementById = vi.fn();
const mockGetCandidatesByIds = vi.fn();
const mockPutLlmRerank = vi.fn();
const mockRerankTopN = vi.fn();

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
  },
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

beforeEach(() => {
  vi.clearAllMocks();
  config.featureFlags.llmRerankEnabled = true;
  mockGetRequirementById.mockResolvedValue(requirement);
  mockGetCandidatesByIds.mockResolvedValue([candidate('c1'), candidate('c2')]);
  mockPutLlmRerank.mockResolvedValue(undefined);
  mockRerankTopN.mockResolvedValue({
    entries: [
      { candidate_id: 'c2', llmScore: 0.9, rationale: 'better' },
      { candidate_id: 'c1', llmScore: 0.5, rationale: 'ok' },
    ],
    model: 'gemini-2.0-flash',
    promptVersion: 3,
    topNHash: 'hash-abc',
  });
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

  it('kill switch off: does no LLM work', async () => {
    config.featureFlags.llmRerankEnabled = false;

    await handler({ requirementId: REQ_ID, candidateIds: ['c1'], topNHash: 'h' });

    expect(mockRerankTopN).not.toHaveBeenCalled();
    expect(mockPutLlmRerank).not.toHaveBeenCalled();
  });

  it('empty top-N: no LLM call, no store write', async () => {
    await handler({ requirementId: REQ_ID, candidateIds: [], topNHash: 'h' });

    expect(mockGetRequirementById).not.toHaveBeenCalled();
    expect(mockRerankTopN).not.toHaveBeenCalled();
    expect(mockPutLlmRerank).not.toHaveBeenCalled();
  });

  it('missing requirement: skips without calling the LLM', async () => {
    mockGetRequirementById.mockResolvedValue(null);

    await handler({ requirementId: REQ_ID, candidateIds: ['c1'], topNHash: 'h' });

    expect(mockRerankTopN).not.toHaveBeenCalled();
    expect(mockPutLlmRerank).not.toHaveBeenCalled();
  });

  it('all candidate rows vanished: skips without calling the LLM', async () => {
    mockGetCandidatesByIds.mockResolvedValue([]);

    await handler({ requirementId: REQ_ID, candidateIds: ['c1', 'c2'], topNHash: 'h' });

    expect(mockRerankTopN).not.toHaveBeenCalled();
    expect(mockPutLlmRerank).not.toHaveBeenCalled();
  });

  it('LLM error: swallowed (non-fatal), no store write', async () => {
    mockRerankTopN.mockRejectedValue(new Error('LLM timeout'));

    await expect(
      handler({ requirementId: REQ_ID, candidateIds: ['c1'], topNHash: 'h' })
    ).resolves.toBeUndefined();

    expect(mockPutLlmRerank).not.toHaveBeenCalled();
  });
});
