import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpdateCtcInDb = vi.fn().mockResolvedValue(undefined);
const mockGetCandidateById = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  updateCandidateCtc: (...args: unknown[]) => mockUpdateCtcInDb(...args),
  getCandidateById: (...args: unknown[]) => mockGetCandidateById(...args),
}));

const mockRecalcShortlistRatesForCandidate = vi.fn().mockResolvedValue(undefined);

vi.mock('../../lib/recalcShortlistRates.js', () => ({
  recalcShortlistRatesForCandidate: (...args: unknown[]) => mockRecalcShortlistRatesForCandidate(...args),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (_roles: string[], handler: Function) => handler,
}));

vi.mock('../../lib/audit.js', () => ({
  logAuditEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockCandidate = {
  candidate_id: 'cand_1',
  full_name: 'Alice Smith',
  total_experience: 6,
  expected_ctc: 15,
};

function makeEvent(body: unknown): APIGatewayProxyEventV2 {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { authorization: 'Bearer test-token' },
    requestContext: {} as any,
    routeKey: '',
    rawPath: '',
    rawQueryString: '',
    isBase64Encoded: false,
    auth: { userId: 'recruiter_1', email: 'recruiter@quadzero.com', role: 'recruiter', isInternal: true },
  } as any;
}

function makeExternalEvent(body: unknown): APIGatewayProxyEventV2 {
  return {
    ...makeEvent(body),
    auth: { userId: 'recruiter_2', email: 'ext@vendor.com', role: 'recruiter', isInternal: false },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateCandidateCtc handler', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCandidateById.mockResolvedValue(mockCandidate);
    mockRecalcShortlistRatesForCandidate.mockResolvedValue(undefined);
    mockUpdateCtcInDb.mockResolvedValue(undefined);
    const mod = await import('../recruiter/updateCandidateCtc.js');
    handler = mod.handler;
  });

  it('should update CTC and trigger shortlist rate recalculation', async () => {
    const event = makeEvent({ candidateId: 'cand_1', expectedCtc: 20 });

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.expectedCtc).toBe(20);
    expect(mockUpdateCtcInDb).toHaveBeenCalledWith('cand_1', 20, undefined);
    expect(mockGetCandidateById).toHaveBeenCalledWith('cand_1');
    expect(mockRecalcShortlistRatesForCandidate).toHaveBeenCalledWith('cand_1', 20, 6);
  });

  it('should succeed with no shortlist entries (recalc is no-op)', async () => {
    mockRecalcShortlistRatesForCandidate.mockResolvedValue(undefined);

    const event = makeEvent({ candidateId: 'cand_1', expectedCtc: 20 });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(mockRecalcShortlistRatesForCandidate).toHaveBeenCalledOnce();
  });

  it('should be non-fatal when getCandidateById throws during recalc', async () => {
    mockGetCandidateById.mockRejectedValue(new Error('DynamoDB error'));

    const event = makeEvent({ candidateId: 'cand_1', expectedCtc: 20 });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(mockRecalcShortlistRatesForCandidate).not.toHaveBeenCalled();
  });

  it('should be non-fatal when recalc itself throws', async () => {
    mockRecalcShortlistRatesForCandidate.mockRejectedValue(new Error('recalc failed'));

    const event = makeEvent({ candidateId: 'cand_1', expectedCtc: 20 });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(mockUpdateCtcInDb).toHaveBeenCalled();
  });

  it('should return 403 for non-internal users', async () => {
    const event = makeExternalEvent({ candidateId: 'cand_1', expectedCtc: 20 });

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(mockUpdateCtcInDb).not.toHaveBeenCalled();
    expect(mockRecalcShortlistRatesForCandidate).not.toHaveBeenCalled();
  });

  it('should return 404 on ConditionalCheckFailedException', async () => {
    const err = new Error('ConditionalCheckFailedException');
    err.name = 'ConditionalCheckFailedException';
    mockUpdateCtcInDb.mockRejectedValue(err);

    const event = makeEvent({ candidateId: 'nonexistent', expectedCtc: 20 });

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('should use experience from candidate profile for recalc', async () => {
    mockGetCandidateById.mockResolvedValue({ ...mockCandidate, total_experience: 10 });

    const event = makeEvent({ candidateId: 'cand_1', expectedCtc: 25 });

    await handler(event);

    expect(mockRecalcShortlistRatesForCandidate).toHaveBeenCalledWith('cand_1', 25, 10);
  });

  it('should default experience to 0 when candidate has no total_experience', async () => {
    mockGetCandidateById.mockResolvedValue({ ...mockCandidate, total_experience: undefined });

    const event = makeEvent({ candidateId: 'cand_1', expectedCtc: 20 });

    await handler(event);

    expect(mockRecalcShortlistRatesForCandidate).toHaveBeenCalledWith('cand_1', 20, 0);
  });
});
