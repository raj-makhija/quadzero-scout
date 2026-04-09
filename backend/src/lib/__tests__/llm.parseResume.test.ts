import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMMessage, LLMOptions, LLMResponse } from '../llm/base.js';
import { BaseLLMProvider } from '../llm/base.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing parseResume
// ---------------------------------------------------------------------------

vi.mock('../config.js', () => ({
  config: {
    llm: {
      provider: 'gemini',
      geminiApiKey: 'fake',
      geminiModel: 'gemini-2.5-flash',
      maxRetries: 1,
    },
  },
}));

vi.mock('../dynamodb.js', () => ({
  getActivePrompt: vi.fn().mockResolvedValue(null), // forces fallback prompt path
}));

// Capture the provider instance constructed by getLLMProvider() so each test
// can swap out its `complete` handler.
class StubGeminiProvider extends BaseLLMProvider {
  readonly name = 'gemini';
  public handler: (messages: LLMMessage[], options?: LLMOptions) => Promise<LLMResponse> =
    async () => ({ content: '{}' });
  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    return this.handler(messages, options);
  }
}

const stubProvider = new StubGeminiProvider();

vi.mock('../llm/gemini.js', () => ({
  GeminiProvider: vi.fn().mockImplementation(() => stubProvider),
}));

// Import after mocks
import { parseResume } from '../llm/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VALID_RESUME_JSON = JSON.stringify({
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  primarySkills: ['react', 'typescript'],
  primarySkillYears: { react: 4, typescript: 4 },
  secondarySkills: ['aws'],
  totalExperience: 5,
  seniority: 'senior',
  roles: ['Frontend Engineer'],
  education: [{ degree: 'BS', institution: 'MIT', year: 2018 }],
  summary: 'Experienced engineer.',
});

// ---------------------------------------------------------------------------
// Tests for parseResume cost-control retry behavior
// ---------------------------------------------------------------------------

describe('parseResume() — token-budget retry behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses 4096-token budget on the first attempt and does not retry when output is valid', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => ({
      content: VALID_RESUME_JSON,
    }));
    stubProvider.handler = handler;

    const { output } = await parseResume('John Doe\nReact developer\n5 years experience');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(4096);
    expect(output.fullName).toBe('Jane Doe');
  });

  it('retries with 8192-token budget when the 4096 attempt returns truncated/invalid JSON', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => {
      // First call (4096) returns truncated JSON; second call (8192) succeeds.
      if (options?.maxTokens === 4096) {
        return { content: '{"fullName": "Jane Doe", "primarySki' }; // truncated
      }
      return { content: VALID_RESUME_JSON };
    });
    stubProvider.handler = handler;

    const { output } = await parseResume('resume text');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(4096);
    expect(handler.mock.calls[1][1]?.maxTokens).toBe(8192);
    expect(output.fullName).toBe('Jane Doe');
  });

  it('throws with the original validation error when both 4096 and 8192 attempts fail', async () => {
    const handler = vi.fn(async (): Promise<LLMResponse> => ({
      content: 'not json at all',
    }));
    stubProvider.handler = handler;

    await expect(parseResume('resume text')).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(4096);
    expect(handler.mock.calls[1][1]?.maxTokens).toBe(8192);
  });
});
