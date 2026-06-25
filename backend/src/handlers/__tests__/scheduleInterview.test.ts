import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Reschedule lifecycle integration test (#472, EC-3).
//
// Exercises the real recruiterTasks library (idempotent createTaskIfAbsent +
// resolveTaskByEntity) against a stateful in-memory DynamoDB fake, driving the
// actual scheduleInterview and recordInterviewFeedback handlers. This proves the
// chosen reschedule behaviour: scheduling twice for the same req+candidate does
// NOT create a duplicate pre_interview_reminder (dedup), and feedback resolves
// the single remaining reminder.
// ---------------------------------------------------------------------------

const mockGetShortlistEntry = vi.fn();
const mockUpdateShortlistPipelineStage = vi.fn();
const mockGetEffectiveStage = vi.fn();
const mockCreatePipelineActivity = vi.fn();
const mockTransitionPipelineStage = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  getShortlistEntry: (...args: unknown[]) => mockGetShortlistEntry(...args),
  updateShortlistPipelineStage: (...args: unknown[]) => mockUpdateShortlistPipelineStage(...args),
  // Used by recruiterTasks.loadTaskContext (errors are caught there → safe to stub as null).
  getRequirementById: vi.fn(async () => null),
  getCandidateById: vi.fn(async () => null),
  getRecentProfiles: vi.fn(async () => []),
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

// ---------------------------------------------------------------------------
// Subjects under test (real recruiterTasks)
// ---------------------------------------------------------------------------

import { handler as scheduleHandler } from '../recruiter/scheduleInterview.js';
import { handler as feedbackHandler } from '../recruiter/recordInterviewFeedback.js';
import { __setDocClientForTests, type RecruiterTask } from '../../lib/recruiterTasks.js';

// ---------------------------------------------------------------------------
// Stateful in-memory DynamoDB fake — stores Puts and serves them back so the
// dedup query and the resolve update operate on real persisted state.
// ---------------------------------------------------------------------------

function installStatefulMock(): { store: RecruiterTask[] } {
  const store: RecruiterTask[] = [];
  const send = vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, any> }) => {
    const name = cmd.constructor.name;
    if (name === 'QueryCommand') {
      const v = cmd.input.ExpressionAttributeValues;
      if (cmd.input.IndexName === 'entity-ref-index') {
        return {
          Items: store.filter(
            (t) => t.entity_ref === v[':e'] && t.type === v[':t'] && t.status === 'active'
          ),
        };
      }
      return { Items: store.filter((t) => t.owner_id === v[':o'] && t.status === 'active') };
    }
    if (name === 'PutCommand') {
      store.push(cmd.input.Item as RecruiterTask);
      return {};
    }
    if (name === 'UpdateCommand') {
      const key = cmd.input.Key as { owner_id: string; task_id: string };
      const item = store.find((t) => t.owner_id === key.owner_id && t.task_id === key.task_id);
      // Mirror the ConditionExpression "#status = :active": fail if not active.
      if (!item || item.status !== 'active') {
        throw new Error('ConditionalCheckFailedException');
      }
      item.status = 'completed';
      item.completed_by = cmd.input.ExpressionAttributeValues[':cb'];
      return {};
    }
    return {};
  });
  __setDocClientForTests({ send });
  return { store };
}

const REQ = 'req-1';
const CAND = 'cand-1';
const USER = 'rec-1';
const ENTITY_REF = `REQ#${REQ}#CAND#${CAND}`;

function scheduleEvent(round: number) {
  return baseEvent({
    round,
    interviewType: 'video',
    scheduledAt: '2026-07-01T10:00:00.000Z',
  });
}

function feedbackEvent() {
  return baseEvent({
    round: 1,
    rating: 'yes',
    feedbackText: 'Cleared the interview.',
    source: 'internal',
    decision: 'proceed',
  });
}

function baseEvent(body: unknown) {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/x',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: { method: 'POST', path: '/x', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    pathParameters: { requirementId: REQ, candidateId: CAND },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    auth: { userId: USER, role: 'recruiter', isInternal: true },
  } as unknown as APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } };
}

function statusCode(result: unknown): number {
  return (result as { statusCode: number }).statusCode;
}

describe('interview reminder lifecycle on reschedule (#472, EC-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetShortlistEntry.mockResolvedValue({
      requirement_id: REQ,
      candidate_id: CAND,
      interview_round_count: 0,
    });
    // interview_scheduled is valid both for re-scheduling and for recording feedback.
    mockGetEffectiveStage.mockReturnValue('interview_scheduled');
    mockCreatePipelineActivity.mockResolvedValue(undefined);
    mockTransitionPipelineStage.mockResolvedValue(undefined);
    mockUpdateShortlistPipelineStage.mockResolvedValue(undefined);
  });

  it('does not duplicate the reminder across reschedules and resolves the single one at feedback', async () => {
    const { store } = installStatefulMock();

    // Schedule, then reschedule the same req+candidate.
    expect(statusCode(await scheduleHandler(scheduleEvent(1)))).toBe(200);
    expect(statusCode(await scheduleHandler(scheduleEvent(2)))).toBe(200);

    // Dedup: exactly one active pre_interview_reminder exists despite two schedules.
    const reminders = store.filter((t) => t.type === 'pre_interview_reminder');
    expect(reminders).toHaveLength(1);
    expect(reminders[0].entity_ref).toBe(ENTITY_REF);
    expect(reminders[0].status).toBe('active');

    // Recording feedback resolves the single remaining reminder.
    expect(statusCode(await feedbackHandler(feedbackEvent()))).toBe(200);

    const reminderAfter = store.filter((t) => t.type === 'pre_interview_reminder');
    expect(reminderAfter).toHaveLength(1);
    expect(reminderAfter[0].status).toBe('completed');
    expect(reminderAfter[0].completed_by).toBe(USER);
  });
});
