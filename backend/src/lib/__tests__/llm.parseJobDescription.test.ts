import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMMessage, LLMOptions, LLMResponse } from '../llm/base.js';
import { BaseLLMProvider } from '../llm/base.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing parseJobDescription
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

  it('uses 2048-token budget on the first attempt and does not retry when output is valid', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => ({
      content: VALID_JD_JSON,
    }));
    stubProvider.handler = handler;

    const { output } = await parseJobDescription('Senior React developer, 5-9 years experience, Bangalore');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(2048);
    expect(output.mustHaveSkills).toContain('react');
  });

  it('retries with 4096-token budget when the 2048 attempt returns truncated/invalid JSON', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => {
      // First call (2048) returns truncated JSON; second call (4096) succeeds.
      if (options?.maxTokens === 2048) {
        return { content: '{"mustHaveSkills": ["react"], "goodToHave' }; // truncated
      }
      return { content: VALID_JD_JSON };
    });
    stubProvider.handler = handler;

    const { output } = await parseJobDescription('Complex JD with many skills');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(2048);
    expect(handler.mock.calls[1][1]?.maxTokens).toBe(4096);
    expect(output.mustHaveSkills).toContain('react');
  });

  it('retries with 4096-token budget when the 2048 attempt fails schema validation', async () => {
    const handler = vi.fn(async (_msgs: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> => {
      // First call returns valid JSON but missing required fields; second call succeeds.
      if (options?.maxTokens === 2048) {
        return { content: '{"mustHaveSkills": ["react"]}' }; // missing required fields
      }
      return { content: VALID_JD_JSON };
    });
    stubProvider.handler = handler;

    const { output } = await parseJobDescription('JD text');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(2048);
    expect(handler.mock.calls[1][1]?.maxTokens).toBe(4096);
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

  it('throws when both 2048 and 4096 attempts fail', async () => {
    const handler = vi.fn(async (): Promise<LLMResponse> => ({
      content: 'not json at all',
    }));
    stubProvider.handler = handler;

    await expect(parseJobDescription('JD text')).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]?.maxTokens).toBe(2048);
    expect(handler.mock.calls[1][1]?.maxTokens).toBe(4096);
  });
});
