import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../lib/dynamodb.js', () => ({
  getCandidateById: vi.fn(),
  getAllActiveRequirements: vi.fn(),
  getShortlistsForCandidate: vi.fn().mockResolvedValue([]),
}));

import { handler } from '../candidate/matchRequirements.js';
import { getCandidateById, getAllActiveRequirements } from '../../lib/dynamodb.js';

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

function makeRequirement(coreSkill: string | null, id = 'req_1') {
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
      roles: [],
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
