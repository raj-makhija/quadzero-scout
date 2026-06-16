import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRerankCandidates, buildRequirementJd } from '../llmRerank.js';
import { FALLBACK_CANDIDATE_RERANKER_PROMPT } from '../llm/index.js';
import type { CandidateItem, RequirementItem } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    candidate_id: 'cand-1',
    user_id: 'user-1',
    full_name: 'Test Candidate',
    email: 'test@example.com',
    primary_skills: ['react', 'typescript'],
    primary_skill_years: { react: 5, typescript: 4 },
    secondary_skills: [],
    total_experience: 6,
    seniority: 'senior',
    availability: 'immediate',
    engagement_model: 'either',
    industries: [],
    roles: ['Frontend Engineer'],
    experience_bucket: '5-8',
    resume_s3_key: 'resumes/cand-1.pdf',
    headline: 'Senior Frontend Engineer',
    location: 'Mumbai',
    ...overrides,
  } as CandidateItem;
}

function makeParsedCriteria(locationOverride: string | null = 'Mumbai') {
  return {
    mustHaveSkills: ['react'],
    goodToHaveSkills: [],
    minExperience: 5,
    maxExperience: null,
    seniority: ['senior'],
    availability: [],
    location: locationOverride,
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
    skillSynonyms: null,
  };
}

function makeRequirement(overrides: Partial<RequirementItem> = {}): RequirementItem {
  return {
    requirement_id: 'req-1',
    recruiter_id: 'rec-1',
    client_name: 'Acme',
    client_name_lower: 'acme',
    engagement_model: 'full_time_regular',
    payroll: 'quadzero',
    jd_text: 'Senior React developer needed in Mumbai.',
    parsed_criteria: makeParsedCriteria(),
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    last_updated: '2026-01-01T00:00:00Z',
    ...overrides,
  } as RequirementItem;
}

// ---------------------------------------------------------------------------
// buildRerankCandidates
// ---------------------------------------------------------------------------

describe('buildRerankCandidates()', () => {
  it('includes expected_ctc in the profile when set', () => {
    const result = buildRerankCandidates([makeCandidate({ expected_ctc: 18 })]);
    expect(result[0].profile).toContain('Expected CTC: 18 LPA');
  });

  it('omits the CTC line entirely when expected_ctc is absent', () => {
    const c = makeCandidate();
    delete (c as Partial<CandidateItem>).expected_ctc;
    const result = buildRerankCandidates([c]);
    expect(result[0].profile).not.toMatch(/undefined|null/i);
    expect(result[0].profile).not.toContain('Expected CTC');
  });

  it('omits the location line without crashing when location is absent', () => {
    const c = makeCandidate();
    delete (c as Partial<CandidateItem>).location;
    const result = buildRerankCandidates([c]);
    expect(result[0].profile).not.toContain('Location');
    expect(result[0].profile).not.toMatch(/undefined|null/i);
  });

  it('still emits headline, experience, seniority, roles, and skills fields', () => {
    const result = buildRerankCandidates([makeCandidate()]);
    const p = result[0].profile;
    expect(p).toContain('Headline:');
    expect(p).toContain('Experience:');
    expect(p).toContain('Seniority:');
    expect(p).toContain('Location: Mumbai');
    expect(p).toContain('Roles:');
    expect(p).toContain('Skills:');
  });

  it('echoes candidate_id verbatim', () => {
    const result = buildRerankCandidates([makeCandidate({ candidate_id: 'xyz-999' })]);
    expect(result[0].candidate_id).toBe('xyz-999');
  });
});

// ---------------------------------------------------------------------------
// buildRequirementJd
// ---------------------------------------------------------------------------

describe('buildRequirementJd()', () => {
  it('includes budget_max_lpa when set on the requirement', () => {
    const result = buildRequirementJd(makeRequirement({ budget_max_lpa: 30 }));
    expect(result).toContain('30');
    expect(result).toContain('LPA');
  });

  it('includes parsed_criteria location in the output', () => {
    const result = buildRequirementJd(makeRequirement());
    expect(result).toContain('Mumbai');
  });

  it('omits budget line without emitting "undefined" when budget_max_lpa is absent', () => {
    const req = makeRequirement();
    delete (req as Partial<RequirementItem>).budget_max_lpa;
    const result = buildRequirementJd(req);
    expect(result).not.toMatch(/undefined|null/i);
    expect(result).not.toContain('Budget');
  });

  it('omits location line without emitting "undefined" when parsed_criteria.location is null', () => {
    const req = makeRequirement();
    req.parsed_criteria.location = null;
    const result = buildRequirementJd(req);
    expect(result).not.toMatch(/undefined|null/i);
    expect(result).not.toContain('Required Location');
  });

  it('returns only jd_text when no structured location/budget fields are present', () => {
    const req = makeRequirement();
    req.parsed_criteria.location = null;
    delete (req as Partial<RequirementItem>).budget_max_lpa;
    expect(buildRequirementJd(req)).toBe(req.jd_text);
  });
});

// ---------------------------------------------------------------------------
// FALLBACK_CANDIDATE_RERANKER_PROMPT — inspect for scoring guidance
// ---------------------------------------------------------------------------

describe('FALLBACK_CANDIDATE_RERANKER_PROMPT', () => {
  it('instructs the LLM to assign lower scores for location mismatch', () => {
    const p = FALLBACK_CANDIDATE_RERANKER_PROMPT.toLowerCase();
    expect(p).toContain('location');
    // Must contain some notion of penalising location mismatch
    expect(p).toMatch(/lower score|lower.*score|assign.*lower|penali/);
  });

  it('instructs the LLM to assign lower scores when expected CTC exceeds budget', () => {
    const p = FALLBACK_CANDIDATE_RERANKER_PROMPT.toLowerCase();
    expect(p).toMatch(/ctc|budget/);
    expect(p).toMatch(/lower score|lower.*score|assign.*lower|exceed/);
  });
});

// ---------------------------------------------------------------------------
// Ranking order integration: mocked rerankTopN — location and CTC preference
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

import type { LLMMessage, LLMOptions } from '../llm/base.js';
import type { LLMResponse } from '../llm/base.js';
import { BaseLLMProvider } from '../llm/base.js';

class StubProvider extends BaseLLMProvider {
  constructor(public readonly name: string) { super(); }
  public handler: (messages: LLMMessage[], opts?: LLMOptions) => Promise<LLMResponse> =
    async () => ({ content: '[]' });
  async complete(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse> {
    return this.handler(messages, opts);
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

import { rerankTopN, _clearPromptCache, type RerankCandidateInput } from '../llm/index.js';

beforeEach(() => {
  vi.clearAllMocks();
  _clearPromptCache();
  mockGetActivePrompt.mockResolvedValue(null);
});

describe('rerankTopN() — location and CTC ranking signal', () => {
  it('in-city candidate outranks an otherwise-equal out-of-city candidate', async () => {
    const inCityScore = 80;
    const outOfCityScore = 55;

    const candidates: RerankCandidateInput[] = [
      { candidate_id: 'out_of_city', profile: 'Location: Bangalore\nSkills: react\nExperience: 6 yrs' },
      { candidate_id: 'in_city',     profile: 'Location: Mumbai\nSkills: react\nExperience: 6 yrs' },
    ];

    geminiStub.handler = async () => ({
      content: JSON.stringify([
        { candidate_id: 'out_of_city', llmScore: outOfCityScore, rationale: 'Wrong city.' },
        { candidate_id: 'in_city',     llmScore: inCityScore,    rationale: 'Correct city.' },
      ]),
    });

    const result = await rerankTopN({ jobDescription: 'React role in Mumbai', candidates, topNHash: 'h1' });

    const scoreMap = Object.fromEntries(result.entries.map((e) => [e.candidate_id, e.llmScore]));
    expect(scoreMap['in_city']).toBeGreaterThan(scoreMap['out_of_city']);
  });

  it('within-budget candidate outranks an otherwise-equal over-budget candidate', async () => {
    const withinBudgetScore = 85;
    const overBudgetScore = 50;

    const candidates: RerankCandidateInput[] = [
      { candidate_id: 'over_budget',   profile: 'Expected CTC: 50 LPA\nSkills: react\nExperience: 6 yrs' },
      { candidate_id: 'within_budget', profile: 'Expected CTC: 20 LPA\nSkills: react\nExperience: 6 yrs' },
    ];

    geminiStub.handler = async () => ({
      content: JSON.stringify([
        { candidate_id: 'over_budget',   llmScore: overBudgetScore,   rationale: 'Too expensive.' },
        { candidate_id: 'within_budget', llmScore: withinBudgetScore, rationale: 'Within budget.' },
      ]),
    });

    const result = await rerankTopN({ jobDescription: 'React role, Budget: 25 LPA', candidates, topNHash: 'h2' });

    const scoreMap = Object.fromEntries(result.entries.map((e) => [e.candidate_id, e.llmScore]));
    expect(scoreMap['within_budget']).toBeGreaterThan(scoreMap['over_budget']);
  });
});
