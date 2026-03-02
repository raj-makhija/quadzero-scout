import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetCandidateById = vi.fn();
const mockSaveScreening = vi.fn().mockResolvedValue(undefined);
const mockUpdateCandidateProfileFields = vi.fn().mockResolvedValue(undefined);
const mockGetScreeningHistory = vi.fn().mockResolvedValue([]);
const mockGetRequirementById = vi.fn();
const mockGetShortlistEntry = vi.fn();
const mockSaveShortlist = vi.fn().mockResolvedValue(undefined);
const mockGetExperienceBucket = vi.fn((years: number) => {
  if (years <= 2) return '0-2';
  if (years <= 5) return '3-5';
  if (years <= 10) return '6-10';
  if (years <= 15) return '11-15';
  return '16+';
});

vi.mock('../../lib/dynamodb.js', () => ({
  getCandidateById: (...args: unknown[]) => mockGetCandidateById(...args),
  saveScreening: (...args: unknown[]) => mockSaveScreening(...args),
  updateCandidateProfileFields: (...args: unknown[]) => mockUpdateCandidateProfileFields(...args),
  getScreeningHistory: (...args: unknown[]) => mockGetScreeningHistory(...args),
  getRequirementById: (...args: unknown[]) => mockGetRequirementById(...args),
  getShortlistEntry: (...args: unknown[]) => mockGetShortlistEntry(...args),
  saveShortlist: (...args: unknown[]) => mockSaveShortlist(...args),
  getExperienceBucket: (...args: unknown[]) => mockGetExperienceBucket(...args),
}));

vi.mock('../../lib/skillNormalizer.js', () => ({
  normalizeSkills: vi.fn((skills: string[]) => skills.map(s => s.toLowerCase())),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (_roles: string[], handler: Function) => handler,
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockCandidate = {
  candidate_id: 'cand_1',
  user_id: 'user_1',
  full_name: 'Alice Smith',
  email: 'alice@example.com',
  phone: '+91 98765 43210',
  location: 'Bangalore, India',
  primary_skills: ['react', 'nodejs'],
  primary_skill_years: { react: 4, nodejs: 3 },
  secondary_skills: ['aws'],
  total_experience: 6,
  seniority: 'senior',
  availability: 'immediate',
  engagement_model: 'either',
  industries: ['fintech'],
  roles: ['Full Stack Developer'],
  experience_bucket: '6-10',
  resume_s3_key: 'resumes/2024/01/abc.pdf',
  created_at: '2024-01-10T08:00:00Z',
  last_updated: '2024-01-15T10:30:00Z',
};

function makeEvent(body: unknown, pathParams?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { authorization: 'Bearer test-token' },
    pathParameters: pathParams || undefined,
    requestContext: {} as any,
    routeKey: '',
    rawPath: '',
    rawQueryString: '',
    isBase64Encoded: false,
    auth: { userId: 'recruiter_1', email: 'recruiter@quadzero.com', role: 'recruiter', isInternal: true },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests: Screen Candidate
// ---------------------------------------------------------------------------

describe('screenCandidate handler', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../recruiter/screenCandidate.js');
    handler = mod.handler;
  });

  it('should screen a candidate and update profile', async () => {
    mockGetCandidateById.mockResolvedValue(mockCandidate);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: {
        currentCtc: 12,
        expectedCtc: 18,
        availability: '1_month',
      },
      notes: 'Candidate confirmed notice period',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.candidateId).toBe('cand_1');
    expect(body.data.fieldsUpdated).toContain('current_ctc');
    expect(body.data.fieldsUpdated).toContain('expected_ctc');
    expect(body.data.fieldsUpdated).toContain('availability');
    expect(mockSaveScreening).toHaveBeenCalledOnce();
    expect(mockUpdateCandidateProfileFields).toHaveBeenCalledOnce();
  });

  it('should return 404 if candidate not found', async () => {
    mockGetCandidateById.mockResolvedValue(null);

    const event = makeEvent({
      candidateId: 'nonexistent',
      updatedValues: { currentCtc: 10 },
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(404);
    expect(body.success).toBe(false);
  });

  it('should validate request body', async () => {
    const event = makeEvent({
      // Missing candidateId
      updatedValues: { currentCtc: 10 },
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.success).toBe(false);
  });

  it('should handle screening with no field changes (verification only)', async () => {
    mockGetCandidateById.mockResolvedValue(mockCandidate);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: {},
      notes: 'Verified all fields are correct',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.fieldsUpdated).toEqual([]);
    expect(mockSaveScreening).toHaveBeenCalledOnce();
  });

  it('should update experience_bucket when totalExperience changes', async () => {
    mockGetCandidateById.mockResolvedValue(mockCandidate);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { totalExperience: 3 },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    // Check that updateCandidateProfileFields was called with experience_bucket
    const updateCall = mockUpdateCandidateProfileFields.mock.calls[0];
    expect(updateCall[1]).toHaveProperty('experience_bucket');
  });
});

// ---------------------------------------------------------------------------
// Tests: Get Screening History
// ---------------------------------------------------------------------------

describe('getScreeningHistory handler', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../recruiter/getScreeningHistory.js');
    handler = mod.handler;
  });

  it('should return screening history for a candidate', async () => {
    mockGetCandidateById.mockResolvedValue(mockCandidate);
    mockGetScreeningHistory.mockResolvedValue([
      {
        candidate_id: 'cand_1',
        screened_at: '2024-02-01T10:00:00Z',
        screened_by: 'recruiter_1',
        screener_email: 'recruiter@quadzero.com',
        previous_values: { current_ctc: undefined },
        updated_values: { current_ctc: 12 },
        fields_updated: ['current_ctc'],
        notes: 'Initial screening',
      },
    ]);

    const event = makeEvent(null, { candidateId: 'cand_1' });
    event.body = undefined as any;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.screenings).toHaveLength(1);
    expect(body.data.screenings[0].screenerEmail).toBe('recruiter@quadzero.com');
  });

  it('should return 404 for nonexistent candidate', async () => {
    mockGetCandidateById.mockResolvedValue(null);

    const event = makeEvent(null, { candidateId: 'nonexistent' });
    event.body = undefined as any;

    const result = await handler(event);
    expect(JSON.parse(result.body).success).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it('should return 400 if candidateId path param is missing', async () => {
    const event = makeEvent(null, {});
    event.body = undefined as any;
    event.pathParameters = undefined;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Shortlist with Screening Rule
// ---------------------------------------------------------------------------

describe('shortlistCandidate handler (screening rule)', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../recruiter/shortlistCandidate.js');
    handler = mod.handler;
  });

  it('should block shortlisting if candidate was never screened', async () => {
    mockGetRequirementById.mockResolvedValue({ requirement_id: 'req_1' });
    mockGetCandidateById.mockResolvedValue({
      ...mockCandidate,
      last_screened_at: undefined,
    });

    const event = makeEvent({
      requirementId: 'req_1',
      candidateId: 'cand_1',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(409);
    expect(body.error.code).toBe('SCREENING_REQUIRED');
  });

  it('should block shortlisting if screening is older than 15 days', async () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    mockGetRequirementById.mockResolvedValue({ requirement_id: 'req_1' });
    mockGetCandidateById.mockResolvedValue({
      ...mockCandidate,
      last_screened_at: twentyDaysAgo,
    });

    const event = makeEvent({
      requirementId: 'req_1',
      candidateId: 'cand_1',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(409);
    expect(body.error.code).toBe('SCREENING_REQUIRED');
  });

  it('should allow shortlisting if screening is within 15 days', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    mockGetRequirementById.mockResolvedValue({ requirement_id: 'req_1' });
    mockGetCandidateById.mockResolvedValue({
      ...mockCandidate,
      last_screened_at: fiveDaysAgo,
    });
    mockGetShortlistEntry.mockResolvedValue(null);

    const event = makeEvent({
      requirementId: 'req_1',
      candidateId: 'cand_1',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSaveShortlist).toHaveBeenCalledOnce();
  });
});
