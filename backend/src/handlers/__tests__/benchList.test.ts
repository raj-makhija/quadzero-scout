import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetBenchListCandidates = vi.fn();
const mockGetActivePricingConfig = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  getBenchListCandidates: (...args: unknown[]) => mockGetBenchListCandidates(...args),
  getActivePricingConfig: (...args: unknown[]) => mockGetActivePricingConfig(...args),
}));

const mockCalculatePricing = vi.fn();

vi.mock('../../lib/pricingEngine.js', () => ({
  calculatePricing: (...args: unknown[]) => mockCalculatePricing(...args),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (_roles: string[], handler: Function) => handler,
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    candidate_id: 'cand_1',
    full_name: 'Alice Smith',
    total_experience: 6,
    location: 'Mumbai, India',
    roles: ['Backend Developer'],
    availability: 'immediate',
    last_screened_at: '2024-01-10T08:00:00Z',
    not_interested: false,
    seniority: 'senior',
    primary_skills: ['react'],
    engagement_model: 'full_time_contract',
    expected_ctc: 12,
    ...overrides,
  };
}

function makeEvent(): APIGatewayProxyEventV2 {
  return {
    body: null,
    headers: { authorization: 'Bearer test-token' },
    requestContext: {} as any,
    routeKey: '',
    rawPath: '',
    rawQueryString: '',
    isBase64Encoded: false,
    auth: { userId: 'recruiter_1', email: 'recruiter@quadzero.com', role: 'recruiter', isInternal: true },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('benchList handler', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetActivePricingConfig.mockResolvedValue({} as any);
    // 24 LPA annual quoted billing → indicativeBillingRateLpa = 24
    mockCalculatePricing.mockReturnValue({ finalQuotedAnnual: 2_400_000 });
    const mod = await import('../recruiter/benchList.js');
    handler = mod.handler;
  });

  it('fetches the pricing config exactly once per request', async () => {
    mockGetBenchListCandidates.mockResolvedValue({
      items: [candidate({ candidate_id: 'c1' }), candidate({ candidate_id: 'c2' }), candidate({ candidate_id: 'c3' })],
    });

    await handler(makeEvent());

    expect(mockGetActivePricingConfig).toHaveBeenCalledTimes(1);
  });

  it('computes a positive indicativeBillingRateLpa for candidates with valid expected_ctc', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate(), candidate({ candidate_id: 'c2' })] });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);

    for (const item of body.data.candidates) {
      expect(item.indicativeBillingRateLpa).toBeGreaterThan(0);
    }
  });

  it('calls calculatePricing with the fixed defaults and forwards the engagement model', async () => {
    mockGetBenchListCandidates.mockResolvedValue({
      items: [candidate({ engagement_model: 'full_time_regular' })],
    });

    await handler(makeEvent());

    expect(mockCalculatePricing).toHaveBeenCalledTimes(1);
    expect(mockCalculatePricing).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateExpectedCtcLpa: 12,
        candidateExperienceYears: 6,
        contractDurationMonths: 6,
        paymentTermsDays: 30,
        engagementModel: 'full_time_regular',
      }),
      expect.anything()
    );
  });

  it('falls back to full_time_contract when the candidate has no engagement_model', async () => {
    mockGetBenchListCandidates.mockResolvedValue({
      items: [candidate({ engagement_model: undefined })],
    });

    await handler(makeEvent());

    expect(mockCalculatePricing).toHaveBeenCalledWith(
      expect.objectContaining({ engagementModel: 'full_time_contract' }),
      expect.anything()
    );
  });

  it('returns null indicativeBillingRateLpa when expected_ctc is absent', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate({ expected_ctc: undefined })] });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);

    expect(body.data.candidates[0].indicativeBillingRateLpa).toBeNull();
    expect(mockCalculatePricing).not.toHaveBeenCalled();
  });

  it('treats expected_ctc === 0 as absent and returns null', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate({ expected_ctc: 0 })] });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);

    expect(body.data.candidates[0].indicativeBillingRateLpa).toBeNull();
    expect(mockCalculatePricing).not.toHaveBeenCalled();
  });

  it('never exposes raw expected_ctc in the response', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate()] });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);

    for (const item of body.data.candidates) {
      expect(item).not.toHaveProperty('expected_ctc');
      expect(item).not.toHaveProperty('expectedCtc');
    }
  });

  it('returns 500 when the pricing config fetch throws', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate()] });
    mockGetActivePricingConfig.mockRejectedValue(new Error('config unavailable'));

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
  });

  it('forbids external (non-internal) recruiters', async () => {
    const event = makeEvent();
    (event as any).auth.isInternal = false;

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
  });
});
