import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMMessage, LLMOptions, LLMResponse } from '../llm/base.js';
import { BaseLLMProvider } from '../llm/base.js';

// ---------------------------------------------------------------------------
// Mocks — declared before importing rerankTopN. Primary provider is gemini
// (per ticket default); claude is the rate-limit fallback.
// ---------------------------------------------------------------------------

vi.mock('../config.js', () => ({
  config: {
    llm: {
      provider: 'gemini',
      fallbackProvider: 'claude',
      geminiApiKey: 'fake',
      geminiModel: 'gemini-2.0-flash',
      anthropicApiKey: 'fake',
      maxRetries: 1,
    },
  },
}));

const { mockGetActivePrompt } = vi.hoisted(() => ({
  mockGetActivePrompt: vi.fn(),
}));

vi.mock('../dynamodb.js', () => ({
  getActivePrompt: (...args: unknown[]) => mockGetActivePrompt(...args),
}));

class StubProvider extends BaseLLMProvider {
  constructor(public readonly name: string) {
    super();
  }
  public handler: (messages: LLMMessage[], options?: LLMOptions) => Promise<LLMResponse> =
    async () => ({ content: '[]' });
  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    return this.handler(messages, options);
  }
}

const geminiStub = new StubProvider('gemini');
const claudeStub = new StubProvider('claude');

vi.mock('../llm/gemini.js', () => ({
  GeminiProvider: vi.fn().mockImplementation(() => geminiStub),
}));
vi.mock('../llm/claude.js', () => ({
  ClaudeProvider: vi.fn().mockImplementation(() => claudeStub),
}));

// Import after mocks.
import { rerankTopN, _clearPromptCache, type RerankCandidateInput } from '../llm/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CANDIDATES: RerankCandidateInput[] = [
  { candidate_id: 'cand_1', profile: 'React, TypeScript, 8 yrs' },
  { candidate_id: 'cand_2', profile: 'Node, AWS, 5 yrs' },
  { candidate_id: 'cand_3', profile: 'Go, Kubernetes, 6 yrs' },
];

/** A well-formed LLM JSON response covering exactly the given candidate ids. */
const validResponseFor = (cands: RerankCandidateInput[]): string =>
  JSON.stringify(
    cands.map((c, i) => ({
      candidate_id: c.candidate_id,
      llmScore: 90 - i * 5,
      rationale: `Rationale for ${c.candidate_id}.`,
    }))
  );

const rateLimitError = () => Object.assign(new Error('429 Too Many Requests'), { status: 429 });

beforeEach(() => {
  vi.clearAllMocks();
  _clearPromptCache();
  mockGetActivePrompt.mockResolvedValue(null); // default: fallback prompt path
  geminiStub.handler = async () => ({ content: validResponseFor(CANDIDATES) });
  claudeStub.handler = async () => ({ content: validResponseFor(CANDIDATES) });
});

describe('rerankTopN() — batched compute', () => {
  it('issues exactly one LLM call regardless of top-N count', async () => {
    const handler = vi.fn(async () => ({ content: validResponseFor(CANDIDATES) }));
    geminiStub.handler = handler;

    await rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns a scored + rationale-d entry for every candidate passed in', async () => {
    const result = await rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' });

    expect(result.entries).toHaveLength(CANDIDATES.length);
    for (const e of result.entries) {
      expect(e.candidate_id).toBeTruthy();
      expect(typeof e.llmScore).toBe('number');
      expect(e.rationale).toBeTruthy();
    }
  });

  it('stamps promptVersion from the active Prompts table entry', async () => {
    mockGetActivePrompt.mockResolvedValue({
      prompt_key: 'candidate_reranker',
      content: 'Custom reranker system prompt',
      version: 7,
      is_active: true,
    });

    const result = await rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' });

    expect(mockGetActivePrompt).toHaveBeenCalledWith('candidate_reranker');
    expect(result.promptVersion).toBe(7);
  });

  it('stamps a non-empty model field on the output', async () => {
    const result = await rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' });
    expect(result.model).toBe('gemini-2.0-flash');
    expect(result.model.length).toBeGreaterThan(0);
  });

  it('echoes the caller-supplied topNHash verbatim on the output', async () => {
    const result = await rerankTopN({
      jobDescription: 'Senior FE',
      candidates: CANDIDATES,
      topNHash: 'deterministic-hash-xyz',
    });
    expect(result.topNHash).toBe('deterministic-hash-xyz');
  });

  it('fetches the candidate_reranker prompt and falls back without crashing when the DB has none', async () => {
    mockGetActivePrompt.mockResolvedValue(null);
    let systemContent = '';
    geminiStub.handler = async (messages) => {
      systemContent = messages.find((m) => m.role === 'system')?.content ?? '';
      return { content: validResponseFor(CANDIDATES) };
    };

    const result = await rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' });

    expect(mockGetActivePrompt).toHaveBeenCalledWith('candidate_reranker');
    expect(result.promptVersion).toBeNull();
    expect(systemContent).toContain('candidate_id'); // fallback prompt body was used
    expect(result.entries).toHaveLength(CANDIDATES.length);
  });

  it('falls back to the secondary provider when the primary is rate-limited', async () => {
    const primary = vi.fn(async () => {
      throw rateLimitError();
    });
    const fallback = vi.fn(async () => ({ content: validResponseFor(CANDIDATES) }));
    geminiStub.handler = primary;
    claudeStub.handler = fallback;

    const result = await rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' });

    expect(primary).toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result.entries).toHaveLength(CANDIDATES.length);
    expect(result.model).toBe('claude-sonnet-4-6'); // model reflects the provider that served
  });

  it('returns an empty array without any LLM call for an empty top-N list', async () => {
    const handler = vi.fn(async () => ({ content: '[]' }));
    geminiStub.handler = handler;

    const result = await rerankTopN({ jobDescription: 'Senior FE', candidates: [], topNHash: 'h1' });

    expect(handler).not.toHaveBeenCalled();
    expect(mockGetActivePrompt).not.toHaveBeenCalled();
    expect(result.entries).toEqual([]);
    expect(result.topNHash).toBe('h1');
    expect(result.model).toBe('gemini-2.0-flash');
  });

  it('propagates a non-rate-limit primary error without attempting fallback', async () => {
    const primary = vi.fn(async () => {
      throw new Error('boom — invalid request');
    });
    const fallback = vi.fn(async () => ({ content: validResponseFor(CANDIDATES) }));
    geminiStub.handler = primary;
    claudeStub.handler = fallback;

    await expect(
      rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' })
    ).rejects.toThrow('boom');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('throws a descriptive error on malformed JSON rather than returning a partial result', async () => {
    geminiStub.handler = async () => ({ content: 'not json at all {' });

    await expect(
      rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' })
    ).rejects.toThrow();
  });

  it('tolerates an omitted candidate by returning the entries the model did supply', async () => {
    // A truncated/partial response must not fail the whole batch — otherwise the
    // read path never persists a result and the UI hangs at "Refining order…".
    geminiStub.handler = async () => ({ content: validResponseFor(CANDIDATES.slice(0, 2)) });

    const result = await rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' });

    expect(result.entries.map((e) => e.candidate_id)).toEqual(['cand_1', 'cand_2']);
  });

  it('drops a truncated/malformed entry but keeps the valid ones', async () => {
    // Models a maxTokens-truncated response: the last entry lost its required
    // fields (the production "[34].llmScore Required" failure).
    const content = JSON.stringify([
      { candidate_id: 'cand_1', llmScore: 90, rationale: 'Strong.' },
      { candidate_id: 'cand_2', llmScore: 80, rationale: 'Good.' },
      { candidate_id: 'cand_3' },
    ]);
    geminiStub.handler = async () => ({ content });

    const result = await rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' });

    expect(result.entries.map((e) => e.candidate_id)).toEqual(['cand_1', 'cand_2']);
  });

  it('throws only when the response yields no usable entries at all', async () => {
    geminiStub.handler = async () => ({ content: '[]' });

    await expect(
      rerankTopN({ jobDescription: 'Senior FE', candidates: CANDIDATES, topNHash: 'h1' })
    ).rejects.toThrow(/no usable entries/);
  });
});
