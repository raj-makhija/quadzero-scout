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

function makeEvent(authOverride?: unknown): APIGatewayProxyEventV2 {
  const base = {
    body: null,
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
    expect(arg.htmlBody).toContain('1 resource across 1 role');
  });

  it('sends a header-only (0 resources) email for an empty bench list without crashing', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [] });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const arg = mockSendBenchListEmail.mock.calls[0][0];
    expect(arg.htmlBody).toContain('0 resources across 0 roles');
  });

  it('HTML output has branded header before the table, merged role cell, badge, stacked tags, and footer', async () => {
    mockGetBenchListCandidates.mockResolvedValue({ items: [candidate(), candidate({ candidate_id: 'c2' })] });

    await handler(makeEvent());

    const html = mockSendBenchListEmail.mock.calls[0][0].htmlBody;
    // Branded header div appears before the first <table tag.
    const tableIdx = html.indexOf('<table');
    const beforeTable = html.slice(0, tableIdx);
    expect(beforeTable).toContain('Quadzero');
    expect(beforeTable).toContain('Bench List');
    // No standalone Roles column header.
    expect(html).not.toMatch(/>Roles<\/th>/);
    // Count badge.
    expect(html).toMatch(/background-color[^"]*font-weight:bold/);
    // Stacked inline-block tags for multi-value fields (no comma-soup).
    expect(html).toContain('display:inline-block');
    expect(html).not.toContain('border:1px solid');
    // Confidentiality footer after </table>.
    const tableEnd = html.lastIndexOf('</table>');
    expect(html.slice(tableEnd)).toContain('intended for the named recipient only');
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
});
