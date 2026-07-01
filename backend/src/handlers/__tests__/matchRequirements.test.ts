import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../lib/dynamodb.js', () => ({
  getLlmRerank: vi.fn().mockResolvedValue(null),
  putLlmRerank: vi.fn().mockResolvedValue(undefined),
  deleteLlmRerank: vi.fn().mockResolvedValue(undefined),
  getCandidateById: vi.fn(),
  getAllActiveRequirements: vi.fn(),
  getShortlistsForCandidate: vi.fn().mockResolvedValue([]),
  getActivePricingConfig: vi.fn().mockResolvedValue({
    gstRatePct: 0.18,
    minContributionPerMonth: 30000,
    costOfCapitalPctAnnual: 0.12,
  }),
}));

import { handler } from '../candidate/matchRequirements.js';
import { getCandidateById, getAllActiveRequirements, getShortlistsForCandidate } from '../../lib/dynamodb.js';

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

function makeRequirement(coreSkill: string | null, id = 'req_1', roles: string[] = []) {
  return {
    requirement_id: id,
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

function makeEvent(candidateId: string): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify({ candidateId }),
    headers: {},
    isBase64Encoded: false,
    rawPath: '/candidate/match-requirements',
    rawQueryString: '',
    requestContext: {} as APIGatewayProxyEventV2['requestContext'],
    routeKey: 'POST /candidate/match-requirements',
    version: '2.0',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchRequirements handler — MERN stack coreSkill gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes a candidate with all four MERN components when coreSkill is "mern stack"', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['mongodb', 'expressjs', 'react', 'nodejs'])
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement('mern stack'),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].requirementId).toBe('req_1');
  });

  it('excludes a candidate missing one MERN component', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['mongodb', 'react', 'nodejs']) // missing expressjs
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement('mern stack'),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(0);
  });

  it('excludes a candidate with only 3 of 4 MERN components', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['mongodb', 'expressjs', 'react']) // missing nodejs
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement('mern'),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(0);
  });

  it('uses literal match for a non-stack coreSkill (no regression)', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['react', 'typescript'])
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement('react'),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(1);
  });

  it('skips coreSkill gate when coreSkill is null', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['python'])
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement(null),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(1);
  });
});

describe('matchRequirements handler — discipline gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes a tester candidate from a development requirement', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['java', 'selenium'], ['QA Engineer'])
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement(null, 'req_dev', ['Software Engineer']),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(0);
  });

  it('excludes a developer candidate from a testing requirement (symmetric)', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['java', 'spring'], ['Software Engineer'])
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement(null, 'req_test', ['QA Engineer']),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(0);
  });

  it('does not exclude a candidate with no roles', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['java'], [])
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement(null, 'req_dev', ['Software Engineer']),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(1);
  });

  it('does not exclude when requirement has no roles', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['selenium'], ['QA Engineer'])
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement(null, 'req_1', []),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(1);
  });

  it('does not exclude for a cross-category pair not in the matrix (data vs development)', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['python'], ['Data Scientist'])
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement(null, 'req_dev', ['Software Engineer']),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(1);
  });
});

describe('matchRequirements handler — not_suitable shortlist handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not set isShortlisted for a not_suitable entry — requirement appears in matches', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['react'])
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement('react', 'req_1'),
    ]);
    (getShortlistsForCandidate as ReturnType<typeof vi.fn>).mockResolvedValue([
      { requirement_id: 'req_1', candidate_id: 'cand_test', status: 'not_suitable', tagged_by: 'user_r', tagged_at: '2024-01-14T00:00:00Z' },
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].isShortlisted).toBe(false);
  });

  it('sets isShortlisted for a genuine shortlisted entry', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['react'])
    );
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRequirement('react', 'req_1'),
    ]);
    (getShortlistsForCandidate as ReturnType<typeof vi.fn>).mockResolvedValue([
      { requirement_id: 'req_1', candidate_id: 'cand_test', status: 'shortlisted', tagged_by: 'user_r', tagged_at: '2024-01-15T00:00:00Z' },
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].isShortlisted).toBe(true);
  });
});

describe('matchRequirements handler — budget fit uses Max Resource Budget (#529)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Build a requirement with a real budget/engagement so budgetFit is exercised. */
  function budgetRequirement(overrides: Record<string, unknown>) {
    return {
      ...makeRequirement('react', 'req_budget'),
      budget_max_lpa: 20,
      engagement_model: 'full_time_contract',
      payment_terms_days: 30,
      is_rate_gst_inclusive: false,
      ...overrides,
    };
  }

  /** Candidate that clears the coreSkill gate and is engagement-compatible. */
  function budgetCandidate(expectedCtc: number | null, engagement = 'contract') {
    return {
      ...makeCandidate(['react']),
      expected_ctc: expectedCtc,
      engagement_model: engagement,
    };
  }

  // Item 1: contract requirement compares against maxResourceBudgetLpa, not budget × 0.85
  it('marks a contract candidate between the resource ceiling and the old 0.85 proxy as budgetFit=false', async () => {
    // budget 20, contract → resource ceiling ≈ 16.2. Old proxy 20 × 0.85 = 17.
    // CTC 16.5 sits between: old proxy → true, corrected ceiling → false.
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(budgetCandidate(16.5));
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([budgetRequirement({})]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].matchDetails.budgetFit).toBe(false);
    // Display field stays the raw billing budget, not the ceiling.
    expect(body.data.matches[0].budgetMaxLpa).toBe(20);
  });

  // Item 2: full_time_regular keeps the raw billing budget as the ceiling
  it('treats a full_time_regular candidate at exactly the billing budget as budgetFit=true', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(budgetCandidate(30, 'full_time'));
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      budgetRequirement({ budget_max_lpa: 30, engagement_model: 'full_time_regular' }),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].matchDetails.budgetFit).toBe(true);
  });

  // Item 3: GST contrast — identical model/budget/CTC, only the GST flag differs → budgetFit flips
  it('flips budgetFit for identical CTC when only is_rate_gst_inclusive changes', async () => {
    // budget 20, contract, CTC 15. GST-exclusive ceiling ≈ 16.2 (fits);
    // GST-inclusive ceiling ≈ 13.2 (does not fit).
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(budgetCandidate(15));

    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      budgetRequirement({ is_rate_gst_inclusive: false }),
    ]);
    const exclBody = JSON.parse(
      (await handler(makeEvent('cand_test')) as { body: string }).body
    );

    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      budgetRequirement({ is_rate_gst_inclusive: true }),
    ]);
    const inclBody = JSON.parse(
      (await handler(makeEvent('cand_test')) as { body: string }).body
    );

    expect(exclBody.data.matches[0].matchDetails.budgetFit).toBe(true);
    expect(inclBody.data.matches[0].matchDetails.budgetFit).toBe(false);
  });

  // Item 5: no budget set → budgetFit stays true for all candidates
  it('returns budgetFit=true when the requirement has no budget', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(budgetCandidate(999));
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      budgetRequirement({ budget_max_lpa: null }),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches[0].matchDetails.budgetFit).toBe(true);
  });

  // Edge: budget too low to cover the minimum margin → ceiling undefined → sentinel 0 → budgetFit=false
  it('returns budgetFit=false when the budget is too low to cover the minimum margin', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(budgetCandidate(10));
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([
      budgetRequirement({ budget_max_lpa: 2 }),
    ]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches[0].matchDetails.budgetFit).toBe(false);
  });

  // Edge: null CTC → budgetFit stays true regardless of the ceiling
  it('returns budgetFit=true when the candidate has no expected CTC', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(budgetCandidate(null));
    (getAllActiveRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([budgetRequirement({})]);

    const response = await handler(makeEvent('cand_test'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.matches[0].matchDetails.budgetFit).toBe(true);
  });
});
