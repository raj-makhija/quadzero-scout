import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMMessage, LLMOptions, LLMResponse } from '../llm/base.js';
import { BaseLLMProvider } from '../llm/base.js';

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
  getActivePrompt: vi.fn().mockResolvedValue(null),
}));

class StubProvider extends BaseLLMProvider {
  readonly name = 'gemini';
  public lastSystemPrompt = '';
  async complete(messages: LLMMessage[], _options?: LLMOptions): Promise<LLMResponse> {
    this.lastSystemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
    if (this.lastSystemPrompt.includes('resume parser')) {
      return {
        content: JSON.stringify({
          fullName: 'X',
          email: null,
          primarySkills: [],
          primarySkillYears: {},
          secondarySkills: [],
          totalExperience: 0,
          seniority: 'mid',
          roles: [],
          education: [],
          summary: '',
        }),
      };
    }
    return {
      content: JSON.stringify({
        mustHaveSkills: [],
        goodToHaveSkills: [],
        minExperience: null,
        maxExperience: null,
        seniority: [],
        availability: [],
        location: null,
        remote: false,
        industries: [],
        roles: [],
        rateRaw: null,
        rateUnit: null,
        rateLpa: null,
        clientName: null,
        endClient: null,
        engagementModel: null,
        payroll: null,
        budgetMinLpa: null,
        budgetMaxLpa: null,
        coreSkill: null,
        contractDurationMonths: null,
        paymentTermsDays: null,
        skillSynonyms: {},
      }),
    };
  }
}

const stubProvider = new StubProvider();

vi.mock('../llm/gemini.js', () => ({
  GeminiProvider: vi.fn().mockImplementation(() => stubProvider),
}));

import { parseResume, parseJobDescription } from '../llm/index.js';

const REQUIRED_EXPANSIONS = [
  { acronym: 'MERN', components: ['mongodb', 'expressjs', 'react', 'nodejs'] },
  { acronym: 'MEAN', components: ['mongodb', 'expressjs', 'angular', 'nodejs'] },
  { acronym: 'PERN', components: ['postgresql', 'expressjs', 'react', 'nodejs'] },
  { acronym: 'LAMP', components: ['linux', 'apache', 'mysql', 'php'] },
];

describe('Stack abbreviation expansion in parser prompts (issue #117)', () => {
  beforeEach(() => {
    stubProvider.lastSystemPrompt = '';
  });

  it('parseResume system prompt instructs the model to expand each known stack abbreviation', async () => {
    await parseResume('Jane Doe\nMERN stack developer\n5 years');
    const prompt = stubProvider.lastSystemPrompt;
    expect(prompt).toMatch(/stack abbreviation/i);
    for (const { acronym, components } of REQUIRED_EXPANSIONS) {
      expect(prompt).toContain(acronym);
      for (const component of components) {
        expect(prompt).toContain(component);
      }
    }
  });

  it('parseJobDescription system prompt instructs the model to expand each known stack abbreviation', async () => {
    await parseJobDescription('Looking for a MERN stack developer with 5+ years');
    const prompt = stubProvider.lastSystemPrompt;
    expect(prompt).toMatch(/stack abbreviation/i);
    for (const { acronym, components } of REQUIRED_EXPANSIONS) {
      expect(prompt).toContain(acronym);
      for (const component of components) {
        expect(prompt).toContain(component);
      }
    }
  });
});
