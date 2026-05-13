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
const mockGetShortlistsForCandidate = vi.fn().mockResolvedValue([]);
const mockGetActivePricingConfig = vi.fn().mockResolvedValue({});
const mockUpdateShortlistRates = vi.fn().mockResolvedValue(undefined);
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
  getShortlistsForCandidate: (...args: unknown[]) => mockGetShortlistsForCandidate(...args),
  getActivePricingConfig: (...args: unknown[]) => mockGetActivePricingConfig(...args),
  updateShortlistRates: (...args: unknown[]) => mockUpdateShortlistRates(...args),
  getExperienceBucket: (...args: unknown[]) => mockGetExperienceBucket(...args),
}));

const mockCalculatePricing = vi.fn().mockReturnValue({
  finalQuotedHourly: 1500,
  finalQuotedMonthly: 240000,
  finalQuotedAnnual: 2880000,
  minimumBillingHourly: 1200,
  minimumBillingMonthly: 192000,
  minimumBillingAnnual: 2304000,
});

vi.mock('../../lib/pricingEngine.js', () => ({
  calculatePricing: (...args: unknown[]) => mockCalculatePricing(...args),
  getExperienceBand: vi.fn(() => 'mid'),
  getContractDurationDiscount: vi.fn(() => 0),
}));

vi.mock('../../lib/ctcConversion.js', async () => {
  const actual = await vi.importActual('../../lib/ctcConversion.js') as Record<string, unknown>;
  return actual;
});

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

  it('should merge customFields with existing candidate custom_fields', async () => {
    mockGetCandidateById.mockResolvedValue({
      ...mockCandidate,
      custom_fields: { pan_number: 'ABCDE1234F' },
    });

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: {
        currentCtc: 12,
        customFields: { date_of_birth: '1990-05-15' },
      },
      notes: 'Added DOB',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.fieldsUpdated).toContain('custom_fields');

    // Verify merged custom_fields were passed to updateCandidateProfileFields
    const updateCall = mockUpdateCandidateProfileFields.mock.calls[0];
    expect(updateCall[1].custom_fields).toEqual({
      pan_number: 'ABCDE1234F',
      date_of_birth: '1990-05-15',
    });
  });

  it('should compute expectedCtc server-side when expectedCtcType is negotiable', async () => {
    mockGetCandidateById.mockResolvedValue({
      ...mockCandidate,
      current_ctc: 10,
      total_experience: 6,
    });

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: {
        currentCtc: 10,
        expectedCtcType: 'negotiable',
      },
      notes: 'Candidate open to negotiation',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.fieldsUpdated).toContain('expected_ctc');
    expect(body.data.fieldsUpdated).toContain('expected_ctc_type');

    // 6 years experience → 25% increment: 10 * 1.25 = 12.5
    const updateCall = mockUpdateCandidateProfileFields.mock.calls[0];
    expect(updateCall[1].expected_ctc).toBe(12.5);
    expect(updateCall[1].expected_ctc_type).toBe('negotiable');
  });

  it('should return 400 when negotiable expectedCtcType but no currentCtc', async () => {
    mockGetCandidateById.mockResolvedValue({
      ...mockCandidate,
      current_ctc: undefined,
    });

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: {
        expectedCtcType: 'negotiable',
      },
      notes: 'Missing CTC',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('should use existing candidate currentCtc for negotiable if not in updatedValues', async () => {
    mockGetCandidateById.mockResolvedValue({
      ...mockCandidate,
      current_ctc: 15,
      total_experience: 2,
    });

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: {
        expectedCtcType: 'negotiable',
      },
      notes: 'Using existing CTC',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    // 2 years experience → 20% increment: 15 * 1.20 = 18
    const updateCall = mockUpdateCandidateProfileFields.mock.calls[0];
    expect(updateCall[1].expected_ctc).toBe(18);
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

  it('should allow shortlisting a not-interested candidate with warning', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    mockGetRequirementById.mockResolvedValue({ requirement_id: 'req_1' });
    mockGetCandidateById.mockResolvedValue({
      ...mockCandidate,
      last_screened_at: fiveDaysAgo,
      not_interested: true,
      not_interested_at: fiveDaysAgo,
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
    expect(body.data.warning).toBe('NOT_INTERESTED');
    expect(body.data.notInterestedAt).toBe(fiveDaysAgo);
    expect(mockSaveShortlist).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Tests: Not Interested Candidate Screening
// ---------------------------------------------------------------------------

describe('screenCandidate handler (not interested)', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../recruiter/screenCandidate.js');
    handler = mod.handler;
  });

  it('should set not_interested flag and timestamps', async () => {
    mockGetCandidateById.mockResolvedValue(mockCandidate);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { notInterested: true },
      notes: 'Candidate declined the opportunity',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.notInterested).toBe(true);
    expect(body.data.fieldsUpdated).toContain('not_interested');

    // Verify updateCandidateProfileFields was called with not_interested fields
    const updateCall = mockUpdateCandidateProfileFields.mock.calls[0];
    expect(updateCall[1].not_interested).toBe(true);
    expect(updateCall[1].not_interested_at).toBeDefined();
    expect(updateCall[1].not_interested_by).toBe('recruiter_1');
  });

  it('should clear not_interested flag and remove timestamps', async () => {
    mockGetCandidateById.mockResolvedValue({
      ...mockCandidate,
      not_interested: true,
      not_interested_at: '2026-03-20T10:00:00Z',
      not_interested_by: 'recruiter_1',
    });

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { notInterested: false },
      notes: 'Candidate is now interested',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.notInterested).toBe(false);

    // Verify timestamps are nulled (triggers DynamoDB REMOVE)
    const updateCall = mockUpdateCandidateProfileFields.mock.calls[0];
    expect(updateCall[1].not_interested).toBe(false);
    expect(updateCall[1].not_interested_at).toBeNull();
    expect(updateCall[1].not_interested_by).toBeNull();
  });

  it('should allow screening with minimal fields when notInterested is true', async () => {
    mockGetCandidateById.mockResolvedValue(mockCandidate);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { notInterested: true },
      notes: 'Not interested, no compensation details available',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    // Backend allows all fields optional — this should succeed
    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSaveScreening).toHaveBeenCalledOnce();
  });

  it('should include not_interested in screening audit record', async () => {
    mockGetCandidateById.mockResolvedValue(mockCandidate);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { notInterested: true },
      notes: 'Candidate not interested',
    });

    await handler(event);

    // Verify the screening item saved includes not_interested in updated_values
    const screeningCall = mockSaveScreening.mock.calls[0][0];
    expect(screeningCall.updated_values.not_interested).toBe(true);
    expect(screeningCall.fields_updated).toContain('not_interested');
  });

  it('should update linkedinUrl and githubUrl via FIELD_MAP', async () => {
    mockGetCandidateById.mockResolvedValue(mockCandidate);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: {
        linkedinUrl: 'https://linkedin.com/in/alicesmith',
        githubUrl: 'https://github.com/alicesmith',
      },
      notes: 'Added profile URLs',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.fieldsUpdated).toContain('linkedin_url');
    expect(body.data.fieldsUpdated).toContain('github_url');

    // Verify DynamoDB update received the snake_case keys
    const updateCall = mockUpdateCandidateProfileFields.mock.calls[0];
    const fields = updateCall[1];
    expect(fields.linkedin_url).toBe('https://linkedin.com/in/alicesmith');
    expect(fields.github_url).toBe('https://github.com/alicesmith');

    // Verify screening audit record
    const screeningCall = mockSaveScreening.mock.calls[0][0];
    expect(screeningCall.updated_values.linkedin_url).toBe('https://linkedin.com/in/alicesmith');
    expect(screeningCall.updated_values.github_url).toBe('https://github.com/alicesmith');
  });
});

// ---------------------------------------------------------------------------
// Tests: Shortlist Rate Recalculation on CTC Change
// ---------------------------------------------------------------------------

const mockRequirement = {
  requirement_id: 'req_1',
  engagement_model: 'full_time_contract',
  contract_duration_months: 12,
  payment_terms_days: 30,
  budget_min_lpa: 20,
  budget_max_lpa: 30,
  is_rate_gst_inclusive: false,
};

const mockShortlistEntry = {
  requirement_id: 'req_1',
  candidate_id: 'cand_1',
  status: 'shortlisted',
  proposed_rate_hourly: 1000,
  proposed_rate_monthly: 160000,
  proposed_rate_annual: 1920000,
  internal_rate_hourly: 900,
  internal_rate_monthly: 144000,
  internal_rate_annual: 1728000,
  proposed_rate_calculated_at: '2026-04-01T00:00:00Z',
};

describe('screenCandidate handler (shortlist rate recalculation)', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCandidateById.mockResolvedValue(mockCandidate);
    mockGetShortlistsForCandidate.mockResolvedValue([mockShortlistEntry]);
    mockGetRequirementById.mockResolvedValue(mockRequirement);
    mockGetActivePricingConfig.mockResolvedValue({});
    mockCalculatePricing.mockReturnValue({
      finalQuotedHourly: 1500,
      finalQuotedMonthly: 240000,
      finalQuotedAnnual: 2880000,
      minimumBillingHourly: 1200,
      minimumBillingMonthly: 192000,
      minimumBillingAnnual: 2304000,
    });
    const mod = await import('../recruiter/screenCandidate.js');
    handler = mod.handler;
  });

  it('should recalculate shortlist rates when expectedCtc changes', async () => {
    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { expectedCtc: 20 },
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(mockGetShortlistsForCandidate).toHaveBeenCalledWith('cand_1');
    expect(mockGetActivePricingConfig).toHaveBeenCalledOnce();
    expect(mockGetRequirementById).toHaveBeenCalledWith('req_1');
    expect(mockCalculatePricing).toHaveBeenCalledWith(
      expect.objectContaining({ candidateExpectedCtcLpa: 20 }),
      expect.anything()
    );
    expect(mockUpdateShortlistRates).toHaveBeenCalledWith(
      'req_1', 'cand_1',
      expect.objectContaining({
        proposed_rate_hourly: 1500,
        proposed_rate_monthly: 240000,
        proposed_rate_annual: 2880000,
        internal_rate_hourly: 1200,
        internal_rate_monthly: 192000,
        internal_rate_annual: 2304000,
        proposed_rate_calculated_at: expect.any(String),
      })
    );
  });

  it('should use new totalExperience for pricing when both CTC and experience change', async () => {
    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { expectedCtc: 25, totalExperience: 10 },
    });

    await handler(event);

    expect(mockCalculatePricing).toHaveBeenCalledWith(
      expect.objectContaining({ candidateExpectedCtcLpa: 25, candidateExperienceYears: 10 }),
      expect.anything()
    );
  });

  it('should use candidate existing experience when only CTC changes', async () => {
    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { expectedCtc: 18 },
    });

    await handler(event);

    expect(mockCalculatePricing).toHaveBeenCalledWith(
      expect.objectContaining({ candidateExpectedCtcLpa: 18, candidateExperienceYears: mockCandidate.total_experience }),
      expect.anything()
    );
  });

  it('should NOT recalculate rates when expectedCtc is not in updatedValues', async () => {
    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { availability: '2_weeks' },
    });

    await handler(event);

    expect(mockGetShortlistsForCandidate).not.toHaveBeenCalled();
    expect(mockUpdateShortlistRates).not.toHaveBeenCalled();
  });

  it('should succeed with no rate updates when candidate has no shortlist entries', async () => {
    mockGetShortlistsForCandidate.mockResolvedValue([]);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { expectedCtc: 20 },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(mockUpdateShortlistRates).not.toHaveBeenCalled();
    expect(mockGetActivePricingConfig).not.toHaveBeenCalled();
  });

  it('should skip exit-state shortlist entries', async () => {
    mockGetShortlistsForCandidate.mockResolvedValue([
      { ...mockShortlistEntry, requirement_id: 'req_active', status: 'shortlisted' },
      { ...mockShortlistEntry, requirement_id: 'req_rejected', status: 'rejected' },
      { ...mockShortlistEntry, requirement_id: 'req_not_suitable', status: 'not_suitable' },
      { ...mockShortlistEntry, requirement_id: 'req_pipeline_exit', status: 'submitted', pipeline_stage: 'rejected_by_client' },
      { ...mockShortlistEntry, requirement_id: 'req_withdrawn', status: 'submitted', pipeline_stage: 'candidate_withdrawn' },
    ]);
    mockGetRequirementById.mockResolvedValue(mockRequirement);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { expectedCtc: 20 },
    });

    await handler(event);

    // Only the active entry should be updated
    expect(mockUpdateShortlistRates).toHaveBeenCalledTimes(1);
    expect(mockUpdateShortlistRates).toHaveBeenCalledWith('req_active', 'cand_1', expect.anything());
  });

  it('should be non-fatal when requirement is deleted for one shortlist entry', async () => {
    mockGetShortlistsForCandidate.mockResolvedValue([
      { ...mockShortlistEntry, requirement_id: 'req_deleted' },
      { ...mockShortlistEntry, requirement_id: 'req_valid' },
    ]);
    mockGetRequirementById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockRequirement);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { expectedCtc: 20 },
    });

    const result = await handler(event);

    // Screening should still succeed
    expect(result.statusCode).toBe(200);
    // Only the valid entry should be updated
    expect(mockUpdateShortlistRates).toHaveBeenCalledTimes(1);
    expect(mockUpdateShortlistRates).toHaveBeenCalledWith('req_valid', 'cand_1', expect.anything());
  });

  it('should keep response shape unchanged regardless of rate recalculation', async () => {
    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { expectedCtc: 20 },
      notes: 'CTC update',
    });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      candidateId: 'cand_1',
      screenedAt: expect.any(String),
      fieldsUpdated: expect.arrayContaining(['expected_ctc']),
    });
    // No extra rate fields in response
    expect(body.data.proposedRateHourly).toBeUndefined();
  });

  it('should use server-derived CTC for rate recalculation when expectedCtcType is negotiable', async () => {
    mockGetCandidateById.mockResolvedValue({
      ...mockCandidate,
      current_ctc: 10,
      total_experience: 6,
    });

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { currentCtc: 10, expectedCtcType: 'negotiable' },
    });

    await handler(event);

    // 6 years → 25% increment: 10 * 1.25 = 12.5
    expect(mockCalculatePricing).toHaveBeenCalledWith(
      expect.objectContaining({ candidateExpectedCtcLpa: 12.5 }),
      expect.anything()
    );
  });

  it('should be non-fatal when fetching shortlists fails', async () => {
    mockGetShortlistsForCandidate.mockRejectedValue(new Error('DynamoDB error'));

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { expectedCtc: 20 },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(mockUpdateShortlistRates).not.toHaveBeenCalled();
  });

  it('should convert requirement budget LPA to hourly for pricing input', async () => {
    const reqWithBudget = {
      ...mockRequirement,
      budget_min_lpa: 24,
      budget_max_lpa: 36,
    };
    mockGetRequirementById.mockResolvedValue(reqWithBudget);

    const event = makeEvent({
      candidateId: 'cand_1',
      updatedValues: { expectedCtc: 20 },
    });

    await handler(event);

    // 24 LPA → (24 * 100_000) / (12 * 160) = 2_400_000 / 1920 = 1250
    // 36 LPA → (36 * 100_000) / (12 * 160) = 3_600_000 / 1920 = 1875
    expect(mockCalculatePricing).toHaveBeenCalledWith(
      expect.objectContaining({
        clientBudgetMinHourly: 1250,
        clientBudgetMaxHourly: 1875,
      }),
      expect.anything()
    );
  });
});
