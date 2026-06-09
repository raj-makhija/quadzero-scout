import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMMessage, LLMOptions, LLMResponse } from '../llm/base.js';
import { BaseLLMProvider } from '../llm/base.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing parseJobDescription
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
import { parseJobDescription } from '../llm/index.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VALID_JD_JSON = JSON.stringify({
  mustHaveSkills: ['react', 'typescript'],
  goodToHaveSkills: ['aws'],
  minExperience: 5,
  maxExperience: 9,
  seniority: ['senior'],
  availability: [],
  location: 'Bangalore',
  remote: false,
  industries: [],
  roles: ['Frontend Engineer'],
  rateRaw: null,
  rateUnit: null,
  rateLpa: null,
  clientName: null,
  endClient: null,
  engagementModel: null,
  payroll: null,
  budgetMinLpa: null,
  budgetMaxLpa: null,
  coreSkill: 'react',
  contractDurationMonths: null,
  paymentTermsDays: null,
  skillSynonyms: { react: ['reactjs', 'react.js'], typescript: ['ts'] },
});

// ---------------------------------------------------------------------------
// Tests for parseJobDescription cost-control retry behavior
// ---------------------------------------------------------------------------

describe('parseJobDescription() — token-budget retry behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses 8192-token budget on the first attempt and does not retry when output is valid', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => ({
      content: VALID_JD_JSON,
    }));
    stubProvider.handler = handler;

    const { output } = await parseJobDescription('Senior React developer, 5-9 years experience, Bangalore');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(8192);
    expect(output.mustHaveSkills).toContain('react');
  });

  it('retries with 16384-token budget when the 8192 attempt returns truncated/invalid JSON', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => {
      if (options?.maxTokens === 8192) {
        return { content: '{"mustHaveSkills": ["react"], "goodToHave' }; // truncated
      }
      return { content: VALID_JD_JSON };
    });
    stubProvider.handler = handler;

    const { output } = await parseJobDescription('Complex JD with many skills');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(8192);
    expect(handler.mock.calls[1][1]?.maxTokens).toBe(16384);
    expect(output.mustHaveSkills).toContain('react');
  });

  it('retries with 16384-token budget when the 8192 attempt fails schema validation', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => {
      if (options?.maxTokens === 8192) {
        return { content: '{"mustHaveSkills": ["react"]}' }; // missing required fields
      }
      return { content: VALID_JD_JSON };
    });
    stubProvider.handler = handler;

    const { output } = await parseJobDescription('JD text');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(8192);
    expect(handler.mock.calls[1][1]?.maxTokens).toBe(16384);
    expect(output.location).toBe('Bangalore');
  });

  it('treats a single budget value as budgetMaxLpa (not min)', async () => {
    const singleBudgetJson = JSON.stringify({
      mustHaveSkills: ['java'],
      goodToHaveSkills: [],
      minExperience: 3,
      maxExperience: null,
      seniority: ['mid'],
      availability: [],
      location: null,
      remote: false,
      industries: [],
      roles: ['Java Developer'],
      rateRaw: null,
      rateUnit: null,
      rateLpa: null,
      clientName: null,
      endClient: null,
      engagementModel: null,
      payroll: null,
      budgetMinLpa: 20,
      budgetMaxLpa: null,
      coreSkill: 'java',
      contractDurationMonths: null,
      paymentTermsDays: null,
      skillSynonyms: { java: ['j2ee'] },
    });
    stubProvider.handler = async () => ({ content: singleBudgetJson });

    const { output } = await parseJobDescription('Java developer, budget 20 LPA');

    expect(output.budgetMaxLpa).toBe(20);
    expect(output.budgetMinLpa).toBeNull();
  });

  it('keeps both budget values when range is provided', async () => {
    const rangeBudgetJson = JSON.stringify({
      mustHaveSkills: ['java'],
      goodToHaveSkills: [],
      minExperience: 3,
      maxExperience: null,
      seniority: ['mid'],
      availability: [],
      location: null,
      remote: false,
      industries: [],
      roles: ['Java Developer'],
      rateRaw: null,
      rateUnit: null,
      rateLpa: null,
      clientName: null,
      endClient: null,
      engagementModel: null,
      payroll: null,
      budgetMinLpa: 15,
      budgetMaxLpa: 25,
      coreSkill: 'java',
      contractDurationMonths: null,
      paymentTermsDays: null,
      skillSynonyms: { java: ['j2ee'] },
    });
    stubProvider.handler = async () => ({ content: rangeBudgetJson });

    const { output } = await parseJobDescription('Java developer, budget 15-25 LPA');

    expect(output.budgetMinLpa).toBe(15);
    expect(output.budgetMaxLpa).toBe(25);
  });

  it('throws when both 8192 and 16384 attempts fail', async () => {
    const handler = vi.fn(async (): Promise<LLMResponse> => ({
      content: 'not json at all',
    }));
    stubProvider.handler = handler;

    await expect(parseJobDescription('JD text')).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(8192);
    expect(handler.mock.calls[1][1]?.maxTokens).toBe(16384);
  });

  it('sanitizes Unicode en-dash, em-dash, smart quotes, and NBSP in the JD before sending to LLM', async () => {
    let capturedUserContent = '';
    stubProvider.handler = async (messages) => {
      capturedUserContent = messages.find((m) => m.role === 'user')?.content ?? '';
      return { content: VALID_JD_JSON };
    };

    await parseJobDescription('Shift: 06:00 AM \u2013 02:00 PM \u2014 note \u201Cremote\u201D \u2018ok\u2019\u00A0end');

    expect(capturedUserContent).not.toMatch(/[\u2013\u2014\u2018\u2019\u201C\u201D\u00A0]/);
    expect(capturedUserContent).toContain('06:00 AM - 02:00 PM');
    expect(capturedUserContent).toContain('"remote"');
    expect(capturedUserContent).toContain("'ok'");
  });

  it('JD parser system prompt contains stack-abbreviation expansion rules for all four acronyms', async () => {
    let capturedSystemContent = '';
    stubProvider.handler = async (messages) => {
      capturedSystemContent = messages.find((m) => m.role === 'system')?.content ?? '';
      return { content: VALID_JD_JSON };
    };

    await parseJobDescription('Senior MERN stack developer role');

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

describe('parseJobDescription() — skillSynonyms (#281)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the skillSynonyms map returned by the LLM end-to-end', async () => {
    stubProvider.handler = async () => ({ content: VALID_JD_JSON });

    const { output } = await parseJobDescription('Senior React developer');

    expect(output.skillSynonyms).toEqual({
      react: ['reactjs', 'react.js'],
      typescript: ['ts'],
    });
  });

  it('JD parser system prompt instructs the model to emit skillSynonyms', async () => {
    let capturedSystemContent = '';
    stubProvider.handler = async (messages) => {
      capturedSystemContent = messages.find((m) => m.role === 'system')?.content ?? '';
      return { content: VALID_JD_JSON };
    };

    await parseJobDescription('JD text');

    expect(capturedSystemContent).toContain('skillSynonyms');
  });

  it('preserves skillSynonyms when the 16384-token retry path fires', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => {
      if (options?.maxTokens === 8192) {
        return { content: '{"mustHaveSkills": ["react"], "skillSyn' }; // truncated
      }
      return { content: VALID_JD_JSON };
    });
    stubProvider.handler = handler;

    const { output } = await parseJobDescription('Complex JD');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(output.skillSynonyms).toEqual({
      react: ['reactjs', 'react.js'],
      typescript: ['ts'],
    });
  });
});
