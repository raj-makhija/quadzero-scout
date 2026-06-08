import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../lib/dynamodb.js', () => ({
  searchCandidates: vi.fn().mockResolvedValue({
    items: [
      {
        candidate_id: 'cand_1',
        user_id: 'user_1',
        full_name: 'Alice Smith',
        email: 'alice@example.com',
        location: 'Bangalore, India',
        primary_skills: ['react', 'nodejs', 'typescript'],
        primary_skill_years: { react: 4, nodejs: 3, typescript: 3 },
        secondary_skills: ['aws', 'docker'],
        total_experience: 6,
        seniority: 'senior',
        availability: 'immediate',
        industries: ['fintech'],
        roles: ['Full Stack Developer'],
        experience_bucket: '6-10',
        resume_s3_key: 'resumes/2024/01/abc.pdf',
        created_at: '2024-01-10T08:00:00Z',
        last_updated: '2024-01-15T10:30:00Z',
      },
      {
        candidate_id: 'cand_2',
        user_id: 'user_2',
        full_name: 'Bob Jones',
        email: 'bob@example.com',
        location: 'Mumbai, India',
        primary_skills: ['python', 'django'],
        primary_skill_years: { python: 2, django: 1 },
        secondary_skills: ['postgresql'],
        total_experience: 2,
        seniority: 'junior',
        availability: '2_weeks',
        industries: [],
        roles: ['Backend Developer'],
        experience_bucket: '0-2',
        resume_s3_key: 'resumes/2024/01/def.pdf',
        created_at: '2024-01-11T09:00:00Z',
        last_updated: '2024-01-14T15:20:00Z',
      },
    ],
    lastKey: undefined,
  }),
  getCandidateById: vi.fn(),
  saveSavedSearch: vi.fn().mockResolvedValue(undefined),
  getSavedSearches: vi.fn().mockResolvedValue([]),
  deleteSavedSearch: vi.fn().mockResolvedValue(undefined),
  getExperienceBucket: vi.fn((years: number) => {
    if (years <= 2) return '0-2';
    if (years <= 5) return '3-5';
    if (years <= 10) return '6-10';
    if (years <= 15) return '11-15';
    return '16+';
  }),
  getRecentProfiles: vi.fn().mockResolvedValue({
    items: [
      {
        candidate_id: 'cand_1',
        full_name: 'Alice Smith',
        primary_skills: ['react', 'nodejs'],
        total_experience: 6,
        seniority: 'senior',
        location: 'Bangalore, India',
        last_updated: '2026-03-17T10:00:00Z',
        created_at: '2026-03-10T08:00:00Z',
        roles: ['Full Stack Developer'],
      },
      {
        candidate_id: 'cand_2',
        full_name: 'Bob Jones',
        primary_skills: ['python'],
        total_experience: 2,
        seniority: 'junior',
        location: 'Mumbai, India',
        last_updated: '2026-03-16T15:00:00Z',
        created_at: '2026-03-11T09:00:00Z',
        roles: ['Backend Developer'],
      },
    ],
    lastKey: undefined,
  }),
  getTotalProfileCount: vi.fn().mockResolvedValue(0),
  getShortlistsForRequirement: vi.fn().mockResolvedValue([]),
  getPlacedCandidateIds: vi.fn().mockResolvedValue(new Set()),
  putAuditLog: vi.fn().mockResolvedValue(undefined),
  getMatchCache: vi.fn().mockResolvedValue(null),
  putMatchCache: vi.fn().mockResolvedValue(undefined),
  deleteMatchCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/llm/index.js', () => ({
  parseJobDescription: vi.fn().mockResolvedValue({
    output: {
      mustHaveSkills: ['react', 'nodejs'],
      goodToHaveSkills: ['typescript', 'aws'],
      minExperience: 3,
      maxExperience: null,
      seniority: ['senior', 'lead'],
      availability: [],
      location: null,
      remote: true,
      industries: [],
      roles: ['Full Stack Developer'],
    },
    confidence: 0.85,
    suggestions: ['Consider specifying location preference'],
  }),
}));

vi.mock('../../lib/s3.js', () => ({
  generateDownloadUrl: vi.fn().mockResolvedValue({
    url: 'https://s3.amazonaws.com/presigned-download',
    key: 'resumes/2024/01/uuid-resume.pdf',
    expiresIn: 300,
  }),
  extractFileNameFromKey: vi.fn().mockReturnValue('resume.pdf'),
}));

vi.mock('../../lib/skillNormalizer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/skillNormalizer.js')>();
  return actual;
});

vi.mock('../../lib/auth.js', () => ({
  withAuth: vi.fn((_roles: string[], handler: Function) => {
    return (event: Record<string, unknown>) => {
      event.auth = { userId: 'test-user', email: 'test@quadzero.com', role: 'recruiter', isInternal: true };
      return handler(event);
    };
  }),
  withOptionalAuth: vi.fn((handler: Function) => {
    return (event: Record<string, unknown>) => {
      event.auth = { userId: 'test-user', email: 'test@quadzero.com', role: 'recruiter', isInternal: true };
      return handler(event);
    };
  }),
}));

vi.mock('../../lib/lambdaInvoke.js', () => ({
  invokeLambdaAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/config.js', () => ({
  config: {
    lambda: {
      formatResumeWorkerName: '',
      notifyWorkerName: '',
    },
  },
}));

// Import handlers after mocks
import { handler as searchHandler, _clearSearchCache } from '../recruiter/search.js';
import { handler as parseJdHandler } from '../recruiter/parseJd.js';
import { handler as resumeUrlHandler } from '../recruiter/resumeUrl.js';
import { handler as originalResumeUrlHandler } from '../recruiter/originalResumeUrl.js';
import { handler as saveSearchHandler } from '../recruiter/saveSearch.js';
import { handler as getSearchesHandler } from '../recruiter/getSearches.js';
import { handler as deleteSearchHandler } from '../recruiter/deleteSearch.js';
import { handler as listRecentProfilesHandler } from '../recruiter/listRecentProfiles.js';
import { getCandidateById, getSavedSearches, getRecentProfiles, searchCandidates, getShortlistsForRequirement, getPlacedCandidateIds } from '../../lib/dynamodb.js';
import { parseJobDescription } from '../../lib/llm/index.js';
import { generateDownloadUrl } from '../../lib/s3.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: { method: 'POST', path: '/', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

function parseBody(result: { body?: string }) {
  return JSON.parse(result.body || '{}');
}

// ---------------------------------------------------------------------------
// POST /recruiter/parse-jd
// TC-PARSEJD-001 through TC-PARSEJD-012
// ---------------------------------------------------------------------------

describe('POST /recruiter/parse-jd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-PARSEJD-001
  it('parses standard job description', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        jobDescription: 'We are looking for a Senior Full Stack Developer with 5+ years of experience in React, Node.js, and TypeScript. Must have AWS experience. Nice to have Docker.',
        jobTitle: 'Senior Full Stack Developer',
      }),
    });
    const result = await parseJdHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.parsedCriteria).toBeDefined();
    expect(body.data.parsedCriteria.mustHaveSkills).toContain('react');
    expect(body.data.parsedCriteria.mustHaveSkills).toContain('nodejs');
    expect(body.data.confidence).toBeGreaterThan(0);
    expect(Array.isArray(body.data.suggestions)).toBe(true);
  });

  // TC-PARSEJD-006
  it('rejects JD under 3 characters', async () => {
    const event = makeEvent({
      body: JSON.stringify({ jobDescription: 'ab' }),
    });
    const result = await parseJdHandler(event);
    expect(result.statusCode).toBe(400);
  });

  // TC-PARSEJD-011
  it('returns LLM_PARSE_ERROR when LLM fails', async () => {
    vi.mocked(parseJobDescription).mockRejectedValueOnce(new Error('LLM failure'));

    const event = makeEvent({
      body: JSON.stringify({
        jobDescription: 'A'.repeat(100),
      }),
    });
    const result = await parseJdHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(422);
    expect(body.error.code).toBe('LLM_PARSE_ERROR');
  });

  it('rejects empty body', async () => {
    const event = makeEvent({ body: undefined });
    const result = await parseJdHandler(event);
    expect(result.statusCode).toBe(400);
  });

  it('rejects invalid JSON', async () => {
    const event = makeEvent({ body: '{bad' });
    const result = await parseJdHandler(event);
    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /recruiter/search
// TC-SEARCH-001 through TC-SEARCH-018
// ---------------------------------------------------------------------------

describe('POST /recruiter/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearSearchCache();
  });

  // TC-SEARCH-001
  it('returns candidates sorted by matchScore for must-have skills', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['react', 'nodejs'] },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.candidates)).toBe(true);
    expect(body.data.pagination).toBeDefined();
    expect(body.data.pagination.count).toBeGreaterThanOrEqual(0);

    // Verify candidates have match details
    if (body.data.candidates.length > 0) {
      const first = body.data.candidates[0];
      expect(first.matchScore).toBeDefined();
      expect(first.matchDetails).toBeDefined();
      expect(Array.isArray(first.matchDetails.mustHaveMatched)).toBe(true);
      expect(Array.isArray(first.matchDetails.mustHaveMissing)).toBe(true);
    }
  });

  // TC-SEARCH-003
  it('returns candidates with empty criteria', async () => {
    const event = makeEvent({
      body: JSON.stringify({ criteria: {} }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  // TC-SEARCH-014: candidates with 0 must-have match are filtered
  it('filters out candidates with zero must-have skill matches', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['react', 'nodejs'] },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    // Bob has python/django, not react/nodejs - should be filtered
    for (const candidate of body.data.candidates) {
      expect(candidate.matchDetails.mustHaveMatched.length).toBeGreaterThan(0);
    }
  });

  // TC-SEARCH-004
  it('sorts by matchScore descending by default', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['react'] },
        sortBy: 'matchScore',
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    if (body.data.candidates.length > 1) {
      for (let i = 1; i < body.data.candidates.length; i++) {
        expect(body.data.candidates[i - 1].matchScore)
          .toBeGreaterThanOrEqual(body.data.candidates[i].matchScore);
      }
    }
  });

  // TC-SEARCH-009
  it('rejects invalid pagination key', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        criteria: {},
        pagination: { lastEvaluatedKey: 'not-valid-base64!' },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error.message).toContain('Invalid pagination key');
  });

  // TC-SEARCH-015
  it('returns matchDetails structure for each candidate', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['react'], goodToHaveSkills: ['typescript'] },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    for (const c of body.data.candidates) {
      expect(c.matchDetails).toHaveProperty('mustHaveMatched');
      expect(c.matchDetails).toHaveProperty('mustHaveRelated');
      expect(c.matchDetails).toHaveProperty('mustHaveMissing');
      expect(c.matchDetails).toHaveProperty('goodToHaveMatched');
      expect(c.matchDetails).toHaveProperty('goodToHaveRelated');
      expect(c.matchDetails).toHaveProperty('experienceMatch');
      expect(c.matchDetails).toHaveProperty('seniorityMatch');
    }
  });

  // TC-SEARCH-016
  it('coreSkill filter excludes candidates who do not have the core skill', async () => {
    // Mock: cand_1 has ['react', 'nodejs', 'typescript'], cand_2 has ['python', 'django']
    // coreSkill = 'nodejs' → only cand_1 should be returned
    const event = makeEvent({
      body: JSON.stringify({
        criteria: {
          coreSkill: 'nodejs',
          mustHaveSkills: ['nodejs'],
        },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    // Only cand_1 has nodejs
    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.candidates[0].candidateId).toBe('cand_1');
  });

  // TC-SEARCH-017
  it('coreSkill filter is not applied when coreSkill is not specified', async () => {
    // Without coreSkill, both candidates should be evaluated normally
    const event = makeEvent({
      body: JSON.stringify({
        criteria: {
          mustHaveSkills: ['react'],
        },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    // cand_1 has react (passes threshold), cand_2 does not (fails threshold)
    expect(body.data.candidates.some((c: { candidateId: string }) => c.candidateId === 'cand_1')).toBe(true);
  });

  it('coreSkill filter expands MERN stack — includes candidate with all four components', async () => {
    (searchCandidates as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [
        {
          candidate_id: 'cand_mern',
          user_id: 'user_mern',
          full_name: 'MERN Dev',
          email: 'mern@example.com',
          location: 'Bangalore',
          primary_skills: ['mongodb', 'expressjs', 'react', 'nodejs'],
          primary_skill_years: { mongodb: 3, expressjs: 3, react: 4, nodejs: 4 },
          secondary_skills: [],
          total_experience: 4,
          seniority: 'mid',
          availability: 'immediate',
          industries: [],
          roles: [],
          experience_bucket: '3-5',
          resume_s3_key: 'resumes/mern.pdf',
          created_at: '2024-01-10T08:00:00Z',
          last_updated: '2024-01-15T10:30:00Z',
        },
      ],
      lastKey: undefined,
    });

    const event = makeEvent({
      body: JSON.stringify({
        criteria: {
          coreSkill: 'mern stack',
          mustHaveSkills: ['mongodb', 'expressjs', 'react', 'nodejs'],
        },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.candidates[0].candidateId).toBe('cand_mern');
  });

  it('coreSkill filter expands MERN stack — excludes candidate missing a component', async () => {
    (searchCandidates as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [
        {
          candidate_id: 'cand_partial',
          user_id: 'user_partial',
          full_name: 'Partial Dev',
          email: 'partial@example.com',
          location: 'Bangalore',
          primary_skills: ['mongodb', 'react', 'nodejs'],
          primary_skill_years: { mongodb: 3, react: 4, nodejs: 4 },
          secondary_skills: ['expressjs'],
          total_experience: 4,
          seniority: 'mid',
          availability: 'immediate',
          industries: [],
          roles: [],
          experience_bucket: '3-5',
          resume_s3_key: 'resumes/partial.pdf',
          created_at: '2024-01-10T08:00:00Z',
          last_updated: '2024-01-15T10:30:00Z',
        },
      ],
      lastKey: undefined,
    });

    const event = makeEvent({
      body: JSON.stringify({
        criteria: {
          coreSkill: 'MERN',
          mustHaveSkills: ['mongodb', 'expressjs', 'react', 'nodejs'],
          goodToHaveSkills: ['typescript'],
        },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.candidates).toHaveLength(0);
  });

  it('rejects empty body', async () => {
    const event = makeEvent({ body: undefined });
    const result = await searchHandler(event);
    expect(result.statusCode).toBe(400);
  });

  // TC-SEARCH-018: engagementModel filter
  it('accepts engagementModel in search criteria', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        criteria: { engagementModel: 'contract' },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    // Mock candidates have no engagement_model set (defaults to 'either'),
    // so they should pass the filter (either is compatible with any)
    expect(Array.isArray(body.data.candidates)).toBe(true);
  });

  // TC-SEARCH-019: engagementModel hard-filters incompatible candidates
  it('filters out candidates with incompatible engagement model', async () => {
    // Override mock to include candidates with specific engagement models
    const { searchCandidates } = await import('../../lib/dynamodb.js');
    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: [
        {
          candidate_id: 'cand_contract',
          user_id: 'user_c',
          full_name: 'Contract Carol',
          email: 'carol@example.com',
          primary_skills: ['react'],
          primary_skill_years: { react: 3 },
          secondary_skills: [],
          total_experience: 3,
          seniority: 'mid',
          availability: 'immediate',
          engagement_model: 'contract',
          industries: [],
          roles: [],
          experience_bucket: '3-5',
          resume_s3_key: 'resumes/carol.pdf',
          created_at: '2024-01-10T00:00:00Z',
          last_updated: '2024-01-15T00:00:00Z',
        },
        {
          candidate_id: 'cand_fulltime',
          user_id: 'user_f',
          full_name: 'Fulltime Frank',
          email: 'frank@example.com',
          primary_skills: ['react'],
          primary_skill_years: { react: 5 },
          secondary_skills: [],
          total_experience: 5,
          seniority: 'senior',
          availability: '1_month',
          engagement_model: 'full_time',
          industries: [],
          roles: [],
          experience_bucket: '3-5',
          resume_s3_key: 'resumes/frank.pdf',
          created_at: '2024-01-10T00:00:00Z',
          last_updated: '2024-01-14T00:00:00Z',
        },
      ],
      lastKey: undefined,
    });

    const event = makeEvent({
      body: JSON.stringify({
        // mustHaveSkills differentiates this cache key from TC-SEARCH-018 which also
        // uses engagementModel:'contract'; both mock candidates have 'react' so the
        // must-have filter doesn't affect which candidates pass -- engagement model does
        criteria: { engagementModel: 'contract', mustHaveSkills: ['react'] },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    // Frank (full_time) should be filtered out, Carol (contract) should remain
    const ids = body.data.candidates.map((c: { candidateId: string }) => c.candidateId);
    expect(ids).toContain('cand_contract');
    expect(ids).not.toContain('cand_fulltime');
  });

  // TC-SEARCH-CTC: over-budget candidates appear lower in sort order than in-budget candidates
  it('over-budget candidate ranks below otherwise-identical in-budget candidate', async () => {
    const { searchCandidates } = await import('../../lib/dynamodb.js');
    // mockReset clears any unconsumed one-time mocks left by prior tests (pre-existing cache issue)
    vi.mocked(searchCandidates).mockReset();
    const sharedBase = {
      user_id: 'user_x',
      primary_skills: ['react', 'nodejs'],
      primary_skill_years: { react: 4, nodejs: 3 },
      secondary_skills: [],
      total_experience: 6,
      seniority: 'senior',
      availability: 'immediate',
      engagement_model: 'either',
      industries: [],
      roles: [],
      experience_bucket: '6-10',
      resume_s3_key: 'resumes/x.pdf',
      created_at: '2024-01-10T00:00:00Z',
      last_updated: '2024-01-15T00:00:00Z',
    };
    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: [
        {
          ...sharedBase,
          candidate_id: 'cand_over_budget',
          full_name: 'Over Budget',
          email: 'over@example.com',
          expected_ctc: 60, // 2× the 30 LPA budget
        },
        {
          ...sharedBase,
          candidate_id: 'cand_in_budget',
          full_name: 'In Budget',
          email: 'in@example.com',
          expected_ctc: 20, // within budget
        },
      ],
      lastKey: undefined,
    });

    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['react', 'nodejs'], maxBudgetLpa: 30 },
        sortBy: 'matchScore',
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    const ranked = body.data.candidates.map((c: { candidateId: string }) => c.candidateId);
    // In-budget candidate should appear first (higher score)
    expect(ranked.indexOf('cand_in_budget')).toBeLessThan(ranked.indexOf('cand_over_budget'));
    // Verify over-budget candidate has a strictly lower matchScore
    const inBudgetScore = body.data.candidates.find((c: { candidateId: string }) => c.candidateId === 'cand_in_budget').matchScore;
    const overBudgetScore = body.data.candidates.find((c: { candidateId: string }) => c.candidateId === 'cand_over_budget').matchScore;
    expect(overBudgetScore).toBeLessThan(inBudgetScore);
  });

  // ---------------------------------------------------------------------------
  // Global ranking tests (ticket #122)
  // ---------------------------------------------------------------------------

  it('globally ranks candidates regardless of DynamoDB scan order — high scorer placed late appears first', async () => {
    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: [
        {
          candidate_id: 'cand_low_1',
          user_id: 'u1',
          full_name: 'Low Scorer 1',
          email: 'low1@example.com',
          primary_skills: ['react'],
          primary_skill_years: { react: 1 },
          secondary_skills: [],
          total_experience: 1,
          seniority: 'junior',
          availability: '2_weeks',
          industries: [],
          roles: [],
          experience_bucket: '0-2',
          resume_s3_key: 'r/low1.pdf',
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
        },
        {
          candidate_id: 'cand_low_2',
          user_id: 'u2',
          full_name: 'Low Scorer 2',
          email: 'low2@example.com',
          primary_skills: ['react'],
          primary_skill_years: { react: 1 },
          secondary_skills: [],
          total_experience: 1,
          seniority: 'junior',
          availability: '2_weeks',
          industries: [],
          roles: [],
          experience_bucket: '0-2',
          resume_s3_key: 'r/low2.pdf',
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
        },
        {
          candidate_id: 'cand_high_scorer',
          user_id: 'u3',
          full_name: 'High Scorer',
          email: 'high@example.com',
          primary_skills: ['react', 'nodejs', 'typescript'],
          primary_skill_years: { react: 5, nodejs: 5, typescript: 4 },
          secondary_skills: ['aws', 'docker'],
          total_experience: 8,
          seniority: 'senior',
          availability: 'immediate',
          industries: ['fintech'],
          roles: ['Full Stack Developer'],
          experience_bucket: '6-10',
          resume_s3_key: 'r/high.pdf',
          created_at: '2024-01-10T00:00:00Z',
          last_updated: '2024-01-15T00:00:00Z',
        },
      ],
      lastKey: undefined,
    });

    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['react', 'nodejs', 'typescript'] },
        sortBy: 'matchScore',
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.candidates[0].candidateId).toBe('cand_high_scorer');
  });

  it('in-memory cache serves offset-based pages without re-querying DynamoDB', async () => {
    const candidates = Array.from({ length: 5 }, (_, i) => ({
      candidate_id: `cand_cache_${i}`,
      user_id: `user_cache_${i}`,
      full_name: `Cache Candidate ${i}`,
      email: `cache${i}@example.com`,
      primary_skills: ['java', 'spring'],
      primary_skill_years: { java: 3 + i, spring: 2 + i },
      secondary_skills: [],
      total_experience: 3 + i,
      seniority: 'mid',
      availability: 'immediate',
      industries: [],
      roles: [],
      experience_bucket: '3-5',
      resume_s3_key: `r/cache${i}.pdf`,
      created_at: '2024-01-01T00:00:00Z',
      last_updated: `2024-01-${10 + i}T00:00:00Z`,
    }));

    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: candidates,
      lastKey: undefined,
    });

    const baseCriteria = { mustHaveSkills: ['java', 'spring'] };

    // Page 1
    const event1 = makeEvent({
      body: JSON.stringify({ criteria: baseCriteria, pagination: { limit: 2 } }),
    });
    const result1 = await searchHandler(event1);
    const body1 = parseBody(result1);

    expect(result1.statusCode).toBe(200);
    expect(body1.data.candidates).toHaveLength(2);
    expect(body1.data.totalMatches).toBe(5);
    expect(body1.data.pagination.hasMore).toBe(true);

    // Page 2 — use the returned pagination token
    const event2 = makeEvent({
      body: JSON.stringify({
        criteria: baseCriteria,
        pagination: { limit: 2, lastEvaluatedKey: body1.data.pagination.lastEvaluatedKey },
      }),
    });
    const result2 = await searchHandler(event2);
    const body2 = parseBody(result2);

    expect(result2.statusCode).toBe(200);
    expect(body2.data.candidates).toHaveLength(2);
    expect(body2.data.totalMatches).toBe(5);
    expect(body2.data.pagination.hasMore).toBe(true);

    // searchCandidates should have been called only once (cache served page 2)
    expect(vi.mocked(searchCandidates)).toHaveBeenCalledTimes(1);

    // No duplicates across pages
    const page1Ids = body1.data.candidates.map((c: { candidateId: string }) => c.candidateId);
    const page2Ids = body2.data.candidates.map((c: { candidateId: string }) => c.candidateId);
    const allIds = [...page1Ids, ...page2Ids];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('hasMore is false and totalMatches correct on the final page', async () => {
    const candidates = Array.from({ length: 3 }, (_, i) => ({
      candidate_id: `cand_final_${i}`,
      user_id: `user_final_${i}`,
      full_name: `Final Candidate ${i}`,
      email: `final${i}@example.com`,
      primary_skills: ['go', 'kubernetes'],
      primary_skill_years: { go: 3 + i, kubernetes: 2 + i },
      secondary_skills: [],
      total_experience: 3 + i,
      seniority: 'mid',
      availability: 'immediate',
      industries: [],
      roles: [],
      experience_bucket: '3-5',
      resume_s3_key: `r/final${i}.pdf`,
      created_at: '2024-01-01T00:00:00Z',
      last_updated: `2024-01-${10 + i}T00:00:00Z`,
    }));

    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: candidates,
      lastKey: undefined,
    });

    // Page 1 (limit 2 → hasMore should be true)
    const event1 = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['go', 'kubernetes'] },
        pagination: { limit: 2 },
      }),
    });
    const body1 = parseBody(await searchHandler(event1));
    expect(body1.data.pagination.hasMore).toBe(true);
    expect(body1.data.totalMatches).toBe(3);

    // Page 2 (1 remaining → hasMore should be false)
    const event2 = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['go', 'kubernetes'] },
        pagination: { limit: 2, lastEvaluatedKey: body1.data.pagination.lastEvaluatedKey },
      }),
    });
    const body2 = parseBody(await searchHandler(event2));
    expect(body2.data.candidates).toHaveLength(1);
    expect(body2.data.pagination.hasMore).toBe(false);
    expect(body2.data.totalMatches).toBe(3);
    expect(body2.data.pagination.lastEvaluatedKey).toBeUndefined();
  });

  it('returns empty candidates array when all candidates fall below threshold', async () => {
    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: [
        {
          candidate_id: 'cand_no_match',
          user_id: 'u_nm',
          full_name: 'No Match',
          email: 'nomatch@example.com',
          primary_skills: ['cobol'],
          primary_skill_years: { cobol: 20 },
          secondary_skills: [],
          total_experience: 20,
          seniority: 'senior',
          availability: 'immediate',
          industries: [],
          roles: [],
          experience_bucket: '16+',
          resume_s3_key: 'r/nm.pdf',
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
        },
      ],
      lastKey: undefined,
    });

    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['rust', 'wasm'] },
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.candidates).toHaveLength(0);
    expect(body.data.pagination.hasMore).toBe(false);
    expect(body.data.totalMatches).toBe(0);
  });

  it('sortBy=lastUpdated sorts globally by date, not matchScore', async () => {
    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: [
        {
          candidate_id: 'cand_old_high',
          user_id: 'u_oh',
          full_name: 'Old High Score',
          email: 'oldhigh@example.com',
          primary_skills: ['ruby', 'rails'],
          primary_skill_years: { ruby: 8, rails: 7 },
          secondary_skills: ['postgresql'],
          total_experience: 8,
          seniority: 'senior',
          availability: 'immediate',
          industries: [],
          roles: [],
          experience_bucket: '6-10',
          resume_s3_key: 'r/oh.pdf',
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
        },
        {
          candidate_id: 'cand_new_low',
          user_id: 'u_nl',
          full_name: 'New Low Score',
          email: 'newlow@example.com',
          primary_skills: ['ruby'],
          primary_skill_years: { ruby: 2 },
          secondary_skills: [],
          total_experience: 2,
          seniority: 'junior',
          availability: '1_month',
          industries: [],
          roles: [],
          experience_bucket: '0-2',
          resume_s3_key: 'r/nl.pdf',
          created_at: '2024-06-01T00:00:00Z',
          last_updated: '2024-06-01T00:00:00Z',
        },
      ],
      lastKey: undefined,
    });

    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['ruby'] },
        sortBy: 'lastUpdated',
      }),
    });
    const result = await searchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.candidates).toHaveLength(2);
    // cand_new_low has a more recent lastUpdated and should appear first
    expect(body.data.candidates[0].candidateId).toBe('cand_new_low');
    expect(body.data.candidates[1].candidateId).toBe('cand_old_high');
  });

  it('results remain globally sorted across pagination boundaries', async () => {
    const candidates = Array.from({ length: 4 }, (_, i) => ({
      candidate_id: `cand_sort_${i}`,
      user_id: `u_sort_${i}`,
      full_name: `Sort Candidate ${i}`,
      email: `sort${i}@example.com`,
      primary_skills: ['elixir', 'phoenix'],
      primary_skill_years: { elixir: 2 + i * 2, phoenix: 1 + i * 2 },
      secondary_skills: [],
      total_experience: 2 + i * 2,
      seniority: i >= 2 ? 'senior' : 'mid',
      availability: 'immediate',
      industries: [],
      roles: [],
      experience_bucket: i >= 2 ? '6-10' : '3-5',
      resume_s3_key: `r/sort${i}.pdf`,
      created_at: '2024-01-01T00:00:00Z',
      last_updated: `2024-01-${10 + i}T00:00:00Z`,
    }));

    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: candidates,
      lastKey: undefined,
    });

    // Page 1
    const event1 = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['elixir', 'phoenix'] },
        pagination: { limit: 2 },
        sortBy: 'matchScore',
      }),
    });
    const body1 = parseBody(await searchHandler(event1));

    // Page 2
    const event2 = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['elixir', 'phoenix'] },
        pagination: { limit: 2, lastEvaluatedKey: body1.data.pagination.lastEvaluatedKey },
        sortBy: 'matchScore',
      }),
    });
    const body2 = parseBody(await searchHandler(event2));

    // Lowest score on page 1 >= highest score on page 2
    const page1Scores = body1.data.candidates.map((c: { matchScore: number }) => c.matchScore);
    const page2Scores = body2.data.candidates.map((c: { matchScore: number }) => c.matchScore);
    expect(Math.min(...page1Scores)).toBeGreaterThanOrEqual(Math.max(...page2Scores));
  });

  it('returns fresh shortlist status on cache hit when requirementId is provided', async () => {
    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: [
        {
          candidate_id: 'cand_sl',
          user_id: 'u_sl',
          full_name: 'Shortlist Test',
          email: 'sl@example.com',
          primary_skills: ['react', 'nodejs'],
          primary_skill_years: { react: 4, nodejs: 3 },
          secondary_skills: [],
          total_experience: 5,
          seniority: 'mid',
          availability: 'immediate',
          industries: [],
          roles: [],
          experience_bucket: '3-5',
          resume_s3_key: 'r/sl.pdf',
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-15T00:00:00Z',
        },
      ],
      lastKey: undefined,
    });

    const reqId = '00000000-0000-0000-0000-000000000099';
    const criteria = { mustHaveSkills: ['react', 'nodejs'] };

    // First search — no shortlists exist
    vi.mocked(getShortlistsForRequirement).mockResolvedValueOnce([]);
    const event1 = makeEvent({
      body: JSON.stringify({ criteria, requirementId: reqId }),
    });
    const body1 = parseBody(await searchHandler(event1));
    expect(body1.data.candidates[0].isShortlisted).toBe(false);
    expect(body1.data.candidates[0].isNotSuitable).toBe(false);

    // Second search (cache hit) — candidate now shortlisted
    vi.mocked(getShortlistsForRequirement).mockResolvedValueOnce([
      { requirement_id: reqId, candidate_id: 'cand_sl', status: 'shortlisted', tagged_by: 'u1', tagged_at: '2024-01-16T00:00:00Z' },
    ]);
    const event2 = makeEvent({
      body: JSON.stringify({ criteria, requirementId: reqId }),
    });
    const body2 = parseBody(await searchHandler(event2));
    expect(body2.data.candidates[0].isShortlisted).toBe(true);
    expect(body2.data.candidates[0].isNotSuitable).toBe(false);

    // DynamoDB scan should have been called only once (cache served the second request)
    expect(vi.mocked(searchCandidates)).toHaveBeenCalledTimes(1);
    // But shortlist fetch should have been called twice (always fresh)
    expect(vi.mocked(getShortlistsForRequirement)).toHaveBeenCalledTimes(2);
  });

  it('excludes not-suitable candidates from results and totalMatches when includeNotSuitable is false', async () => {
    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: [
        {
          candidate_id: 'cand_a',
          user_id: 'u_a',
          full_name: 'Suitable Alice',
          email: 'a@example.com',
          primary_skills: ['react'],
          primary_skill_years: { react: 4 },
          secondary_skills: [],
          total_experience: 5,
          seniority: 'mid',
          availability: 'immediate',
          industries: [],
          roles: [],
          experience_bucket: '3-5',
          resume_s3_key: 'r/a.pdf',
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-15T00:00:00Z',
        },
        {
          candidate_id: 'cand_b',
          user_id: 'u_b',
          full_name: 'Not Suitable Bob',
          email: 'b@example.com',
          primary_skills: ['react'],
          primary_skill_years: { react: 3 },
          secondary_skills: [],
          total_experience: 4,
          seniority: 'mid',
          availability: 'immediate',
          industries: [],
          roles: [],
          experience_bucket: '3-5',
          resume_s3_key: 'r/b.pdf',
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-14T00:00:00Z',
        },
      ],
      lastKey: undefined,
    });

    const reqId = '00000000-0000-0000-0000-000000000088';
    vi.mocked(getShortlistsForRequirement).mockResolvedValueOnce([
      { requirement_id: reqId, candidate_id: 'cand_b', status: 'not_suitable', tagged_by: 'u1', tagged_at: '2024-01-16T00:00:00Z' },
    ]);

    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['react'] },
        requirementId: reqId,
        includeNotSuitable: false,
      }),
    });
    const body = parseBody(await searchHandler(event));

    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.candidates[0].candidateId).toBe('cand_a');
    expect(body.data.totalMatches).toBe(1);
  });

  it('includes not-suitable candidates when includeNotSuitable is true or omitted', async () => {
    vi.mocked(searchCandidates).mockResolvedValueOnce({
      items: [
        {
          candidate_id: 'cand_a',
          user_id: 'u_a',
          full_name: 'Suitable Alice',
          email: 'a@example.com',
          primary_skills: ['react'],
          primary_skill_years: { react: 4 },
          secondary_skills: [],
          total_experience: 5,
          seniority: 'mid',
          availability: 'immediate',
          industries: [],
          roles: [],
          experience_bucket: '3-5',
          resume_s3_key: 'r/a.pdf',
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-15T00:00:00Z',
        },
        {
          candidate_id: 'cand_b',
          user_id: 'u_b',
          full_name: 'Not Suitable Bob',
          email: 'b@example.com',
          primary_skills: ['react'],
          primary_skill_years: { react: 3 },
          secondary_skills: [],
          total_experience: 4,
          seniority: 'mid',
          availability: 'immediate',
          industries: [],
          roles: [],
          experience_bucket: '3-5',
          resume_s3_key: 'r/b.pdf',
          created_at: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-14T00:00:00Z',
        },
      ],
      lastKey: undefined,
    });

    const reqId = '00000000-0000-0000-0000-000000000088';
    vi.mocked(getShortlistsForRequirement).mockResolvedValueOnce([
      { requirement_id: reqId, candidate_id: 'cand_b', status: 'not_suitable', tagged_by: 'u1', tagged_at: '2024-01-16T00:00:00Z' },
    ]);

    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['react'] },
        requirementId: reqId,
        includeNotSuitable: true,
      }),
    });
    const body = parseBody(await searchHandler(event));

    expect(body.data.candidates).toHaveLength(2);
    expect(body.data.totalMatches).toBe(2);
    expect(body.data.candidates.find((c: { candidateId: string }) => c.candidateId === 'cand_b').isNotSuitable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Placed-candidate exclusion (ticket #169)
// ---------------------------------------------------------------------------

describe('POST /recruiter/search — placed-candidate exclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearSearchCache();
  });

  const makeCandidates = () => ({
    items: [
      {
        candidate_id: 'cand_active',
        user_id: 'u_a',
        full_name: 'Active Alice',
        email: 'a@example.com',
        primary_skills: ['react'],
        primary_skill_years: { react: 4 },
        secondary_skills: [],
        total_experience: 5,
        seniority: 'mid',
        availability: 'immediate',
        industries: [],
        roles: [],
        experience_bucket: '3-5',
        resume_s3_key: 'r/a.pdf',
        created_at: '2024-01-01T00:00:00Z',
        last_updated: '2024-01-15T00:00:00Z',
      },
      {
        candidate_id: 'cand_placed',
        user_id: 'u_b',
        full_name: 'Placed Bob',
        email: 'b@example.com',
        primary_skills: ['react'],
        primary_skill_years: { react: 3 },
        secondary_skills: [],
        total_experience: 4,
        seniority: 'mid',
        availability: 'immediate',
        industries: [],
        roles: [],
        experience_bucket: '3-5',
        resume_s3_key: 'r/b.pdf',
        created_at: '2024-01-01T00:00:00Z',
        last_updated: '2024-01-14T00:00:00Z',
      },
    ],
    lastKey: undefined,
  });

  it('excludes placed candidates from search results and totalMatches', async () => {
    vi.mocked(searchCandidates).mockResolvedValueOnce(makeCandidates());
    vi.mocked(getPlacedCandidateIds).mockResolvedValueOnce(new Set(['cand_placed']));

    const event = makeEvent({
      body: JSON.stringify({ criteria: { mustHaveSkills: ['react'] } }),
    });
    const body = parseBody(await searchHandler(event));

    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.candidates[0].candidateId).toBe('cand_active');
    expect(body.data.totalMatches).toBe(1);
  });

  it('excludes placed candidates even when searching for a different requirement', async () => {
    vi.mocked(searchCandidates).mockResolvedValueOnce(makeCandidates());
    vi.mocked(getPlacedCandidateIds).mockResolvedValueOnce(new Set(['cand_placed']));
    vi.mocked(getShortlistsForRequirement).mockResolvedValueOnce([]);

    const reqId = '00000000-0000-0000-0000-000000000099';
    const event = makeEvent({
      body: JSON.stringify({
        criteria: { mustHaveSkills: ['react'] },
        requirementId: reqId,
      }),
    });
    const body = parseBody(await searchHandler(event));

    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.candidates[0].candidateId).toBe('cand_active');
  });

  it('returns empty results gracefully when all candidates are placed', async () => {
    vi.mocked(searchCandidates).mockResolvedValueOnce(makeCandidates());
    vi.mocked(getPlacedCandidateIds).mockResolvedValueOnce(new Set(['cand_active', 'cand_placed']));

    const event = makeEvent({
      body: JSON.stringify({ criteria: { mustHaveSkills: ['react'] } }),
    });
    const body = parseBody(await searchHandler(event));

    expect(body.data.candidates).toHaveLength(0);
    expect(body.data.totalMatches).toBe(0);
    expect(body.data.pagination.hasMore).toBe(false);
  });

  it('fetches placed candidates fresh on every request (not cached)', async () => {
    vi.mocked(searchCandidates).mockResolvedValueOnce(makeCandidates());

    // First request — no placed candidates
    vi.mocked(getPlacedCandidateIds).mockResolvedValueOnce(new Set());
    const event1 = makeEvent({
      body: JSON.stringify({ criteria: { mustHaveSkills: ['react'] } }),
    });
    const body1 = parseBody(await searchHandler(event1));
    expect(body1.data.candidates).toHaveLength(2);

    // Second request (cache hit for scoring) — candidate now placed
    vi.mocked(getPlacedCandidateIds).mockResolvedValueOnce(new Set(['cand_placed']));
    const event2 = makeEvent({
      body: JSON.stringify({ criteria: { mustHaveSkills: ['react'] } }),
    });
    const body2 = parseBody(await searchHandler(event2));
    expect(body2.data.candidates).toHaveLength(1);

    // DynamoDB scan called once (cached), but placed-candidate fetch called twice
    expect(vi.mocked(searchCandidates)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getPlacedCandidateIds)).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// GET /recruiter/resume-url/{candidateId}
// TC-DOWNLOAD-001 through TC-DOWNLOAD-004
// ---------------------------------------------------------------------------

describe('GET /recruiter/resume-url/{candidateId}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-DOWNLOAD-001
  it('generates resume download URL for existing candidate with formatted resume', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce({
      candidate_id: 'cand_123',
      user_id: 'user_1',
      full_name: 'Alice',
      email: 'alice@example.com',
      primary_skills: ['react'],
      primary_skill_years: { react: 3 },
      secondary_skills: [],
      total_experience: 3,
      seniority: 'mid',
      availability: 'immediate',
      industries: [],
      roles: [],
      experience_bucket: '3-5',
      resume_s3_key: 'resumes/2024/01/abc-resume.pdf',
      formatted_resume_s3_key: 'formatted/2024/01/abc-resume.pdf',
      formatted_at: '2024-01-10T00:00:00Z',
      created_at: '2024-01-10T00:00:00Z',
      last_updated: '2024-01-10T00:00:00Z',
    });

    const event = makeEvent({ pathParameters: { candidateId: 'cand_123' } });
    const result = await resumeUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.downloadUrl).toContain('https://');
    expect(body.data.status).toBe('ready');
    expect(body.data.isFormatted).toBe(true);
  });

  // TC-DOWNLOAD-002
  it('returns 404 for non-existent candidate', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce(null);

    const event = makeEvent({ pathParameters: { candidateId: 'nonexistent' } });
    const result = await resumeUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when candidate has no resume', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce({
      candidate_id: 'cand_123',
      user_id: 'user_1',
      full_name: 'NoResume',
      email: 'nr@example.com',
      primary_skills: ['react'],
      primary_skill_years: {},
      secondary_skills: [],
      total_experience: 1,
      seniority: 'junior',
      availability: 'immediate',
      industries: [],
      roles: [],
      experience_bucket: '0-2',
      resume_s3_key: '',
      created_at: '2024-01-10T00:00:00Z',
      last_updated: '2024-01-10T00:00:00Z',
    });

    const event = makeEvent({ pathParameters: { candidateId: 'cand_123' } });
    const result = await resumeUrlHandler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when candidateId missing', async () => {
    const event = makeEvent({ pathParameters: {} });
    const result = await resumeUrlHandler(event);
    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /recruiter/original-resume-url/{candidateId}
// TC-ORIGINAL-RESUME-001 through TC-ORIGINAL-RESUME-005
// ---------------------------------------------------------------------------

describe('GET /recruiter/original-resume-url/{candidateId}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-ORIGINAL-RESUME-001
  it('generates original resume download URL for existing candidate', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce({
      candidate_id: 'cand_456',
      user_id: 'user_2',
      full_name: 'Bob Johnson',
      email: 'bob@example.com',
      primary_skills: ['python', 'django'],
      primary_skill_years: { python: 5, django: 3 },
      secondary_skills: ['postgresql'],
      total_experience: 5,
      seniority: 'senior',
      availability: '2_weeks',
      industries: ['fintech'],
      roles: ['Backend Developer'],
      experience_bucket: '3-5',
      resume_s3_key: 'resumes/2024/01/abc123def-Bob_Johnson_Resume.pdf',
      created_at: '2024-01-10T00:00:00Z',
      last_updated: '2024-01-10T00:00:00Z',
    });

    const event = makeEvent({ pathParameters: { candidateId: 'cand_456' } });
    const result = await originalResumeUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.downloadUrl).toContain('https://');
    expect(body.data.fileName).toBe('Bob_Johnson_Resume.pdf');
    expect(body.data.expiresIn).toBe(300);
  });

  // TC-ORIGINAL-RESUME-002
  it('returns 404 for non-existent candidate', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce(null);

    const event = makeEvent({ pathParameters: { candidateId: 'nonexistent' } });
    const result = await originalResumeUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Candidate not found');
  });

  // TC-ORIGINAL-RESUME-003
  it('returns 404 when candidate has no resume', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce({
      candidate_id: 'cand_789',
      user_id: 'user_3',
      full_name: 'Charlie Brown',
      email: 'charlie@example.com',
      primary_skills: ['java'],
      primary_skill_years: { java: 2 },
      secondary_skills: [],
      total_experience: 2,
      seniority: 'junior',
      availability: 'immediate',
      industries: [],
      roles: [],
      experience_bucket: '0-2',
      resume_s3_key: '',
      created_at: '2024-01-10T00:00:00Z',
      last_updated: '2024-01-10T00:00:00Z',
    });

    const event = makeEvent({ pathParameters: { candidateId: 'cand_789' } });
    const result = await originalResumeUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('No resume found for this candidate');
  });

  // TC-ORIGINAL-RESUME-004
  it('returns 400 when candidateId is missing', async () => {
    const event = makeEvent({ pathParameters: {} });
    const result = await originalResumeUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Candidate ID is required');
  });

  // TC-ORIGINAL-RESUME-005b
  it('passes correct filename to generateDownloadUrl for DOCX resumes', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce({
      candidate_id: 'cand_docx',
      user_id: 'user_docx',
      full_name: 'Tanuja Boduggam',
      email: 'tanuja@example.com',
      primary_skills: ['java'],
      primary_skill_years: { java: 5 },
      secondary_skills: [],
      total_experience: 5,
      seniority: 'senior',
      availability: 'immediate',
      industries: [],
      roles: ['Backend Developer'],
      experience_bucket: '3-5',
      resume_s3_key: 'resumes/2024/03/abc123def-Tanuja_Resume.docx',
      created_at: '2024-03-01T00:00:00Z',
      last_updated: '2024-03-01T00:00:00Z',
    });

    const event = makeEvent({ pathParameters: { candidateId: 'cand_docx' } });
    const result = await originalResumeUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.fileName).toBe('Tanuja_Resume.docx');
    expect(vi.mocked(generateDownloadUrl)).toHaveBeenCalledWith(
      'resumes/2024/03/abc123def-Tanuja_Resume.docx',
      { fileName: 'Tanuja_Resume.docx' }
    );
  });

  // TC-ORIGINAL-RESUME-005
  it('extracts original filename from S3 key correctly', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce({
      candidate_id: 'cand_999',
      user_id: 'user_4',
      full_name: 'Diana Prince',
      email: 'diana@example.com',
      primary_skills: ['typescript', 'react'],
      primary_skill_years: { typescript: 4, react: 4 },
      secondary_skills: ['nodejs'],
      total_experience: 4,
      seniority: 'mid',
      availability: '1_month',
      industries: ['saas'],
      roles: ['Full Stack Developer'],
      experience_bucket: '3-5',
      resume_s3_key: 'resumes/2024/02/a1b2c3d4-e5f6-7890-abcd-ef1234567890-My_Custom_Resume.pdf',
      created_at: '2024-02-01T00:00:00Z',
      last_updated: '2024-02-01T00:00:00Z',
    });

    const event = makeEvent({ pathParameters: { candidateId: 'cand_999' } });
    const result = await originalResumeUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.fileName).toBe('My_Custom_Resume.pdf');
  });
});

// ---------------------------------------------------------------------------
// POST /recruiter/search/save
// TC-SAVEDSEARCH-001 through TC-SAVEDSEARCH-003
// ---------------------------------------------------------------------------

describe('POST /recruiter/search/save', () => {
  // TC-SAVEDSEARCH-001
  it('saves a new search', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        name: 'Senior React Developers',
        criteria: { mustHaveSkills: ['react'], minExperience: 5 },
      }),
    });
    const result = await saveSearchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.searchId).toMatch(/^search_/);
    expect(body.data.name).toBe('Senior React Developers');
    expect(body.data.createdAt).toBeDefined();
  });

  // TC-SAVEDSEARCH-002
  it('rejects empty name', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: '', criteria: {} }),
    });
    const result = await saveSearchHandler(event);
    expect(result.statusCode).toBe(400);
  });

  it('rejects empty body', async () => {
    const event = makeEvent({ body: undefined });
    const result = await saveSearchHandler(event);
    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /recruiter/searches
// TC-SAVEDSEARCH-004, TC-SAVEDSEARCH-005
// ---------------------------------------------------------------------------

describe('GET /recruiter/searches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-SAVEDSEARCH-004
  it('lists saved searches for recruiter', async () => {
    vi.mocked(getSavedSearches).mockResolvedValueOnce([
      {
        recruiterId: 'rec_1',
        searchId: 'search_1',
        name: 'React Devs',
        criteria: { mustHaveSkills: ['react'], goodToHaveSkills: [] },
        createdAt: '2024-01-10T09:00:00Z',
      },
      {
        recruiterId: 'rec_1',
        searchId: 'search_2',
        name: 'Python Devs',
        criteria: { mustHaveSkills: ['python'], goodToHaveSkills: [] },
        createdAt: '2024-01-11T09:00:00Z',
      },
    ]);

    const event = makeEvent({
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'rec_1' } } },
      } as unknown as APIGatewayProxyEventV2['requestContext'],
    });
    const result = await getSearchesHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.searches).toHaveLength(2);
    expect(body.data.searches[0].searchId).toBe('search_1');
    expect(body.data.searches[0].name).toBe('React Devs');
  });

  // TC-SAVEDSEARCH-005
  it('returns empty array when no saved searches', async () => {
    vi.mocked(getSavedSearches).mockResolvedValueOnce([]);

    const event = makeEvent({});
    const result = await getSearchesHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.searches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DELETE /recruiter/search/{searchId}
// TC-SAVEDSEARCH-006, TC-SAVEDSEARCH-007
// ---------------------------------------------------------------------------

describe('DELETE /recruiter/search/{searchId}', () => {
  // TC-SAVEDSEARCH-006
  it('deletes a saved search', async () => {
    const event = makeEvent({
      pathParameters: { searchId: 'search_123' },
    });
    const result = await deleteSearchHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.deleted).toBe(true);
  });

  it('returns 400 when searchId missing', async () => {
    const event = makeEvent({ pathParameters: {} });
    const result = await deleteSearchHandler(event);
    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /recruiter/recent-profiles (listRecentProfiles handler)
// ---------------------------------------------------------------------------

describe('GET /recruiter/recent-profiles', () => {
  beforeEach(() => {
    vi.mocked(getRecentProfiles).mockClear();
  });

  it('returns the latest profiles sorted by lastUpdated descending', async () => {
    const event = makeEvent({});
    const result = await listRecentProfilesHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.profiles).toHaveLength(2);
    expect(body.data.profiles[0].candidateId).toBe('cand_1');
    expect(body.data.profiles[0].fullName).toBe('Alice Smith');
    expect(body.data.profiles[0].lastUpdated).toBe('2026-03-17T10:00:00Z');
    expect(body.data.profiles[0].roles).toEqual(['Full Stack Developer']);
    expect(body.data.profiles[1].candidateId).toBe('cand_2');
    expect(body.data.profiles[1].roles).toEqual(['Backend Developer']);
    expect(body.data.pagination).toBeDefined();
    expect(body.data.pagination.hasMore).toBe(false);
    expect(getRecentProfiles).toHaveBeenCalledWith(10, undefined);
  });

  it('passes custom limit to getRecentProfiles (capped at 50)', async () => {
    const event = makeEvent({
      queryStringParameters: { limit: '25' },
    });
    await listRecentProfilesHandler(event);
    expect(getRecentProfiles).toHaveBeenCalledWith(25, undefined);
  });

  it('caps limit at 100', async () => {
    const event = makeEvent({
      queryStringParameters: { limit: '200' },
    });
    await listRecentProfilesHandler(event);
    expect(getRecentProfiles).toHaveBeenCalledWith(100, undefined);
  });

  it('returns empty array when no profiles exist', async () => {
    vi.mocked(getRecentProfiles).mockResolvedValueOnce({ items: [], lastKey: undefined });
    const event = makeEvent({});
    const result = await listRecentProfilesHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.profiles).toHaveLength(0);
    expect(body.data.pagination.hasMore).toBe(false);
  });

  it('passes pagination key to getRecentProfiles', async () => {
    const paginationKey = { _type: 'PROFILE', last_updated: '2026-03-15T00:00:00Z', candidate_id: 'cand_50' };
    const encoded = Buffer.from(JSON.stringify(paginationKey)).toString('base64');
    const event = makeEvent({
      queryStringParameters: { limit: '50', lastEvaluatedKey: encoded },
    });
    await listRecentProfilesHandler(event);
    expect(getRecentProfiles).toHaveBeenCalledWith(50, paginationKey);
  });

  it('returns 400 for invalid pagination key', async () => {
    const event = makeEvent({
      queryStringParameters: { lastEvaluatedKey: 'not-valid-base64!' },
    });
    const result = await listRecentProfilesHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error.message).toContain('Invalid pagination key');
  });
});
