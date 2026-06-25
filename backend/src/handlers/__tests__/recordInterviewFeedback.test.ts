import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetShortlistEntry = vi.fn();
const mockUpdateShortlistPipelineStage = vi.fn();
const mockGetEffectiveStage = vi.fn();
const mockCreatePipelineActivity = vi.fn();
const mockTransitionPipelineStage = vi.fn();
const mockSafeResolveTask = vi.fn();
const mockSafeGenerateTask = vi.fn();
const mockLoadTaskContext = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  getShortlistEntry: (...args: unknown[]) => mockGetShortlistEntry(...args),
  updateShortlistPipelineStage: (...args: unknown[]) => mockUpdateShortlistPipelineStage(...args),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (
    _roles: string[],
    handler: (event: unknown) => Promise<unknown>
  ) => handler,
}));

vi.mock('../../lib/audit.js', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('../../lib/pipelineService.js', () => ({
  getEffectiveStage: (...args: unknown[]) => mockGetEffectiveStage(...args),
  createPipelineActivity: (...args: unknown[]) => mockCreatePipelineActivity(...args),
  transitionPipelineStage: (...args: unknown[]) => mockTransitionPipelineStage(...args),
}));

// Keep the real compositeEntityRef + buildSendOfferTask (pure helpers) so the
// entity_ref assertions are meaningful; only stub the side-effecting wrappers.
vi.mock('../../lib/recruiterTasks.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/recruiterTasks.js')>();
  return {
    ...actual,
    safeResolveTask: (...args: unknown[]) => mockSafeResolveTask(...args),
    safeGenerateTask: (...args: unknown[]) => mockSafeGenerateTask(...args),
    loadTaskContext: (...args: unknown[]) => mockLoadTaskContext(...args),
  };
});

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { handler } from '../recruiter/recordInterviewFeedback.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REQ = 'req-1';
const CAND = 'cand-1';
const USER = 'rec-1';
const ENTITY_REF = `REQ#${REQ}#CAND#${CAND}`;

function makeEvent(
  decision: 'proceed' | 'reject' | 'hold' = 'proceed',
  requirementId = REQ,
  candidateId = CAND,
  userId = USER
): APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } } {
  const body = {
    round: 1,
    rating: 'yes',
    feedbackText: 'Solid technical round.',
    source: 'internal',
    decision,
  };
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: `/recruiter/requirements/${requirementId}/candidates/${candidateId}/interview-feedback`,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: {
        method: 'POST',
        path: `/recruiter/requirements/${requirementId}/candidates/${candidateId}/interview-feedback`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    pathParameters: { requirementId, candidateId },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    auth: { userId, role: 'recruiter', isInternal: true },
  } as unknown as APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } };
}

function parseResponse(result: unknown) {
  const r = result as { statusCode: number; body: string };
  return { statusCode: r.statusCode, body: JSON.parse(r.body) };
}

function resolvedTypes(): string[] {
  return mockSafeResolveTask.mock.calls.map((c) => (c[0] as { type: string }).type);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('recordInterviewFeedback handler — pre_interview_reminder resolution (#472)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetShortlistEntry.mockResolvedValue({ requirement_id: REQ, candidate_id: CAND });
    mockGetEffectiveStage.mockReturnValue('interview_scheduled');
    mockCreatePipelineActivity.mockResolvedValue(undefined);
    mockTransitionPipelineStage.mockResolvedValue(undefined);
    mockUpdateShortlistPipelineStage.mockResolvedValue(undefined);
    mockLoadTaskContext.mockResolvedValue({});
    mockSafeResolveTask.mockResolvedValue(undefined);
    mockSafeGenerateTask.mockResolvedValue(undefined);
  });

  // AC-2 — regression: pre-fix the reminder was never resolved (only one
  // safeResolveTask call existed, for record_interview_feedback).
  it('resolves pre_interview_reminder when feedback is recorded (regression)', async () => {
    const result = parseResponse(await handler(makeEvent('proceed')));
    expect(result.statusCode).toBe(200);
    expect(resolvedTypes()).toContain('pre_interview_reminder');
  });

  // AC-1 — correct entity ref + completedBy.
  it('resolves pre_interview_reminder with the correct entity_ref and completedBy', async () => {
    await handler(makeEvent('proceed'));
    expect(mockSafeResolveTask).toHaveBeenCalledWith({
      entityRef: ENTITY_REF,
      type: 'pre_interview_reminder',
      completedBy: USER,
    });
  });

  // AC-3 — all three decision outcomes close the reminder.
  it.each(['proceed', 'reject', 'hold'] as const)(
    'resolves pre_interview_reminder on a "%s" decision',
    async (decision) => {
      const result = parseResponse(await handler(makeEvent(decision)));
      expect(result.statusCode).toBe(200);
      expect(resolvedTypes()).toContain('pre_interview_reminder');
    }
  );

  // AC-4 — event-driven: the reminder resolve is co-located with the
  // record_interview_feedback resolve, not driven by a sweep. Both resolves
  // fire on the same feedback submission.
  it('resolves both record_interview_feedback and pre_interview_reminder on submission', async () => {
    await handler(makeEvent('proceed'));
    const types = resolvedTypes();
    expect(types).toContain('record_interview_feedback');
    expect(types).toContain('pre_interview_reminder');
  });

  // EC-1 — no active reminder (e.g. manually completed beforehand): the resolve
  // no-ops silently and the handler still returns 200.
  it('succeeds even when there is no active pre_interview_reminder', async () => {
    mockSafeResolveTask.mockResolvedValue(undefined);
    const result = parseResponse(await handler(makeEvent('hold')));
    expect(result.statusCode).toBe(200);
    expect(resolvedTypes()).toContain('pre_interview_reminder');
  });
});
