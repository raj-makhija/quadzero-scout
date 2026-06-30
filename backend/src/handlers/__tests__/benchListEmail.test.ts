import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetBenchListCandidates = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  getBenchListCandidates: (...args: unknown[]) => mockGetBenchListCandidates(...args),
}));

const mockSendBenchListEmail = vi.fn();

vi.mock('../../lib/emailService.js', () => ({
  sendBenchListEmail: (...args: unknown[]) => mockSendBenchListEmail(...args),
}));

// withAuth is bypassed so the handler is exercised directly with an event whose
// `auth` we control per-test (matches the benchList.test.ts pattern).
vi.mock('../../lib/auth.js', () => ({
  withAuth: (_roles: string[], handler: Function) => handler,
}));

const mockLogAuditEvent = vi.fn();

vi.mock('../../lib/audit.js', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
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
    primary_skills: ['java'],
    engagement_model: 'full_time_contract',
    expected_ctc: 12,
    ...overrides,
  };
}

function makeEvent(authOverride?: unknown, body?: Record<string, unknown> | null): APIGatewayProxyEventV2 {
  const base = {
    body: body === undefined ? null : body === null ? null : JSON.stringify(body),
    headers: { authorization: 'Bearer test-token' },
    requestContext: {} as any,
    routeKey: '',
    rawPath: '',
    rawQueryString: '',
    isBase64Encoded: false,
    auth: { userId: 'recruiter_1', email: 'recruiter@quadzero.com', role: 'recruiter', isInternal: true },
  };
  if (authOverride !== undefined) {
    (base as any).auth = authOverride;
  }
  return base as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('benchListEmail handler', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSendBenchListEmail.mockResolvedValue(undefined);
    mockLogAuditEvent.mockReturnValue(undefined);
    const mod = await import('../recruiter/benchListEmail.js');
    handler = mod.handler;
  });

  it('emails the bench list to the authenticated recruiter and returns 200', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate(), candidate({ candidate_id: 'c2' })] });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    expect(mockSendBenchListEmail).toHaveBeenCalledTimes(1);
    const arg = mockSendBenchListEmail.mock.calls[0][0];
    expect(arg.toEmail).toBe('recruiter@quadzero.com');
    expect(arg.subject).toMatch(/^Bench List — /);
    // HTML body contains the grouped table for the (2) candidates.
    expect(arg.htmlBody).toContain('<table');
    expect(arg.htmlBody).toContain('Role / Category');
    expect(arg.htmlBody).toContain('2 resources across 1 role');
  });

  it('excludes not_interested candidates before building the email', async () => {
    mockGetBenchListCandidates.mockResolvedValue({
      items: [candidate(), candidate({ candidate_id: 'c2', not_interested: true })],
    });

    await handler(makeEvent());

    const arg = mockSendBenchListEmail.mock.calls[0][0];
    expect(arg.htmlBody).toContain('1 resources across 1 role');
  });

  it('sends a header-only (0 resources) email for an empty bench list without crashing', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [] });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const arg = mockSendBenchListEmail.mock.calls[0][0];
    expect(arg.htmlBody).toContain('0 resources across 0 roles');
  });

  it('returns 500 when the SES send fails', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate()] });
    mockSendBenchListEmail.mockRejectedValue(new Error('SES unavailable'));

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
  });

  it('rejects non-internal recruiters with 403 and does not send an email', async () => {
    const result = await handler(
      makeEvent({ userId: 'ext_1', email: 'ext@partner.com', role: 'recruiter', isInternal: false })
    );

    expect(result.statusCode).toBe(403);
    expect(mockSendBenchListEmail).not.toHaveBeenCalled();
    expect(mockGetBenchListCandidates).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests (no auth context) with 403 and does not send an email', async () => {
    const result = await handler(makeEvent(null));

    expect(result.statusCode).toBe(403);
    expect(mockSendBenchListEmail).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // External send path (recipientEmail in body)
  // -------------------------------------------------------------------------

  it('sends to recipientEmail when provided and returns 200', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate()] });

    const result = await handler(makeEvent(undefined, { recipientEmail: 'partner@acme.com' }));

    expect(result.statusCode).toBe(200);
    expect(mockSendBenchListEmail).toHaveBeenCalledTimes(1);
    expect(mockSendBenchListEmail.mock.calls[0][0].toEmail).toBe('partner@acme.com');
  });

  it('accepts a plus-addressed recipient email', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate()] });

    const result = await handler(makeEvent(undefined, { recipientEmail: 'user+tag@partner.com' }));

    expect(result.statusCode).toBe(200);
    expect(mockSendBenchListEmail.mock.calls[0][0].toEmail).toBe('user+tag@partner.com');
  });

  it('rejects a missing recipientEmail (empty string) with 400', async () => {
    const result = await handler(makeEvent(undefined, { recipientEmail: '' }));

    expect(result.statusCode).toBe(400);
    expect(mockSendBenchListEmail).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only recipientEmail with 400', async () => {
    const result = await handler(makeEvent(undefined, { recipientEmail: '   ' }));

    expect(result.statusCode).toBe(400);
    expect(mockSendBenchListEmail).not.toHaveBeenCalled();
  });

  it('rejects a malformed recipientEmail (no @) with 400', async () => {
    const result = await handler(makeEvent(undefined, { recipientEmail: 'missing-at-sign.com' }));

    expect(result.statusCode).toBe(400);
    expect(mockSendBenchListEmail).not.toHaveBeenCalled();
  });

  it('rejects a malformed recipientEmail (no local part) with 400', async () => {
    const result = await handler(makeEvent(undefined, { recipientEmail: '@missing-local.com' }));

    expect(result.statusCode).toBe(400);
    expect(mockSendBenchListEmail).not.toHaveBeenCalled();
  });

  it('rejects a malformed recipientEmail (not-an-email) with 400', async () => {
    const result = await handler(makeEvent(undefined, { recipientEmail: 'not-an-email' }));

    expect(result.statusCode).toBe(400);
    expect(mockSendBenchListEmail).not.toHaveBeenCalled();
  });

  it('writes an audit record after a successful external send', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate()] });

    const result = await handler(makeEvent(undefined, { recipientEmail: 'partner@acme.com' }));

    expect(result.statusCode).toBe(200);
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    const auditCall = mockLogAuditEvent.mock.calls[0];
    expect(auditCall[0]).toMatchObject({ userId: 'recruiter_1', email: 'recruiter@quadzero.com' });
    expect(auditCall[2]).toMatchObject({
      action: 'BENCH_LIST_EMAIL_EXTERNAL',
      entityType: 'bench_list',
      entityId: 'partner@acme.com',
      metadata: { recipientEmail: 'partner@acme.com' },
    });
  });

  it('does not write an audit record for the "Email to me" path', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate()] });

    await handler(makeEvent());

    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it('does not include a rate column in HTML when includeRates is false', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate({ expected_ctc: 24 })] });

    await handler(makeEvent(undefined, { recipientEmail: 'partner@acme.com', includeRates: false }));

    const htmlBody = mockSendBenchListEmail.mock.calls[0][0].htmlBody;
    expect(htmlBody).not.toContain('Indicative Rate');
  });

  it('includes a rate column in HTML when includeRates is true', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate({ expected_ctc: 24 })] });

    await handler(makeEvent(undefined, { recipientEmail: 'partner@acme.com', includeRates: true }));

    const htmlBody = mockSendBenchListEmail.mock.calls[0][0].htmlBody;
    expect(htmlBody).toContain('Indicative Rate');
    // 24 LPA / 12 = ₹2L/month
    expect(htmlBody).toContain('₹2L/month');
  });

  it('returns 500 when SES fails on the external send path', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate()] });
    mockSendBenchListEmail.mockRejectedValue(new Error('SES rejected'));

    const result = await handler(makeEvent(undefined, { recipientEmail: 'partner@acme.com' }));

    expect(result.statusCode).toBe(500);
  });

  it('does not send an audit record when SES fails (error is thrown before logAuditEvent)', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate()] });
    mockSendBenchListEmail.mockRejectedValue(new Error('SES rejected'));

    await handler(makeEvent(undefined, { recipientEmail: 'partner@acme.com' }));

    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it('excludes not_interested candidates from the external send', async () => {
    mockGetBenchListCandidates.mockResolvedValue({
      items: [
        candidate({ candidate_id: 'c1' }),
        candidate({ candidate_id: 'c2', not_interested: true }),
      ],
    });

    await handler(makeEvent(undefined, { recipientEmail: 'partner@acme.com' }));

    const htmlBody = mockSendBenchListEmail.mock.calls[0][0].htmlBody;
    expect(htmlBody).toContain('1 resources across 1 role');
  });

  it('sends without crashing for an empty bench list on the external path', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [] });

    const result = await handler(makeEvent(undefined, { recipientEmail: 'partner@acme.com' }));

    expect(result.statusCode).toBe(200);
    const htmlBody = mockSendBenchListEmail.mock.calls[0][0].htmlBody;
    expect(htmlBody).toContain('0 resources across 0 roles');
  });
});
