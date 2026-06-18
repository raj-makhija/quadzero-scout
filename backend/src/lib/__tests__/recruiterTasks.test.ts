import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TASK_PRIORITY,
  POOL_OWNER,
  compositeEntityRef,
  resolveSnoozeUntil,
  ttlEpochFrom,
  isTaskVisible,
  sortTasks,
  isExpirable,
  buildSubmitToClientTask,
  buildFollowUpClientTask,
  buildScheduleInterviewTask,
  buildRecordInterviewFeedbackTask,
  buildPreInterviewReminderTask,
  MORNING_ANCHOR_UTC_HOURS,
  buildSendOfferTask,
  buildStageTransitionTask,
  buildSweepTasks,
  selectUnscreenedCandidates,
  selectStaleScreenedCandidates,
  selectMatchTasksFromCache,
  FOUND_MATCHES_PER_REQ,
  UNSCREENED_WINDOW_DAYS,
  UNSCREENED_SCAN_CAP,
  RESCREEN_SCAN_CAP,
  SCREENING_MAX_AGE_DAYS,
  buildTaskItem,
  createTaskIfAbsent,
  resolveTaskByEntity,
  resolveScreeningTasksForCandidate,
  resolveFoundTasksForRequirement,
  listActiveTasksForRecruiter,
  snoozeTaskById,
  completeTaskById,
  expireStaleTasks,
  __setDocClientForTests,
  type RecruiterTask,
  type TaskSpec,
} from '../recruiterTasks.js';

const NOW = new Date('2026-06-01T00:00:00.000Z');

const PIPELINE_ARGS = {
  ownerId: 'rec-1',
  requirementId: 'r1',
  candidateId: 'c1',
  context: { candidate_name: 'Asha', requirement_title: 'Backend Dev', client_name: 'Acme' },
  now: NOW,
};

function hoursBetween(a: string, b: Date): number {
  return (new Date(a).getTime() - b.getTime()) / 3_600_000;
}

function makeTask(overrides: Partial<RecruiterTask>): RecruiterTask {
  return {
    owner_id: 'rec-1',
    task_id: 't',
    type: 'submit_to_client',
    priority: 2,
    status: 'active',
    entity_ref: 'REQ#r1#CAND#c1',
    context: {},
    action_url: '/x',
    due_date: NOW.toISOString(),
    generated_at: NOW.toISOString(),
    snoozed_until: null,
    snooze_count: 0,
    completed_at: null,
    completed_by: null,
    ...overrides,
  };
}

// ─── Pure helpers ─────────────────────────────────────────────────────────---

describe('compositeEntityRef', () => {
  it('combines requirement and candidate', () => {
    expect(compositeEntityRef('r1', 'c1')).toBe('REQ#r1#CAND#c1');
  });
  it('handles requirement-only and candidate-only refs', () => {
    expect(compositeEntityRef('r1')).toBe('REQ#r1');
    expect(compositeEntityRef(undefined, 'c1')).toBe('CAND#c1');
  });
});

describe('resolveSnoozeUntil', () => {
  it('resolves fixed presets', () => {
    expect(hoursBetween(resolveSnoozeUntil('1h', NOW), NOW)).toBe(1);
    expect(hoursBetween(resolveSnoozeUntil('4h', NOW), NOW)).toBe(4);
    expect(hoursBetween(resolveSnoozeUntil('tomorrow', NOW), NOW)).toBe(24);
    expect(hoursBetween(resolveSnoozeUntil('next_week', NOW), NOW)).toBe(24 * 7);
  });
  it('uses a future custom date as-is', () => {
    const future = '2026-06-10T00:00:00.000Z';
    expect(resolveSnoozeUntil('custom', NOW, future)).toBe(future);
  });
  it('snaps a past custom date to now', () => {
    expect(resolveSnoozeUntil('custom', NOW, '2026-05-01T00:00:00.000Z')).toBe(NOW.toISOString());
  });
});

describe('ttlEpochFrom', () => {
  it('is 30 days after the instant, in epoch seconds', () => {
    expect(ttlEpochFrom(NOW.toISOString())).toBe(Math.floor((NOW.getTime() + 30 * 86_400_000) / 1000));
  });
});

describe('isTaskVisible', () => {
  it('hides completed/expired tasks', () => {
    expect(isTaskVisible(makeTask({ status: 'completed' }), NOW)).toBe(false);
    expect(isTaskVisible(makeTask({ status: 'expired' }), NOW)).toBe(false);
  });
  it('hides tasks snoozed into the future, shows once snooze passes', () => {
    expect(isTaskVisible(makeTask({ snoozed_until: '2026-06-02T00:00:00.000Z' }), NOW)).toBe(false);
    expect(isTaskVisible(makeTask({ snoozed_until: '2026-05-31T00:00:00.000Z' }), NOW)).toBe(true);
  });
});

describe('sortTasks', () => {
  it('orders by priority then most-overdue first', () => {
    const a = makeTask({ task_id: 'a', priority: 2, due_date: '2026-06-05T00:00:00Z' });
    const b = makeTask({ task_id: 'b', priority: 1, due_date: '2026-06-10T00:00:00Z' });
    const c = makeTask({ task_id: 'c', priority: 2, due_date: '2026-06-01T00:00:00Z' });
    expect(sortTasks([a, b, c]).map((t) => t.task_id)).toEqual(['b', 'c', 'a']);
  });
});

describe('isExpirable', () => {
  it('is true only for active tasks overdue beyond the grace window', () => {
    expect(isExpirable(makeTask({ due_date: '2026-05-01T00:00:00Z' }), NOW)).toBe(true); // >14d overdue
    expect(isExpirable(makeTask({ due_date: '2026-05-29T00:00:00Z' }), NOW)).toBe(false); // 3d overdue
    expect(isExpirable(makeTask({ status: 'completed', due_date: '2026-05-01T00:00:00Z' }), NOW)).toBe(false);
  });
});

// ─── Event-driven builders ─────────────────────────────────────────────────--

describe('event-driven task builders', () => {
  it('submit_to_client: P2, due +24h', () => {
    const t = buildSubmitToClientTask(PIPELINE_ARGS);
    expect(t.type).toBe('submit_to_client');
    expect(t.priority).toBe(2);
    expect(hoursBetween(t.due_date, NOW)).toBe(24);
  });

  it('follow_up_client: P2, due +5 days', () => {
    const t = buildFollowUpClientTask(PIPELINE_ARGS);
    expect(t.priority).toBe(2);
    expect(hoursBetween(t.due_date, NOW)).toBe(24 * 5);
  });

  it('schedule_interview: only positive feedback, P2, due +24h', () => {
    expect(buildScheduleInterviewTask({ ...PIPELINE_ARGS, rating: 'neutral' })).toBeNull();
    expect(buildScheduleInterviewTask({ ...PIPELINE_ARGS, rating: 'negative' })).toBeNull();
    const t = buildScheduleInterviewTask({ ...PIPELINE_ARGS, rating: 'positive' })!;
    expect(t.type).toBe('schedule_interview');
    expect(t.priority).toBe(2);
    expect(hoursBetween(t.due_date, NOW)).toBe(24);
  });

  it('record_interview_feedback: P1, due interview + 1h', () => {
    const scheduledAt = '2026-06-03T10:00:00.000Z';
    const t = buildRecordInterviewFeedbackTask({ ...PIPELINE_ARGS, scheduledAt });
    expect(t.priority).toBe(1);
    expect(new Date(t.due_date).toISOString()).toBe('2026-06-03T11:00:00.000Z');
  });

  it('pre_interview_reminder: P2, due = min(morning anchor, interview − 1h)', () => {
    expect(MORNING_ANCHOR_UTC_HOURS).toBe(3.5);

    // Mid-afternoon interview: morning anchor (03:30) is earlier than 1h-before (08:30) → anchor wins.
    const afternoon = buildPreInterviewReminderTask({ ...PIPELINE_ARGS, scheduledAt: '2026-06-03T09:30:00.000Z' });
    expect(afternoon.type).toBe('pre_interview_reminder');
    expect(afternoon.priority).toBe(2);
    expect(new Date(afternoon.due_date).toISOString()).toBe('2026-06-03T03:30:00.000Z');

    // Early-morning interview: 1h-before (03:00) is earlier than morning anchor (03:30) → 1h-before wins.
    const earlyMorning = buildPreInterviewReminderTask({ ...PIPELINE_ARGS, scheduledAt: '2026-06-03T04:00:00.000Z' });
    expect(new Date(earlyMorning.due_date).toISOString()).toBe('2026-06-03T03:00:00.000Z');

    // Tie: interview exactly 1h after the anchor → both equal 03:30.
    const tie = buildPreInterviewReminderTask({ ...PIPELINE_ARGS, scheduledAt: '2026-06-03T04:30:00.000Z' });
    expect(new Date(tie.due_date).toISOString()).toBe('2026-06-03T03:30:00.000Z');

    // Far-future interview: due on the morning of that specific day, not "now + offset".
    const farFuture = buildPreInterviewReminderTask({ ...PIPELINE_ARGS, scheduledAt: '2026-07-15T10:00:00.000Z' });
    expect(new Date(farFuture.due_date).toISOString()).toBe('2026-07-15T03:30:00.000Z');
  });

  it('pre_interview_reminder: short-notice interview still produces a task with a past due date', () => {
    // Interview 30 min out → 1h-before is in the past; task is still created (not dropped).
    const scheduledAt = new Date(NOW.getTime() + 30 * 60_000).toISOString();
    const t = buildPreInterviewReminderTask({ ...PIPELINE_ARGS, scheduledAt });
    expect(t).not.toBeNull();
    expect(t.type).toBe('pre_interview_reminder');
    expect(new Date(t.due_date).getTime()).toBe(new Date(scheduledAt).getTime() - 3_600_000);
  });

  it('pre_interview_reminder: same-day booking with a past morning anchor still produces a task', () => {
    // Interview later today; the morning anchor of today is already in the past at NOW.
    const t = buildPreInterviewReminderTask({ ...PIPELINE_ARGS, scheduledAt: '2026-06-01T10:00:00.000Z' });
    expect(t).not.toBeNull();
    expect(new Date(t.due_date).toISOString()).toBe('2026-06-01T03:30:00.000Z');
  });

  it('send_offer: only proceed decision, P2, due +48h', () => {
    expect(buildSendOfferTask({ ...PIPELINE_ARGS, decision: 'reject' })).toBeNull();
    expect(buildSendOfferTask({ ...PIPELINE_ARGS, decision: 'hold' })).toBeNull();
    const t = buildSendOfferTask({ ...PIPELINE_ARGS, decision: 'proceed' })!;
    expect(t.priority).toBe(2);
    expect(hoursBetween(t.due_date, NOW)).toBe(48);
  });

  it('stage transitions: offered/offer_accepted/joined generate tasks, others do not', () => {
    const offered = buildStageTransitionTask({ ...PIPELINE_ARGS, stage: 'offered' })!;
    expect(offered.type).toBe('follow_up_offer');
    expect(offered.priority).toBe(2);
    expect(hoursBetween(offered.due_date, NOW)).toBe(24 * 3);

    const accepted = buildStageTransitionTask({ ...PIPELINE_ARGS, stage: 'offer_accepted' })!;
    expect(accepted.type).toBe('confirm_joining');
    expect(accepted.priority).toBe(3);
    expect(hoursBetween(accepted.due_date, NOW)).toBe(24 * 2);

    const joined = buildStageTransitionTask({ ...PIPELINE_ARGS, stage: 'joined' })!;
    expect(joined.type).toBe('post_placement_checkin');
    expect(joined.priority).toBe(3);
    expect(hoursBetween(joined.due_date, NOW)).toBe(24 * 21);

    for (const stage of ['rejected_by_client', 'on_hold', 'candidate_withdrawn', 'client_reviewed']) {
      expect(buildStageTransitionTask({ ...PIPELINE_ARGS, stage })).toBeNull();
    }
  });
});

// ─── Scheduled sweep ─────────────────────────────────────────────────────────

describe('buildSweepTasks', () => {
  it('produces a POOL task for each of the six conditions', () => {
    const specs = buildSweepTasks({
      now: NOW,
      newMatches: [{ requirementId: 'r1', candidateId: 'c1', matchScore: 82 }],
      staleScreenedCandidates: [{ candidateId: 'c2' }],
      staleRequirements: [{ requirementId: 'r3' }],
      filledRequirements: [{ requirementId: 'r4' }],
      lowConfidenceImports: [{ candidateId: 'c5', confidence: 0.4 }],
      unscreenedCandidates: [{ candidateId: 'c6' }],
    });
    const types = specs.map((s) => s.type).sort();
    expect(types).toEqual(
      ['close_requirement', 'found_candidate_for_requirement', 'rescreen_candidate', 'review_bulk_import', 'screen_candidate', 'source_candidates'].sort()
    );
    expect(specs.every((s) => s.owner_id === POOL_OWNER)).toBe(true);
  });

  it('emits found_candidate_for_requirement (REQ#..#CAND#.. ref) for a ≥70 match', () => {
    const specs = buildSweepTasks({
      now: NOW,
      newMatches: [{ requirementId: 'r1', candidateId: 'c1', matchScore: 82 }],
    });
    expect(specs).toHaveLength(1);
    expect(specs[0].type).toBe('found_candidate_for_requirement');
    expect(specs[0].entity_ref).toBe('REQ#r1#CAND#c1');
    expect(specs[0].action_url).toBe('/recruiter/locate/c1');
  });

  it('emits found_candidate_for_requirement at the inclusive 70 boundary', () => {
    const specs = buildSweepTasks({
      now: NOW,
      newMatches: [{ requirementId: 'r1', candidateId: 'c1', matchScore: 70 }],
    });
    expect(specs).toHaveLength(1);
    expect(specs[0].type).toBe('found_candidate_for_requirement');
  });

  it('drops matches below the 70% threshold', () => {
    const specs = buildSweepTasks({ now: NOW, newMatches: [{ requirementId: 'r1', candidateId: 'c1', matchScore: 65 }] });
    expect(specs).toHaveLength(0);
  });

  it('emits screen_candidate (CAND#.. ref, no REQ prefix) for an unscreened candidate', () => {
    const specs = buildSweepTasks({ now: NOW, unscreenedCandidates: [{ candidateId: 'c6' }] });
    expect(specs).toHaveLength(1);
    expect(specs[0].type).toBe('screen_candidate');
    expect(specs[0].entity_ref).toBe('CAND#c6');
    expect(specs[0].action_url).toBe('/recruiter/locate/c6');
    // due window +2 days (ticket #391 AC)
    expect(hoursBetween(specs[0].due_date, NOW)).toBe(48);
  });

  it('emits no screen_candidate task when unscreenedCandidates is absent', () => {
    const specs = buildSweepTasks({ now: NOW });
    expect(specs.filter((s) => s.type === 'screen_candidate')).toHaveLength(0);
  });

  it('emits rescreen_candidate (CAND#.. ref, no REQ prefix) for a stale-screened candidate', () => {
    const specs = buildSweepTasks({ now: NOW, staleScreenedCandidates: [{ candidateId: 'c7', candidateName: 'Ravi' }] });
    expect(specs).toHaveLength(1);
    expect(specs[0].type).toBe('rescreen_candidate');
    expect(specs[0].entity_ref).toBe('CAND#c7');
    expect(specs[0].action_url).toBe('/recruiter/locate/c7');
    expect(specs[0].context.candidate_name).toBe('Ravi');
    expect(hoursBetween(specs[0].due_date, NOW)).toBe(48);
  });

  it('emits no rescreen_candidate task when staleScreenedCandidates is absent', () => {
    const specs = buildSweepTasks({ now: NOW });
    expect(specs.filter((s) => s.type === 'rescreen_candidate')).toHaveLength(0);
  });

  it('uses the fixed pool-task priorities', () => {
    expect(TASK_PRIORITY.found_candidate_for_requirement).toBe(1);
    expect(TASK_PRIORITY.screen_candidate).toBe(3);
    expect(TASK_PRIORITY.rescreen_candidate).toBe(3);
    expect(TASK_PRIORITY.source_candidates).toBe(4);
    expect(TASK_PRIORITY.close_requirement).toBe(4);
    expect(TASK_PRIORITY.review_bulk_import).toBe(4);
  });
});

describe('selectUnscreenedCandidates (universal screen scan)', () => {
  const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

  it('picks never-screened candidates created within the window', () => {
    const { candidates, skipped } = selectUnscreenedCandidates(
      [{ candidate_id: 'c1', full_name: 'Asha', created_at: iso(1) }],
      NOW
    );
    expect(candidates).toEqual([{ candidateId: 'c1', candidateName: 'Asha' }]);
    expect(skipped).toBe(0);
  });

  it('drops an already-screened candidate (last_screened_at present)', () => {
    const { candidates } = selectUnscreenedCandidates(
      [{ candidate_id: 'c1', created_at: iso(1), last_screened_at: iso(0) }],
      NOW
    );
    expect(candidates).toHaveLength(0);
  });

  it('drops candidates created outside the N-day window', () => {
    const { candidates } = selectUnscreenedCandidates(
      [
        { candidate_id: 'fresh', created_at: iso(UNSCREENED_WINDOW_DAYS - 1) },
        { candidate_id: 'stale', created_at: iso(UNSCREENED_WINDOW_DAYS + 1) },
      ],
      NOW
    );
    expect(candidates.map((c) => c.candidateId)).toEqual(['fresh']);
  });

  it('caps at K, reports the skipped overflow, and keeps most-recent first', () => {
    const profiles = Array.from({ length: UNSCREENED_SCAN_CAP + 5 }, (_, i) => ({
      candidate_id: `c${i}`,
      created_at: iso(1),
    }));
    const { candidates, skipped } = selectUnscreenedCandidates(profiles, NOW);
    expect(candidates).toHaveLength(UNSCREENED_SCAN_CAP);
    expect(skipped).toBe(5);
    expect(candidates[0].candidateId).toBe('c0');
  });

  it('ignores profiles missing candidate_id or created_at', () => {
    const { candidates } = selectUnscreenedCandidates(
      [{ full_name: 'No id', created_at: iso(1) }, { candidate_id: 'c1' }],
      NOW
    );
    expect(candidates).toHaveLength(0);
  });
});

describe('selectStaleScreenedCandidates (universal rescreen scan)', () => {
  const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

  it('picks candidates screened longer ago than the max age', () => {
    const { candidates, skipped } = selectStaleScreenedCandidates(
      [{ candidate_id: 'c1', full_name: 'Asha', last_screened_at: iso(SCREENING_MAX_AGE_DAYS + 1) }],
      NOW
    );
    expect(candidates).toEqual([{ candidateId: 'c1', candidateName: 'Asha' }]);
    expect(skipped).toBe(0);
  });

  it('drops a freshly-screened candidate (within the max age)', () => {
    const { candidates } = selectStaleScreenedCandidates(
      [{ candidate_id: 'c1', last_screened_at: iso(SCREENING_MAX_AGE_DAYS - 1) }],
      NOW
    );
    expect(candidates).toHaveLength(0);
  });

  it('drops never-screened candidates (no last_screened_at)', () => {
    const { candidates } = selectStaleScreenedCandidates(
      [{ candidate_id: 'c1', created_at: iso(1) }],
      NOW
    );
    expect(candidates).toHaveLength(0);
  });

  it('orders oldest-screened first', () => {
    const { candidates } = selectStaleScreenedCandidates(
      [
        { candidate_id: 'newer', last_screened_at: iso(SCREENING_MAX_AGE_DAYS + 2) },
        { candidate_id: 'oldest', last_screened_at: iso(SCREENING_MAX_AGE_DAYS + 30) },
        { candidate_id: 'middle', last_screened_at: iso(SCREENING_MAX_AGE_DAYS + 10) },
      ],
      NOW
    );
    expect(candidates.map((c) => c.candidateId)).toEqual(['oldest', 'middle', 'newer']);
  });

  it('caps at K (oldest first), reports the skipped overflow', () => {
    const profiles = Array.from({ length: RESCREEN_SCAN_CAP + 5 }, (_, i) => ({
      candidate_id: `c${i}`,
      // larger i → screened longer ago → sorts earlier
      last_screened_at: iso(SCREENING_MAX_AGE_DAYS + 1 + i),
    }));
    const { candidates, skipped } = selectStaleScreenedCandidates(profiles, NOW);
    expect(candidates).toHaveLength(RESCREEN_SCAN_CAP);
    expect(skipped).toBe(5);
    expect(candidates[0].candidateId).toBe(`c${RESCREEN_SCAN_CAP + 4}`);
  });

  it('ignores profiles missing candidate_id', () => {
    const { candidates } = selectStaleScreenedCandidates(
      [{ full_name: 'No id', last_screened_at: iso(SCREENING_MAX_AGE_DAYS + 1) }],
      NOW
    );
    expect(candidates).toHaveLength(0);
  });
});

describe('selectMatchTasksFromCache (found-candidate match-cache scan)', () => {
  const entry = (id: string, score: number) => ({ candidate_id: id, rank: 0, score });

  it('includes a cache entry at the inclusive 70 boundary and drops 69', () => {
    const { matches } = selectMatchTasksFromCache(
      [entry('c70', 70), entry('c69', 69)],
      new Set()
    );
    expect(matches).toEqual([{ candidateId: 'c70', score: 70 }]);
  });

  it('excludes already-shortlisted/joined candidates even when above threshold', () => {
    const { matches } = selectMatchTasksFromCache(
      [entry('shortlisted', 95), entry('open', 80)],
      new Set(['shortlisted'])
    );
    expect(matches).toEqual([{ candidateId: 'open', score: 80 }]);
  });

  it('caps at FOUND_MATCHES_PER_REQ and reports the skipped overflow', () => {
    const ranked = Array.from({ length: FOUND_MATCHES_PER_REQ + 1 }, (_, i) => entry(`c${i}`, 90));
    const { matches, skipped } = selectMatchTasksFromCache(ranked, new Set());
    expect(matches).toHaveLength(FOUND_MATCHES_PER_REQ);
    expect(skipped).toBe(1);
  });

  it('emits exactly FOUND_MATCHES_PER_REQ with no overflow at the cap', () => {
    const ranked = Array.from({ length: FOUND_MATCHES_PER_REQ }, (_, i) => entry(`c${i}`, 90));
    const { matches, skipped } = selectMatchTasksFromCache(ranked, new Set());
    expect(matches).toHaveLength(FOUND_MATCHES_PER_REQ);
    expect(skipped).toBe(0);
  });

  it('returns no matches and no error for an empty ranked list', () => {
    const { matches, skipped } = selectMatchTasksFromCache([], new Set());
    expect(matches).toHaveLength(0);
    expect(skipped).toBe(0);
  });
});

// ─── DynamoDB operations (mocked client) ──────────────────────────────────────

interface MockState {
  entityItems: RecruiterTask[];
  ownerItems: Record<string, RecruiterTask[]>;
  scanItems: RecruiterTask[];
  puts: unknown[];
  updates: Array<Record<string, unknown>>;
}

function installMock(state: Partial<MockState>): MockState {
  const full: MockState = {
    entityItems: [],
    ownerItems: {},
    scanItems: [],
    puts: [],
    updates: [],
    ...state,
  };
  const send = vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, any> }) => {
    const name = cmd.constructor.name;
    if (name === 'QueryCommand') {
      if (cmd.input.IndexName === 'entity-ref-index') return { Items: full.entityItems };
      const owner = cmd.input.ExpressionAttributeValues[':o'];
      return { Items: full.ownerItems[owner] || [] };
    }
    if (name === 'ScanCommand') return { Items: full.scanItems };
    if (name === 'PutCommand') {
      full.puts.push(cmd.input.Item);
      return {};
    }
    if (name === 'UpdateCommand') {
      full.updates.push(cmd.input);
      return {};
    }
    return {};
  });
  __setDocClientForTests({ send });
  return full;
}

const SPEC: TaskSpec = {
  owner_id: 'rec-1',
  type: 'submit_to_client',
  priority: 2,
  entity_ref: 'REQ#r1#CAND#c1',
  context: {},
  action_url: '/x',
  due_date: NOW.toISOString(),
};

describe('createTaskIfAbsent (idempotency)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes a new task when none active for entity_ref + type', async () => {
    const state = installMock({ entityItems: [] });
    const item = await createTaskIfAbsent(SPEC, NOW);
    expect(item).not.toBeNull();
    expect(state.puts).toHaveLength(1);
  });

  it('is a no-op when an active task already exists', async () => {
    const state = installMock({ entityItems: [makeTask({})] });
    const item = await createTaskIfAbsent(SPEC, NOW);
    expect(item).toBeNull();
    expect(state.puts).toHaveLength(0);
  });

  it('pre_interview_reminder: re-scheduling is a no-op while an active reminder exists', async () => {
    const reminderSpec = buildPreInterviewReminderTask({ ...PIPELINE_ARGS, scheduledAt: '2026-06-03T09:30:00.000Z' });

    // First schedule: no active reminder → task is written.
    const first = installMock({ entityItems: [] });
    const created = await createTaskIfAbsent(reminderSpec, NOW);
    expect(created).not.toBeNull();
    expect(first.puts).toHaveLength(1);

    // Re-schedule for the same req+candidate while the reminder is still active → dedup fires, no Put.
    const second = installMock({
      entityItems: [makeTask({ type: 'pre_interview_reminder', entity_ref: 'REQ#r1#CAND#c1' })],
    });
    const dup = await createTaskIfAbsent(reminderSpec, NOW);
    expect(dup).toBeNull();
    expect(second.puts).toHaveLength(0);
  });

  it('dedupes a universal screen_candidate when one is already active for the candidate', async () => {
    const screenSpec = buildSweepTasks({ now: NOW, unscreenedCandidates: [{ candidateId: 'c1' }] })[0];
    const state = installMock({
      entityItems: [makeTask({ type: 'screen_candidate', entity_ref: 'CAND#c1' })],
    });
    const item = await createTaskIfAbsent(screenSpec, NOW);
    expect(item).toBeNull();
    expect(state.puts).toHaveLength(0);
  });
});

describe('resolveTaskByEntity (auto-complete)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks the matching active task completed with completed_by + TTL', async () => {
    const state = installMock({ entityItems: [makeTask({ owner_id: 'rec-1', task_id: 't9' })] });
    const count = await resolveTaskByEntity({ entityRef: 'REQ#r1#CAND#c1', type: 'submit_to_client', completedBy: 'rec-2' }, NOW);
    expect(count).toBe(1);
    const upd = state.updates[0];
    expect(upd.ExpressionAttributeValues[':c']).toBe('completed');
    expect(upd.ExpressionAttributeValues[':cb']).toBe('rec-2');
    expect(upd.ExpressionAttributeValues[':ttl']).toBe(ttlEpochFrom(NOW.toISOString()));
  });
});

describe('resolveScreeningTasksForCandidate (auto-complete on screen)', () => {
  beforeEach(() => vi.clearAllMocks());

  it("completes the candidate's screen + rescreen pool tasks across requirements", async () => {
    const state = installMock({
      ownerItems: {
        POOL: [
          makeTask({ owner_id: POOL_OWNER, task_id: 's1', type: 'screen_candidate', entity_ref: 'CAND#c1' }),
          makeTask({ owner_id: POOL_OWNER, task_id: 's2', type: 'rescreen_candidate', entity_ref: 'CAND#c1' }),
          makeTask({ owner_id: POOL_OWNER, task_id: 'found', type: 'found_candidate_for_requirement', entity_ref: 'REQ#r1#CAND#c1' }),
          makeTask({ owner_id: POOL_OWNER, task_id: 'other-type', type: 'close_requirement', entity_ref: 'REQ#r1#CAND#c1' }),
          makeTask({ owner_id: POOL_OWNER, task_id: 'other-cand', type: 'screen_candidate', entity_ref: 'CAND#c2' }),
        ],
      },
    });
    const count = await resolveScreeningTasksForCandidate({ candidateId: 'c1', completedBy: 'rec-2' }, NOW);
    // Only the screen + rescreen tasks for c1 — the found_candidate_for_requirement task is left untouched.
    expect(count).toBe(2);
    expect(state.updates).toHaveLength(2);
    expect(state.updates.every((u) => (u.ExpressionAttributeValues as Record<string, unknown>)[':c'] === 'completed')).toBe(true);
    expect(state.updates.every((u) => (u.ExpressionAttributeValues as Record<string, unknown>)[':cb'] === 'rec-2')).toBe(true);
  });

  it('is a no-op when the candidate has no open screen tasks', async () => {
    const state = installMock({ ownerItems: { POOL: [] } });
    const count = await resolveScreeningTasksForCandidate({ candidateId: 'c1', completedBy: 'rec-2' }, NOW);
    expect(count).toBe(0);
    expect(state.updates).toHaveLength(0);
  });
});

describe('resolveFoundTasksForRequirement (close/on-hold cleanup)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves all found-candidate tasks for the requirement using a QueryCommand on the POOL partition', async () => {
    const state = installMock({
      ownerItems: {
        POOL: [
          makeTask({ owner_id: POOL_OWNER, task_id: 'fc1', type: 'found_candidate_for_requirement', entity_ref: 'REQ#req-1#CAND#c1' }),
          makeTask({ owner_id: POOL_OWNER, task_id: 'fc2', type: 'found_candidate_for_requirement', entity_ref: 'REQ#req-1#CAND#c2' }),
        ],
      },
    });
    const count = await resolveFoundTasksForRequirement({ requirementId: 'req-1', completedBy: 'rec-2' }, NOW);
    expect(count).toBe(2);
    expect(state.updates).toHaveLength(2);
    expect(state.updates.every((u) => (u.ExpressionAttributeValues as Record<string, unknown>)[':c'] === 'completed')).toBe(true);
    expect(state.updates.every((u) => (u.ExpressionAttributeValues as Record<string, unknown>)[':cb'] === 'rec-2')).toBe(true);
  });

  it('does not resolve found-candidate tasks belonging to a different requirement', async () => {
    const state = installMock({
      ownerItems: {
        POOL: [
          makeTask({ owner_id: POOL_OWNER, task_id: 'fc-target', type: 'found_candidate_for_requirement', entity_ref: 'REQ#req-1#CAND#c1' }),
          makeTask({ owner_id: POOL_OWNER, task_id: 'fc-other', type: 'found_candidate_for_requirement', entity_ref: 'REQ#req-2#CAND#c1' }),
        ],
      },
    });
    const count = await resolveFoundTasksForRequirement({ requirementId: 'req-1', completedBy: 'rec-2' }, NOW);
    expect(count).toBe(1);
    expect(state.updates).toHaveLength(1);
    const updatedKey = (state.updates[0].Key as Record<string, unknown>)['task_id'];
    expect(updatedKey).toBe('fc-target');
  });

  it('does not resolve other task types bound to the same requirement', async () => {
    const state = installMock({
      ownerItems: {
        POOL: [
          makeTask({ owner_id: POOL_OWNER, task_id: 'fc', type: 'found_candidate_for_requirement', entity_ref: 'REQ#req-1#CAND#c1' }),
          makeTask({ owner_id: POOL_OWNER, task_id: 'src', type: 'source_candidates', entity_ref: 'REQ#req-1' }),
          makeTask({ owner_id: POOL_OWNER, task_id: 'cl', type: 'close_requirement', entity_ref: 'REQ#req-1' }),
        ],
      },
    });
    const count = await resolveFoundTasksForRequirement({ requirementId: 'req-1', completedBy: 'rec-2' }, NOW);
    expect(count).toBe(1);
    expect(state.updates).toHaveLength(1);
  });

  it('is a no-op when there are no open found-candidate tasks', async () => {
    const state = installMock({ ownerItems: { POOL: [] } });
    const count = await resolveFoundTasksForRequirement({ requirementId: 'req-1', completedBy: 'rec-2' }, NOW);
    expect(count).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it('uses a QueryCommand keyed on the POOL owner partition, not a ScanCommand', async () => {
    const commands: string[] = [];
    const send = vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      commands.push(cmd.constructor.name);
      if (cmd.constructor.name === 'QueryCommand') return { Items: [] };
      return {};
    });
    __setDocClientForTests({ send });
    await resolveFoundTasksForRequirement({ requirementId: 'req-1', completedBy: 'rec-2' }, NOW);
    expect(commands).not.toContain('ScanCommand');
    expect(commands).toContain('QueryCommand');
    const query = send.mock.calls.find(
      ([cmd]) => cmd.constructor.name === 'QueryCommand'
    );
    expect(query).toBeDefined();
    const input = query![0].input as Record<string, unknown>;
    const vals = input.ExpressionAttributeValues as Record<string, unknown>;
    expect(vals[':o']).toBe(POOL_OWNER);
  });
});

describe('listActiveTasksForRecruiter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges owned + pool tasks, drops snoozed, and sorts', async () => {
    installMock({
      ownerItems: {
        'rec-1': [
          makeTask({ task_id: 'owned-p2', priority: 2, due_date: '2026-06-05T00:00:00Z' }),
          makeTask({ task_id: 'snoozed', priority: 1, snoozed_until: '2026-06-02T00:00:00Z' }),
        ],
        POOL: [makeTask({ task_id: 'pool-p1', owner_id: POOL_OWNER, priority: 1, due_date: '2026-06-09T00:00:00Z' })],
      },
    });
    const tasks = await listActiveTasksForRecruiter('rec-1', NOW);
    expect(tasks.map((t) => t.task_id)).toEqual(['pool-p1', 'owned-p2']);
  });
});

describe('snoozeTaskById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets snoozed_until and increments snooze_count unconditionally', async () => {
    const state = installMock({});
    const until = await snoozeTaskById({ ownerId: 'rec-1', taskId: 't', preset: '1h' }, NOW);
    expect(hoursBetween(until, NOW)).toBe(1);
    const upd = state.updates[0];
    expect(upd.UpdateExpression).toContain('ADD snooze_count :one');
    expect(upd.ExpressionAttributeValues[':one']).toBe(1);
  });
});

describe('completeTaskById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks completed with a 30-day TTL', async () => {
    const state = installMock({});
    await completeTaskById({ ownerId: 'rec-1', taskId: 't', completedBy: 'rec-1' }, NOW);
    expect(state.updates[0].ExpressionAttributeValues[':ttl']).toBe(ttlEpochFrom(NOW.toISOString()));
  });
});

describe('expireStaleTasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expires only tasks overdue beyond the grace window, applying a TTL', async () => {
    const state = installMock({
      scanItems: [
        makeTask({ task_id: 'old', due_date: '2026-05-01T00:00:00Z' }),
        makeTask({ task_id: 'recent', due_date: '2026-05-30T00:00:00Z' }),
      ],
    });
    const count = await expireStaleTasks(NOW);
    expect(count).toBe(1);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].ExpressionAttributeValues[':e']).toBe('expired');
    expect(state.updates[0].ExpressionAttributeValues[':ttl']).toBe(ttlEpochFrom(NOW.toISOString()));
  });
});

describe('buildTaskItem', () => {
  it('produces an active task with zero snooze_count and a sortable id', () => {
    const item = buildTaskItem(SPEC, NOW);
    expect(item.status).toBe('active');
    expect(item.snooze_count).toBe(0);
    expect(item.task_id.startsWith(NOW.toISOString())).toBe(true);
  });
});
