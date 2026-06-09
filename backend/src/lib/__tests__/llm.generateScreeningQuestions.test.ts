import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMMessage, LLMOptions, LLMResponse } from '../llm/base.js';
import { BaseLLMProvider } from '../llm/base.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing generateScreeningQuestions
// ---------------------------------------------------------------------------

vi.mock('../config.js', () => ({
  config: {
    llm: {
      provider: 'claude',
      anthropicApiKey: 'fake',
      maxRetries: 1,
    },
  },
}));

vi.mock('../dynamodb.js', () => ({
  getLlmRerank: vi.fn().mockResolvedValue(null),
  putLlmRerank: vi.fn().mockResolvedValue(undefined),
  deleteLlmRerank: vi.fn().mockResolvedValue(undefined),
  getActivePrompt: vi.fn().mockResolvedValue(null), // forces fallback prompt path
}));

class StubClaudeProvider extends BaseLLMProvider {
  readonly name = 'claude';
  public handler: (messages: LLMMessage[], options?: LLMOptions) => Promise<LLMResponse> =
    async () => ({ content: '[]' });
  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    return this.handler(messages, options);
  }
}

const stubProvider = new StubClaudeProvider();

vi.mock('../llm/claude.js', () => ({
  ClaudeProvider: vi.fn().mockImplementation(() => stubProvider),
}));

// Import after mocks
import { generateScreeningQuestions } from '../llm/index.js';

function questions(n: number): string {
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({ question: `Q${i + 1}?`, category: 'Technical' }))
  );
}

describe('generateScreeningQuestions() — 3–10 count enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid list when the LLM returns 3–10 questions', async () => {
    stubProvider.handler = async () => ({ content: questions(5) });
    const result = await generateScreeningQuestions('React developer, 5 years');
    expect(result).toHaveLength(5);
    expect(result[0].question).toBe('Q1?');
  });

  it('accepts a wrapped { questions: [...] } response shape', async () => {
    stubProvider.handler = async () => ({
      content: JSON.stringify({ questions: [{ question: 'A?' }, { question: 'B?' }, { question: 'C?' }] }),
    });
    const result = await generateScreeningQuestions('summary');
    expect(result).toHaveLength(3);
  });

  it('clamps responses with more than 10 questions down to 10', async () => {
    stubProvider.handler = async () => ({ content: questions(14) });
    const result = await generateScreeningQuestions('summary');
    expect(result).toHaveLength(10);
  });

  it('throws when the LLM returns fewer than 3 questions', async () => {
    stubProvider.handler = async () => ({ content: questions(2) });
    await expect(generateScreeningQuestions('summary')).rejects.toThrow(/at least 3/);
  });

  it('throws when the LLM returns an empty array', async () => {
    stubProvider.handler = async () => ({ content: '[]' });
    await expect(generateScreeningQuestions('summary')).rejects.toThrow();
  });

  it('throws when the LLM returns unparseable JSON', async () => {
    stubProvider.handler = async () => ({ content: 'not json at all' });
    await expect(generateScreeningQuestions('summary')).rejects.toThrow();
  });
});
