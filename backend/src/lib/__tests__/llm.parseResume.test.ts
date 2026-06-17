import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMMessage, LLMOptions, LLMResponse } from '../llm/base.js';
import { BaseLLMProvider } from '../llm/base.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing parseResume
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

// Capture the provider instance constructed by getLLMProvider() so each test
// can swap out its `complete` handler.
class StubClaudeProvider extends BaseLLMProvider {
  readonly name = 'claude';
  public handler: (messages: LLMMessage[], options?: LLMOptions) => Promise<LLMResponse> =
    async () => ({ content: '{}' });
  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    return this.handler(messages, options);
  }
}

const stubProvider = new StubClaudeProvider();

vi.mock('../llm/claude.js', () => ({
  ClaudeProvider: vi.fn().mockImplementation(() => stubProvider),
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

  it('uses 8192-token budget on the first attempt and does not retry when output is valid', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => ({
      content: VALID_RESUME_JSON,
    }));
    stubProvider.handler = handler;

    const { output } = await parseResume('John Doe\nReact developer\n5 years experience');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(8192);
    expect(output.fullName).toBe('Jane Doe');
  });

  it('retries with 16384-token budget when the 8192 attempt returns truncated/invalid JSON', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => {
      // First call (8192) returns truncated JSON; second call (16384) succeeds.
      if (options?.maxTokens === 8192) {
        return { content: '{"fullName": "Jane Doe", "primarySki' }; // truncated
      }
      return { content: VALID_RESUME_JSON };
    });
    stubProvider.handler = handler;

    const { output } = await parseResume('resume text');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(8192);
    expect(handler.mock.calls[1][1]?.maxTokens).toBe(16384);
    expect(output.fullName).toBe('Jane Doe');
  });

  it('throws with the original validation error when both 8192 and 16384 attempts fail', async () => {
    const handler = vi.fn(async (): Promise<LLMResponse> => ({
      content: 'not json at all',
    }));
    stubProvider.handler = handler;

    await expect(parseResume('resume text')).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(8192);
    expect(handler.mock.calls[1][1]?.maxTokens).toBe(16384);
  });

  it('resume parser system prompt contains stack-abbreviation expansion rules for all four acronyms', async () => {
    let capturedSystemContent = '';
    stubProvider.handler = async (messages) => {
      capturedSystemContent = messages.find((m) => m.role === 'system')?.content ?? '';
      return { content: VALID_RESUME_JSON };
    };

    await parseResume('John Doe MERN stack developer');

    // Each of the four abbreviations must be named
    expect(capturedSystemContent).toContain('MERN');
    expect(capturedSystemContent).toContain('MEAN');
    expect(capturedSystemContent).toContain('PERN');
    expect(capturedSystemContent).toContain('LAMP');

    // Each component technology must be named
    expect(capturedSystemContent).toMatch(/mongodb/i);
    expect(capturedSystemContent).toMatch(/express/i);
    expect(capturedSystemContent).toMatch(/react/i);
    expect(capturedSystemContent).toMatch(/node/i);
    expect(capturedSystemContent).toMatch(/angular/i);
    expect(capturedSystemContent).toMatch(/postgresql/i);
    expect(capturedSystemContent).toMatch(/linux/i);
    expect(capturedSystemContent).toMatch(/apache/i);
    expect(capturedSystemContent).toMatch(/mysql/i);
    expect(capturedSystemContent).toMatch(/php/i);
  });
});

// ---------------------------------------------------------------------------
// ticket #281 — synonyms must be requested by the prompt and survive parsing
// ---------------------------------------------------------------------------

const RESUME_JSON_WITH_SYNONYMS = JSON.stringify({
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
  skillSynonyms: { react: ['reactjs', 'react.js'], typescript: ['ts'] },
});

describe('parseResume() — skillSynonyms (#281)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the skillSynonyms map returned by the LLM end-to-end', async () => {
    stubProvider.handler = async () => ({ content: RESUME_JSON_WITH_SYNONYMS });

    const { output } = await parseResume('resume text');

    expect(output.skillSynonyms).toEqual({
      react: ['reactjs', 'react.js'],
      typescript: ['ts'],
    });
  });

  it('resume parser system prompt instructs the model to emit skillSynonyms', async () => {
    let capturedSystemContent = '';
    stubProvider.handler = async (messages) => {
      capturedSystemContent = messages.find((m) => m.role === 'system')?.content ?? '';
      return { content: RESUME_JSON_WITH_SYNONYMS };
    };

    await parseResume('resume text');

    expect(capturedSystemContent).toContain('skillSynonyms');
  });

  it('preserves skillSynonyms when the 16384-token retry path fires', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => {
      if (options?.maxTokens === 8192) {
        return { content: '{"fullName": "Jane Doe", "skillSyn' }; // truncated
      }
      return { content: RESUME_JSON_WITH_SYNONYMS };
    });
    stubProvider.handler = handler;

    const { output } = await parseResume('resume text');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(output.skillSynonyms).toEqual({
      react: ['reactjs', 'react.js'],
      typescript: ['ts'],
    });
  });
});

// ---------------------------------------------------------------------------
// ticket #396 — city / state / country as distinct attributes
// ---------------------------------------------------------------------------

function resumeJsonWithLocation(fields: Record<string, unknown>): string {
  return JSON.stringify({
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    primarySkills: ['react'],
    primarySkillYears: { react: 4 },
    totalExperience: 5,
    seniority: 'senior',
    ...fields,
  });
}

describe('parseResume() — city/state/country (#396)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps city, state and country as distinct attributes', async () => {
    stubProvider.handler = async () => ({
      content: resumeJsonWithLocation({ city: 'Bangalore', state: 'Karnataka', country: 'India' }),
    });

    const { output } = await parseResume('resume text');

    expect(output.city).toBe('Bangalore');
    expect(output.state).toBe('Karnataka');
    expect(output.country).toBe('India');
    // legacy location stays populated (= city) for unchanged search/matching
    expect(output.location).toBe('Bangalore');
  });

  it('does not fabricate state/country when only a city is present', async () => {
    stubProvider.handler = async () => ({
      content: resumeJsonWithLocation({ city: 'Mumbai' }),
    });

    const { output } = await parseResume('resume text');

    expect(output.city).toBe('Mumbai');
    expect(output.state ?? null).toBeNull();
    expect(output.country ?? null).toBeNull();
  });

  it('derives city from the legacy location field when the model only returns location', async () => {
    stubProvider.handler = async () => ({
      content: resumeJsonWithLocation({ location: 'Bangalore, India' }),
    });

    const { output } = await parseResume('resume text');

    // normalizeLocation strips the country, leaving the city
    expect(output.city).toBe('Bangalore');
    expect(output.location).toBe('Bangalore');
  });

  it('resume parser system prompt instructs the model to emit city, state and country', async () => {
    let capturedSystemContent = '';
    stubProvider.handler = async (messages) => {
      capturedSystemContent = messages.find((m) => m.role === 'system')?.content ?? '';
      return { content: resumeJsonWithLocation({ city: 'Bangalore' }) };
    };

    await parseResume('resume text');

    expect(capturedSystemContent).toContain('"city"');
    expect(capturedSystemContent).toContain('"state"');
    expect(capturedSystemContent).toContain('"country"');
  });
});
