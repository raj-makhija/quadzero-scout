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
  saveLinkedInToken: vi.fn().mockResolvedValue(undefined),
  getLinkedInToken: vi.fn().mockResolvedValue(null),
  savePendingLinkedInState: vi.fn().mockResolvedValue(undefined),
  markLinkedInTokenExpired: vi.fn().mockResolvedValue(undefined),
  writeLinkedInPost: vi.fn().mockResolvedValue(undefined),
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
import { generateScreeningQuestions, _clearPromptCache } from '../llm/index.js';
import { getActivePrompt } from '../dynamodb.js';

function questions(n: number): string {
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({ question: `Q${i + 1}?`, category: 'Technical' }))
  );
}

describe('generateScreeningQuestions() — 3–10 count enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearPromptCache();
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

describe('generateScreeningQuestions() — suitable requirements in prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearPromptCache();
  });

  it('includes suitable requirements section in the user message when provided', async () => {
    let capturedUserMessage = '';
    stubProvider.handler = async (messages: LLMMessage[]) => {
      capturedUserMessage = messages.find((m) => m.role === 'user')?.content ?? '';
      return { content: questions(5) };
    };

    await generateScreeningQuestions('React developer, 5 years', [
      { jobTitle: 'Frontend Lead', mustHaveSkills: ['react', 'typescript'], mustHaveMissing: ['typescript'] },
    ]);

    expect(capturedUserMessage).toContain('Candidate profile:');
    expect(capturedUserMessage).toContain('Suitable open requirements');
    expect(capturedUserMessage).toContain('Frontend Lead');
    expect(capturedUserMessage).toContain('Required skills: react, typescript');
    expect(capturedUserMessage).toContain('Candidate is missing: typescript');
  });

  it('includes all provided requirements in the user message', async () => {
    let capturedUserMessage = '';
    stubProvider.handler = async (messages: LLMMessage[]) => {
      capturedUserMessage = messages.find((m) => m.role === 'user')?.content ?? '';
      return { content: questions(5) };
    };

    await generateScreeningQuestions('profile', [
      { jobTitle: 'Role A', mustHaveSkills: ['react'], mustHaveMissing: [] },
      { jobTitle: 'Role B', mustHaveSkills: ['python'], mustHaveMissing: ['python'] },
    ]);

    expect(capturedUserMessage).toContain('Role A');
    expect(capturedUserMessage).toContain('Role B');
    expect(capturedUserMessage).toContain('python');
  });

  it('omits the requirements section when suitableRequirements is empty', async () => {
    let capturedUserMessage = '';
    stubProvider.handler = async (messages: LLMMessage[]) => {
      capturedUserMessage = messages.find((m) => m.role === 'user')?.content ?? '';
      return { content: questions(5) };
    };

    await generateScreeningQuestions('profile', []);

    expect(capturedUserMessage).not.toContain('Suitable open requirements');
  });

  it('omits the requirements section when suitableRequirements is undefined', async () => {
    let capturedUserMessage = '';
    stubProvider.handler = async (messages: LLMMessage[]) => {
      capturedUserMessage = messages.find((m) => m.role === 'user')?.content ?? '';
      return { content: questions(5) };
    };

    await generateScreeningQuestions('profile');

    expect(capturedUserMessage).not.toContain('Suitable open requirements');
  });

  it('omits "Candidate is missing" line when mustHaveMissing is empty', async () => {
    let capturedUserMessage = '';
    stubProvider.handler = async (messages: LLMMessage[]) => {
      capturedUserMessage = messages.find((m) => m.role === 'user')?.content ?? '';
      return { content: questions(5) };
    };

    await generateScreeningQuestions('profile', [
      { jobTitle: 'Full Match Role', mustHaveSkills: ['react'], mustHaveMissing: [] },
    ]);

    expect(capturedUserMessage).toContain('Full Match Role');
    expect(capturedUserMessage).not.toContain('Candidate is missing');
  });

  it('uses the DB prompt as the system message when getActivePrompt returns one', async () => {
    vi.mocked(getActivePrompt).mockResolvedValueOnce({
      prompt_id: 'screening_questions',
      content: 'CUSTOM_DB_PROMPT',
      version: 2,
      created_at: '',
      updated_at: '',
      created_by: '',
    } as any);

    let capturedSystemMessage = '';
    stubProvider.handler = async (messages: LLMMessage[]) => {
      capturedSystemMessage = messages.find((m) => m.role === 'system')?.content ?? '';
      return { content: questions(5) };
    };

    await generateScreeningQuestions('summary');

    expect(capturedSystemMessage).toBe('CUSTOM_DB_PROMPT');
  });
});
