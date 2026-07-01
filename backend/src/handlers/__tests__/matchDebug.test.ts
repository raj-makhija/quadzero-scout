import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../lib/dynamodb.js', () => ({
  getLlmRerank: vi.fn().mockResolvedValue(null),
  putLlmRerank: vi.fn().mockResolvedValue(undefined),
  deleteLlmRerank: vi.fn().mockResolvedValue(undefined),
  getCandidateById: vi.fn(),
  getRequirementById: vi.fn(),
  getActivePricingConfig: vi.fn().mockResolvedValue({
    gstRatePct: 0.18,
    minContributionPerMonth: 30000,
    costOfCapitalPctAnnual: 0.12,
  }),
}));

vi.mock('../../lib/llm/index.js', () => ({
  rerankTopN: vi.fn(),
}));

vi.mock('../../lib/matchScoring.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/matchScoring.js')>();
  return {
    ...actual,
    calculateMatchScore: vi.fn().mockImplementation(actual.calculateMatchScore),
  };
});

import { handler } from '../candidate/matchDebug.js';
import { getCandidateById, getRequirementById } from '../../lib/dynamodb.js';
import { rerankTopN } from '../../lib/llm/index.js';
import { calculateMatchScore } from '../../lib/matchScoring.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCandidate(primarySkills: string[], roles = ['Developer']) {
  return {
    candidate_id: 'cand_test',
    user_id: 'user_1',
    full_name: 'Test Candidate',
    email: 'test@example.com',
    primary_skills: primarySkills,
    primary_skill_years: {},
    secondary_skills: [],
    total_experience: 5,
    seniority: 'senior',
    availability: 'immediate',
    industries: [],
    roles,
    experience_bucket: '3-5',
    resume_s3_key: 'resumes/2024/01/test.pdf',
    created_at: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
  };
}

function makeRequirement(coreSkill: string | null, roles: string[] = []) {
  return {
    requirement_id: 'req_1',
    client_name: 'TechCorp',
    end_client: null,
    job_title: 'Developer',
    engagement_model: null,
    payroll: null,
    budget_min_lpa: null,
    budget_max_lpa: null,
    created_at: '2024-01-01T00:00:00Z',
    parsed_criteria: {
      coreSkill,
      mustHaveSkills: [],
      goodToHaveSkills: [],
      location: null,
      minExperience: null,
      maxExperience: null,
      seniority: [],
      availability: [],
      engagementModel: null,
      skillSynonyms: null,
      roles,
    },
  };
}

function makeEvent(candidateId: string, requirementId: string): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify({ candidateId, requirementId }),
    headers: {},
    isBase64Encoded: false,
    rawPath: '/candidate/match-debug',
    rawQueryString: '',
    requestContext: {} as APIGatewayProxyEventV2['requestContext'],
    routeKey: 'POST /candidate/match-debug',
    version: '2.0',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchDebug handler — MERN stack coreSkill filter reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports coreSkill passed and no exclusion for a full MERN-component candidate', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['mongodb', 'expressjs', 'react', 'nodejs'])
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement('mern stack')
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.coreSkill.passed).toBe(true);
    expect(body.data.excludedBy).not.toContain('coreSkill');
    expect(body.data.wouldBeExcluded).toBe(false);
  });

  it('reports coreSkill failed but surfaces for review (not excluded) when coreSkill is the only miss (#418)', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['mongodb', 'react', 'nodejs']) // missing expressjs
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement('mern')
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    // coreSkill is still reported as failed in the filter breakdown...
    expect(body.data.filters.coreSkill.passed).toBe(false);
    expect(body.data.excludedBy).toContain('coreSkill');
    // ...but because it is the ONLY failing gate and the score clears the floor,
    // the recall safety net surfaces it for review rather than excluding it (#418).
    expect(body.data.coreSkillUnconfirmed).toBe(true);
    expect(body.data.wouldBeExcluded).toBe(false);
    expect(body.data.matchDetails.coreSkillUnconfirmed).toBe(true);
  });

  it('reports coreSkill passed with exact match detail for non-stack coreSkill with matching candidate', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['react', 'typescript'])
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement('react')
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.coreSkill.passed).toBe(true);
    expect(body.data.excludedBy).not.toContain('coreSkill');
    expect(body.data.filters.coreSkill.detail).toContain('exact match');
  });

  it('skips coreSkill filter when coreSkill is null', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['python'])
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement(null)
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.coreSkill.passed).toBe(true);
    expect(body.data.excludedBy).not.toContain('coreSkill');
  });
});

describe('matchDebug handler — role-qualified compound coreSkill filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes coreSkill filter for candidate with "aws" when coreSkill is "AWS Architect"', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['aws', 'terraform', 'python'])
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement('AWS Architect')
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.coreSkill.passed).toBe(true);
    expect(body.data.excludedBy).not.toContain('coreSkill');
    expect(body.data.wouldBeExcluded).toBe(false);
    expect(body.data.filters.coreSkill.detail).toContain('aws');
  });

  it('fails coreSkill filter for candidate with no AWS skills when coreSkill is "AWS Architect"', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['react', 'nodejs', 'python'])
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement('AWS Architect')
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.coreSkill.passed).toBe(false);
    expect(body.data.excludedBy).toContain('coreSkill');
    // coreSkill-only miss above the floor → surfaced for review, not excluded (#418).
    expect(body.data.coreSkillUnconfirmed).toBe(true);
    expect(body.data.wouldBeExcluded).toBe(false);
  });

  it('keeps hard exclusion (no review) when coreSkill miss coincides with a discipline failure (#418)', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['react', 'nodejs', 'python'], ['QA Engineer'])
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement('AWS Architect', ['Software Engineer'])
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    // Two failing gates (coreSkill + discipline) → no recall benefit, stays excluded.
    expect(body.data.excludedBy).toContain('coreSkill');
    expect(body.data.excludedBy).toContain('discipline');
    expect(body.data.coreSkillUnconfirmed).toBe(false);
    expect(body.data.wouldBeExcluded).toBe(true);
  });
});

describe('matchDebug handler — budgetFit uses Max Resource Budget (#529)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function budgetRequirement(overrides: Record<string, unknown>) {
    return {
      ...makeRequirement('react'),
      budget_max_lpa: 20,
      engagement_model: 'full_time_contract',
      payment_terms_days: 30,
      is_rate_gst_inclusive: false,
      ...overrides,
    };
  }

  function budgetCandidate(expectedCtc: number, engagement = 'contract') {
    return { ...makeCandidate(['react']), expected_ctc: expectedCtc, engagement_model: engagement };
  }

  // Item 4: debug endpoint's budgetFit reflects the corrected ceiling on a non-null budget.
  it('reports checks.budgetFit.passed=false for a contract CTC that only the old 0.85 proxy would have passed', async () => {
    // budget 20, contract → resource ceiling ≈ 16.2. Old proxy 20 × 0.85 = 17.
    // CTC 16.5 → old proxy would pass, corrected ceiling fails.
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(budgetCandidate(16.5));
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(budgetRequirement({}));

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.budgetFit.passed).toBe(false);
    // The raw billing budget is still reported for display.
    expect(body.data.requirement.budgetMaxLpa).toBe(20);
  });

  it('reports checks.budgetFit.passed=true for the same CTC under full_time_regular (raw billing budget ceiling)', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(budgetCandidate(16.5, 'full_time'));
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      budgetRequirement({ engagement_model: 'full_time_regular' })
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.budgetFit.passed).toBe(true);
  });
});

describe('matchDebug handler — discipline filter reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports discipline exclusion and wouldBeExcluded=true when tester meets development requirement', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['java', 'selenium'], ['QA Engineer'])
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement(null, ['Software Engineer'])
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.discipline.passed).toBe(false);
    expect(body.data.excludedBy).toContain('discipline');
    expect(body.data.wouldBeExcluded).toBe(true);
  });

  it('does not report discipline exclusion when candidate has no roles', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['java'], [])
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement(null, ['Software Engineer'])
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.discipline.passed).toBe(true);
    expect(body.data.excludedBy).not.toContain('discipline');
  });

  it('does not report discipline exclusion for a pair not in the matrix (data vs development)', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['python'], ['Data Scientist'])
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement(null, ['Software Engineer'])
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.discipline.passed).toBe(true);
    expect(body.data.excludedBy).not.toContain('discipline');
  });
});

// ---------------------------------------------------------------------------
// Helpers shared by the AI scoring tests
// ---------------------------------------------------------------------------

const mockMatchDetails = {
  mustHaveMatched: [] as string[],
  mustHaveFuzzy: [] as string[],
  mustHaveSecondary: [] as string[],
  mustHaveRelated: [] as string[],
  mustHaveMissing: [] as string[],
  goodToHaveMatched: [] as string[],
  goodToHaveFuzzy: [] as string[],
  goodToHaveRelated: [] as string[],
  experienceMatch: 'full' as const,
  seniorityMatch: true,
  ctcMatch: true,
  locationMatch: 'full' as const,
  availabilityMatch: 'full' as const,
  roleMatch: 'full' as const,
};

function makeRequirementWithJd(jdText: string) {
  return {
    requirement_id: 'req_jd',
    client_name: 'TechCorp',
    end_client: null,
    job_title: 'Developer',
    engagement_model: null,
    payroll: null,
    budget_min_lpa: null,
    budget_max_lpa: null,
    jd_text: jdText,
    created_at: '2024-01-01T00:00:00Z',
    parsed_criteria: {
      coreSkill: null,
      mustHaveSkills: [],
      goodToHaveSkills: [],
      location: null,
      minExperience: null,
      maxExperience: null,
      seniority: [],
      availability: [],
      engagementModel: null,
      skillSynonyms: null,
      roles: [],
    },
  };
}

describe('matchDebug handler — AI scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset rerankTopN to return a valid result by default
    (rerankTopN as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [{ candidate_id: 'cand_test', llmScore: 82, rationale: 'Strong React background.' }],
      model: 'claude-sonnet-4-6',
      promptVersion: 1,
      topNHash: 'matchdebug',
    });
    // Reset calculateMatchScore to call the real implementation by default
    vi.mocked(calculateMatchScore).mockRestore?.();
  });

  it('fires AI scoring and includes aiScore/aiRationale when score > 50 and jd_text is present', async () => {
    vi.mocked(calculateMatchScore).mockReturnValueOnce({ score: 75, details: mockMatchDetails });
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCandidate(['react']));
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(makeRequirementWithJd('React developer needed'));

    const response = await handler(makeEvent('cand_test', 'req_jd'));
    const body = JSON.parse((response as { body: string }).body);

    expect(rerankTopN).toHaveBeenCalledOnce();
    expect(body.data.aiScore).toBe(82);
    expect(body.data.aiRationale).toBe('Strong React background.');
  });

  it('does NOT fire AI scoring when score is exactly 50', async () => {
    vi.mocked(calculateMatchScore).mockReturnValueOnce({ score: 50, details: mockMatchDetails });
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCandidate(['java']));
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(makeRequirementWithJd('Java developer needed'));

    const response = await handler(makeEvent('cand_test', 'req_jd'));
    const body = JSON.parse((response as { body: string }).body);

    expect(rerankTopN).not.toHaveBeenCalled();
    expect(body.data.aiScore).toBeUndefined();
    expect(body.data.aiRationale).toBeUndefined();
  });

  it('does NOT fire AI scoring when score is below 50', async () => {
    vi.mocked(calculateMatchScore).mockReturnValueOnce({ score: 30, details: mockMatchDetails });
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCandidate(['java']));
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(makeRequirementWithJd('React developer needed'));

    const response = await handler(makeEvent('cand_test', 'req_jd'));
    const body = JSON.parse((response as { body: string }).body);

    expect(rerankTopN).not.toHaveBeenCalled();
    expect(body.data.aiScore).toBeUndefined();
  });

  it('does NOT fire AI scoring when score > 50 but jd_text is empty', async () => {
    vi.mocked(calculateMatchScore).mockReturnValueOnce({ score: 75, details: mockMatchDetails });
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCandidate(['react']));
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(makeRequirementWithJd(''));

    const response = await handler(makeEvent('cand_test', 'req_jd'));
    const body = JSON.parse((response as { body: string }).body);

    expect(rerankTopN).not.toHaveBeenCalled();
    expect(body.data.aiScore).toBeUndefined();
  });

  it('returns HTTP 200 with deterministic score and no AI fields when AI call throws', async () => {
    vi.mocked(calculateMatchScore).mockReturnValueOnce({ score: 75, details: mockMatchDetails });
    (rerankTopN as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM timeout'));
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCandidate(['react']));
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(makeRequirementWithJd('React developer needed'));

    const response = await handler(makeEvent('cand_test', 'req_jd'));
    const body = JSON.parse((response as { body: string }).body);

    expect((response as { statusCode: number }).statusCode).toBe(200);
    expect(body.data.score).toBe(75);
    expect(body.data.aiScore).toBeUndefined();
    expect(body.data.aiRationale).toBeUndefined();
  });

  it('returns HTTP 200 with no AI fields when AI call returns empty entries (rerankTopN throws)', async () => {
    vi.mocked(calculateMatchScore).mockReturnValueOnce({ score: 75, details: mockMatchDetails });
    (rerankTopN as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Candidate re-rank LLM returned no usable entries')
    );
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCandidate(['react']));
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(makeRequirementWithJd('React developer needed'));

    const response = await handler(makeEvent('cand_test', 'req_jd'));
    const body = JSON.parse((response as { body: string }).body);

    expect((response as { statusCode: number }).statusCode).toBe(200);
    expect(body.data.score).toBe(75);
    expect(body.data.aiScore).toBeUndefined();
  });

  it('passes the requirement jd_text and candidate profile to rerankTopN', async () => {
    vi.mocked(calculateMatchScore).mockReturnValueOnce({ score: 75, details: mockMatchDetails });
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCandidate(['react', 'typescript']));
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(makeRequirementWithJd('Senior React TypeScript developer'));

    await handler(makeEvent('cand_test', 'req_jd'));

    expect(rerankTopN).toHaveBeenCalledOnce();
    const callArg = (rerankTopN as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.jobDescription).toBe('Senior React TypeScript developer');
    expect(callArg.candidates).toHaveLength(1);
    expect(callArg.candidates[0].candidate_id).toBe('cand_test');
  });
});
