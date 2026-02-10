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

// Import handlers after mocks
import { handler as searchHandler } from '../recruiter/search.js';
import { handler as parseJdHandler } from '../recruiter/parseJd.js';
import { handler as resumeUrlHandler } from '../recruiter/resumeUrl.js';
import { handler as originalResumeUrlHandler } from '../recruiter/originalResumeUrl.js';
import { handler as saveSearchHandler } from '../recruiter/saveSearch.js';
import { handler as getSearchesHandler } from '../recruiter/getSearches.js';
import { handler as deleteSearchHandler } from '../recruiter/deleteSearch.js';
import { getCandidateById, getSavedSearches } from '../../lib/dynamodb.js';
import { parseJobDescription } from '../../lib/llm/index.js';

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
  it('rejects JD under 50 characters', async () => {
    const event = makeEvent({
      body: JSON.stringify({ jobDescription: 'Need React dev' }),
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
      expect(c.matchDetails).toHaveProperty('mustHaveMissing');
      expect(c.matchDetails).toHaveProperty('goodToHaveMatched');
      expect(c.matchDetails).toHaveProperty('experienceMatch');
      expect(c.matchDetails).toHaveProperty('seniorityMatch');
    }
  });

  it('rejects empty body', async () => {
    const event = makeEvent({ body: undefined });
    const result = await searchHandler(event);
    expect(result.statusCode).toBe(400);
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
  it('generates resume download URL for existing candidate', async () => {
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
      created_at: '2024-01-10T00:00:00Z',
      last_updated: '2024-01-10T00:00:00Z',
    });

    const event = makeEvent({ pathParameters: { candidateId: 'cand_123' } });
    const result = await resumeUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.downloadUrl).toContain('https://');
    expect(body.data.fileName).toBe('resume.pdf');
    expect(body.data.expiresIn).toBe(300);
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
