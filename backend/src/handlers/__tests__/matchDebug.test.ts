import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../lib/dynamodb.js', () => ({
  getCandidateById: vi.fn(),
  getRequirementById: vi.fn(),
}));

import { handler } from '../candidate/matchDebug.js';
import { getCandidateById, getRequirementById } from '../../lib/dynamodb.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCandidate(primarySkills: string[]) {
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
    roles: ['Developer'],
    experience_bucket: '3-5',
    resume_s3_key: 'resumes/2024/01/test.pdf',
    created_at: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
  };
}

function makeRequirement(coreSkill: string | null) {
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
      roles: [],
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

  it('reports coreSkill failed and excludedBy coreSkill when candidate is missing one component', async () => {
    (getCandidateById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCandidate(['mongodb', 'react', 'nodejs']) // missing expressjs
    );
    (getRequirementById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRequirement('mern')
    );

    const response = await handler(makeEvent('cand_test', 'req_1'));
    const body = JSON.parse((response as { body: string }).body);

    expect(body.data.filters.coreSkill.passed).toBe(false);
    expect(body.data.excludedBy).toContain('coreSkill');
    expect(body.data.wouldBeExcluded).toBe(true);
  });

  it('reports coreSkill passed for non-stack coreSkill with matching candidate', async () => {
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
