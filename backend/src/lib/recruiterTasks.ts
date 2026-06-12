/**
 * Recruiter Task Queue (ticket #153).
 *
 * Self-contained library for the intelligent next-action task queue:
 *   - pure spec-builders + priority / due-date / snooze / sort / TTL helpers
 *     (unit-testable without AWS), and
 *   - idempotent DynamoDB operations against the RecruiterTasks table.
 *
 * Kept out of dynamodb.ts deliberately so the blast radius on existing test
 * mocks stays zero. Tests inject a fake client via __setDocClientForTests.
 */
import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';
import { getRequirementById, getCandidateById } from './dynamodb.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export const POOL_OWNER = 'POOL';
export const ENTITY_REF_INDEX = 'entity-ref-index';
export const TTL_DAYS = 30;
/** Active tasks overdue by more than this are swept to `expired` (terminal + TTL). */
export const EXPIRE_GRACE_DAYS = 14;
/** Screening is considered expired after this many days (matches shortlist gate). */
export const SCREENING_MAX_AGE_DAYS = 15;
/** A requirement with no shortlist activity for this long is "stale". */
export const STALE_REQUIREMENT_DAYS = 7;
/** Match score (0-100) at/above which a new profile becomes a screen-candidate task. */
export const MATCH_TASK_THRESHOLD = 70;
/** Pre-interview reminder "morning" anchor, in UTC hours (3.5 = 03:30 UTC = 9:00 AM IST). */
export const MORNING_ANCHOR_UTC_HOURS = 3.5;

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskType =
  // Event-driven (owned)
  | 'submit_to_client'
  | 'follow_up_client'
  | 'schedule_interview'
  | 'record_interview_feedback'
  | 'pre_interview_reminder'
  | 'send_offer'
  | 'follow_up_offer'
  | 'confirm_joining'
  | 'post_placement_checkin'
  // Scheduled sweep (pool)
  | 'screen_candidate'
  | 'rescreen_candidate'
  | 'source_candidates'
  | 'close_requirement'
  | 'review_bulk_import'
  | 'review_ingested_resume';

export type TaskStatus = 'active' | 'completed' | 'expired';
export type TaskPriority = 1 | 2 | 3 | 4;
export type SnoozePreset = '1h' | '4h' | 'tomorrow' | 'next_week' | 'custom';

export interface TaskContext {
  candidate_name?: string;
  requirement_title?: string;
  client_name?: string;
  match_score?: number;
  [key: string]: unknown;
}

/** A task before it is persisted (no id / status / timestamps yet). */
export interface TaskSpec {
  owner_id: string;
  type: TaskType;
  priority: TaskPriority;
  entity_ref: string;
  context: TaskContext;
  action_url: string;
  due_date: string;
}

export interface RecruiterTask {
  owner_id: string;
  task_id: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  entity_ref: string;
  context: TaskContext;
  action_url: string;
  due_date: string;
  generated_at: string;
  snoozed_until: string | null;
  snooze_count: number;
  completed_at: string | null;
  completed_by: string | null;
  expired_at?: string | null;
  ttl?: number;
}

/** Fixed priority per task type (ticket #153 priority model). */
export const TASK_PRIORITY: Record<TaskType, TaskPriority> = {
  record_interview_feedback: 1,
  pre_interview_reminder: 2,
  submit_to_client: 2,
  follow_up_client: 2,
  schedule_interview: 2,
  send_offer: 2,
  follow_up_offer: 2,
  confirm_joining: 3,
  post_placement_checkin: 3,
  screen_candidate: 3,
  rescreen_candidate: 3,
  review_ingested_resume: 3,
  source_candidates: 4,
  close_requirement: 4,
  review_bulk_import: 4,
};

/** Pipeline stage → task generated when transitioning into it (and its due window in days). */
const STAGE_TASK: Partial<Record<string, { type: TaskType; dueDays: number }>> = {
  offered: { type: 'follow_up_offer', dueDays: 3 },
  offer_accepted: { type: 'confirm_joining', dueDays: 2 },
  joined: { type: 'post_placement_checkin', dueDays: 21 },
};

/** Pipeline stage → prior task it auto-completes. */
export const STAGE_RESOLVES: Partial<Record<string, TaskType>> = {
  offered: 'send_offer',
  offer_accepted: 'follow_up_offer',
  joined: 'confirm_joining',
};

// ─── Pure helpers ──────────────────────────────────────────────────────────--

function addHours(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

function addDays(now: Date, days: number): string {
  return addHours(now, days * 24);
}

/** Composite reference, e.g. "REQ#r123#CAND#c456" — drives GSI1 lookups. */
export function compositeEntityRef(requirementId?: string, candidateId?: string): string {
  const parts: string[] = [];
  if (requirementId) parts.push(`REQ#${requirementId}`);
  if (candidateId) parts.push(`CAND#${candidateId}`);
  return parts.join('#');
}

function actionUrlFor(type: TaskType, requirementId?: string, candidateId?: string): string {
  switch (type) {
    case 'screen_candidate':
    case 'rescreen_candidate':
    case 'review_bulk_import':
    case 'review_ingested_resume':
      return candidateId ? `/recruiter/locate/${candidateId}` : '/recruiter/search';
    default:
      return requirementId ? `/recruiter/requirements/${requirementId}` : '/recruiter/search';
  }
}

/** Resolve a snooze preset to an absolute ISO timestamp. Past custom dates snap to now. */
export function resolveSnoozeUntil(preset: SnoozePreset, now: Date, customDate?: string): string {
  switch (preset) {
    case '1h':
      return addHours(now, 1);
    case '4h':
      return addHours(now, 4);
    case 'tomorrow':
      return addDays(now, 1);
    case 'next_week':
      return addDays(now, 7);
    case 'custom': {
      const target = customDate ? new Date(customDate) : now;
      if (Number.isNaN(target.getTime()) || target.getTime() <= now.getTime()) {
        return now.toISOString();
      }
      return target.toISOString();
    }
  }
}

/** Epoch seconds, `days` after the given ISO instant (terminal-state TTL). */
export function ttlEpochFrom(iso: string, days: number = TTL_DAYS): number {
  return Math.floor((new Date(iso).getTime() + days * 86_400_000) / 1000);
}

/** A task is visible if active and not currently snoozed. */
export function isTaskVisible(task: RecruiterTask, now: Date): boolean {
  if (task.status !== 'active') return false;
  if (task.snoozed_until && new Date(task.snoozed_until).getTime() > now.getTime()) return false;
  return true;
}

/** P1 → P4, then most-overdue (earliest due_date) first within a priority. */
export function sortTasks(tasks: RecruiterTask[]): RecruiterTask[] {
  return [...tasks].sort(
    (a, b) =>
      a.priority - b.priority ||
      new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  );
}

/** An active task overdue beyond the grace window should be expired. */
export function isExpirable(task: RecruiterTask, now: Date, graceDays: number = EXPIRE_GRACE_DAYS): boolean {
  if (task.status !== 'active') return false;
  return now.getTime() - new Date(task.due_date).getTime() > graceDays * 86_400_000;
}

function spec(
  type: TaskType,
  ownerId: string,
  requirementId: string | undefined,
  candidateId: string | undefined,
  context: TaskContext,
  dueDate: string
): TaskSpec {
  return {
    owner_id: ownerId,
    type,
    priority: TASK_PRIORITY[type],
    entity_ref: compositeEntityRef(requirementId, candidateId),
    context,
    action_url: actionUrlFor(type, requirementId, candidateId),
    due_date: dueDate,
  };
}

// ─── Event-driven spec builders ───────────────────────────────────────────────

interface PipelineSpecArgs {
  ownerId: string;
  requirementId: string;
  candidateId: string;
  context: TaskContext;
  now: Date;
}

export function buildSubmitToClientTask(p: PipelineSpecArgs): TaskSpec {
  return spec('submit_to_client', p.ownerId, p.requirementId, p.candidateId, p.context, addHours(p.now, 24));
}

export function buildFollowUpClientTask(p: PipelineSpecArgs): TaskSpec {
  return spec('follow_up_client', p.ownerId, p.requirementId, p.candidateId, p.context, addDays(p.now, 5));
}

/** Only positive client feedback generates a schedule-interview task. */
export function buildScheduleInterviewTask(p: PipelineSpecArgs & { rating: string }): TaskSpec | null {
  if (p.rating !== 'positive') return null;
  return spec('schedule_interview', p.ownerId, p.requirementId, p.candidateId, p.context, addHours(p.now, 24));
}

/** Due = interview start + 1h. */
export function buildRecordInterviewFeedbackTask(p: PipelineSpecArgs & { scheduledAt: string }): TaskSpec {
  const due = addHours(new Date(p.scheduledAt), 1);
  return spec('record_interview_feedback', p.ownerId, p.requirementId, p.candidateId, p.context, due);
}

/**
 * Pre-interview reminder. Due = min(morning of the interview day at the
 * MORNING_ANCHOR_UTC_HOURS anchor, interview start − 1h). Past due dates are
 * kept (consistent with how all other past-due tasks rely on the expiry grace
 * window), so an interview booked < 1h out or on the same day still gets a task.
 */
export function buildPreInterviewReminderTask(p: PipelineSpecArgs & { scheduledAt: string }): TaskSpec {
  const interview = new Date(p.scheduledAt);
  const anchorHours = Math.floor(MORNING_ANCHOR_UTC_HOURS);
  const anchorMinutes = Math.round((MORNING_ANCHOR_UTC_HOURS - anchorHours) * 60);
  const morningMs = Date.UTC(
    interview.getUTCFullYear(),
    interview.getUTCMonth(),
    interview.getUTCDate(),
    anchorHours,
    anchorMinutes
  );
  const oneHourBeforeMs = interview.getTime() - 3_600_000;
  const due = new Date(Math.min(morningMs, oneHourBeforeMs)).toISOString();
  return spec('pre_interview_reminder', p.ownerId, p.requirementId, p.candidateId, p.context, due);
}

/** Only a "proceed" interview decision generates a send-offer task. */
export function buildSendOfferTask(p: PipelineSpecArgs & { decision: string }): TaskSpec | null {
  if (p.decision !== 'proceed') return null;
  return spec('send_offer', p.ownerId, p.requirementId, p.candidateId, p.context, addHours(p.now, 48));
}

/** offered / offer_accepted / joined generate tasks; other stages produce nothing. */
export function buildStageTransitionTask(p: PipelineSpecArgs & { stage: string }): TaskSpec | null {
  const mapping = STAGE_TASK[p.stage];
  if (!mapping) return null;
  return spec(mapping.type, p.ownerId, p.requirementId, p.candidateId, p.context, addDays(p.now, mapping.dueDays));
}

// ─── Scheduled-sweep spec builder (pool tasks) ─────────────────────────────────

export interface SweepInput {
  now: Date;
  /** New profiles matching an active requirement at/above the threshold. */
  newMatches?: Array<{
    requirementId: string;
    candidateId: string;
    candidateName?: string;
    requirementTitle?: string;
    clientName?: string;
    matchScore: number;
  }>;
  /** Candidates whose screening expired while still progressing in a shortlist. */
  expiredScreenings?: Array<{
    requirementId: string;
    candidateId: string;
    candidateName?: string;
    requirementTitle?: string;
    clientName?: string;
  }>;
  /** Active requirements with no shortlist activity for 7+ days. */
  staleRequirements?: Array<{ requirementId: string; requirementTitle?: string; clientName?: string }>;
  /** Active requirements that already have a joined candidate. */
  filledRequirements?: Array<{ requirementId: string; requirementTitle?: string; clientName?: string }>;
  /** Bulk-imported profiles parsed with low confidence. */
  lowConfidenceImports?: Array<{ candidateId: string; candidateName?: string; confidence: number }>;
  /** Resumes ingested from email awaiting review. */
  ingestedResumes?: Array<{ candidateId: string; candidateName?: string }>;
}

function poolSpec(
  type: TaskType,
  requirementId: string | undefined,
  candidateId: string | undefined,
  context: TaskContext,
  dueDate: string
): TaskSpec {
  return spec(type, POOL_OWNER, requirementId, candidateId, context, dueDate);
}

/** Pure transform: time/condition-based pool tasks from already-fetched data. */
export function buildSweepTasks(input: SweepInput): TaskSpec[] {
  const now = input.now;
  const out: TaskSpec[] = [];

  for (const m of input.newMatches ?? []) {
    if (m.matchScore < MATCH_TASK_THRESHOLD) continue;
    out.push(
      poolSpec(
        'screen_candidate',
        m.requirementId,
        m.candidateId,
        {
          candidate_name: m.candidateName,
          requirement_title: m.requirementTitle,
          client_name: m.clientName,
          match_score: m.matchScore,
        },
        addDays(now, 2)
      )
    );
  }

  for (const s of input.expiredScreenings ?? []) {
    out.push(
      poolSpec(
        'rescreen_candidate',
        s.requirementId,
        s.candidateId,
        { candidate_name: s.candidateName, requirement_title: s.requirementTitle, client_name: s.clientName },
        addDays(now, 1)
      )
    );
  }

  for (const r of input.staleRequirements ?? []) {
    out.push(
      poolSpec(
        'source_candidates',
        r.requirementId,
        undefined,
        { requirement_title: r.requirementTitle, client_name: r.clientName },
        addDays(now, 1)
      )
    );
  }

  for (const r of input.filledRequirements ?? []) {
    out.push(
      poolSpec(
        'close_requirement',
        r.requirementId,
        undefined,
        { requirement_title: r.requirementTitle, client_name: r.clientName },
        addDays(now, 2)
      )
    );
  }

  for (const b of input.lowConfidenceImports ?? []) {
    out.push(
      poolSpec(
        'review_bulk_import',
        undefined,
        b.candidateId,
        { candidate_name: b.candidateName, confidence: b.confidence },
        addDays(now, 1)
      )
    );
  }

  for (const e of input.ingestedResumes ?? []) {
    out.push(
      poolSpec(
        'review_ingested_resume',
        undefined,
        e.candidateId,
        { candidate_name: e.candidateName },
        addDays(now, 1)
      )
    );
  }

  return out;
}

/** Build the full persisted item from a spec. Exported for unit tests. */
export function buildTaskItem(s: TaskSpec, now: Date = new Date()): RecruiterTask {
  const generatedAt = now.toISOString();
  return {
    owner_id: s.owner_id,
    task_id: `${generatedAt}#${randomUUID()}`,
    type: s.type,
    priority: s.priority,
    status: 'active',
    entity_ref: s.entity_ref,
    context: s.context,
    action_url: s.action_url,
    due_date: s.due_date,
    generated_at: generatedAt,
    snoozed_until: null,
    snooze_count: 0,
    completed_at: null,
    completed_by: null,
  };
}

// ─── DynamoDB operations ───────────────────────────────────────────────────--

let docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: config.region }),
  { marshallOptions: { removeUndefinedValues: true } }
);

/** Test seam: swap in a fake document client. */
export function __setDocClientForTests(client: unknown): void {
  docClient = client as DynamoDBDocumentClient;
}

function table(): string {
  return config.dynamodb.recruiterTasksTable;
}

/** Active tasks for a given entity_ref + type (idempotency / auto-complete). */
async function findActiveByEntityType(entityRef: string, type: TaskType): Promise<RecruiterTask[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: table(),
      IndexName: ENTITY_REF_INDEX,
      KeyConditionExpression: 'entity_ref = :e AND #type = :t',
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: { '#type': 'type', '#status': 'status' },
      ExpressionAttributeValues: { ':e': entityRef, ':t': type, ':active': 'active' },
    })
  );
  return (result.Items as RecruiterTask[]) || [];
}

/** Create a task unless an active one already exists for the same entity_ref + type. */
export async function createTaskIfAbsent(s: TaskSpec, now: Date = new Date()): Promise<RecruiterTask | null> {
  const existing = await findActiveByEntityType(s.entity_ref, s.type);
  if (existing.length > 0) return null;
  const item = buildTaskItem(s, now);
  await docClient.send(new PutCommand({ TableName: table(), Item: item }));
  return item;
}

async function markCompleted(ownerId: string, taskId: string, completedBy: string, now: Date): Promise<void> {
  const completedAt = now.toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: table(),
      Key: { owner_id: ownerId, task_id: taskId },
      UpdateExpression: 'SET #status = :c, completed_at = :ca, completed_by = :cb, #ttl = :ttl',
      ConditionExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':c': 'completed',
        ':ca': completedAt,
        ':cb': completedBy,
        ':ttl': ttlEpochFrom(completedAt),
        ':active': 'active',
      },
    })
  );
}

/** Auto-complete the active task(s) for an entity_ref + type. Returns count resolved. */
export async function resolveTaskByEntity(
  args: { entityRef: string; type: TaskType; completedBy: string },
  now: Date = new Date()
): Promise<number> {
  const items = await findActiveByEntityType(args.entityRef, args.type);
  for (const t of items) {
    try {
      await markCompleted(t.owner_id, t.task_id, args.completedBy, now);
    } catch {
      // Conditional check failed (already terminal) — ignore.
    }
  }
  return items.length;
}

/**
 * Auto-complete a candidate's active screen/rescreen tasks once they've been
 * screened. These are POOL-owned with entity_ref `REQ#<req>#CAND#<cand>`, and a
 * screening is requirement-agnostic — so resolve every active screen/rescreen
 * task for the candidate across requirements. Matched by querying the POOL
 * partition (the same access pattern the widget poll already uses) rather than
 * the entity_ref GSI, which would require the requirement id we don't have here.
 * Returns the count resolved.
 */
export async function resolveScreeningTasksForCandidate(
  args: { candidateId: string; completedBy: string },
  now: Date = new Date()
): Promise<number> {
  const pool = await queryActiveByOwner(POOL_OWNER);
  const suffix = `CAND#${args.candidateId}`;
  const targets = pool.filter(
    (t) =>
      (t.type === 'screen_candidate' || t.type === 'rescreen_candidate') &&
      t.entity_ref.endsWith(suffix)
  );
  for (const t of targets) {
    try {
      await markCompleted(t.owner_id, t.task_id, args.completedBy, now);
    } catch {
      // Conditional check failed (already terminal) — ignore.
    }
  }
  return targets.length;
}

async function queryActiveByOwner(ownerId: string): Promise<RecruiterTask[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: 'owner_id = :o',
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':o': ownerId, ':active': 'active' },
    })
  );
  return (result.Items as RecruiterTask[]) || [];
}

/** Owned tasks for the recruiter + all pool tasks, visible and sorted. */
export async function listActiveTasksForRecruiter(
  recruiterId: string,
  now: Date = new Date()
): Promise<RecruiterTask[]> {
  const [owned, pool] = await Promise.all([
    queryActiveByOwner(recruiterId),
    queryActiveByOwner(POOL_OWNER),
  ]);
  return sortTasks([...owned, ...pool].filter((t) => isTaskVisible(t, now)));
}

/** Snooze a task; increments snooze_count with no cap. Returns the new snoozed_until. */
export async function snoozeTaskById(
  args: { ownerId: string; taskId: string; preset: SnoozePreset; customDate?: string },
  now: Date = new Date()
): Promise<string> {
  const until = resolveSnoozeUntil(args.preset, now, args.customDate);
  await docClient.send(
    new UpdateCommand({
      TableName: table(),
      Key: { owner_id: args.ownerId, task_id: args.taskId },
      UpdateExpression: 'SET snoozed_until = :u ADD snooze_count :one',
      ExpressionAttributeValues: { ':u': until, ':one': 1 },
    })
  );
  return until;
}

/** Explicit completion via the widget. */
export async function completeTaskById(
  args: { ownerId: string; taskId: string; completedBy: string },
  now: Date = new Date()
): Promise<void> {
  await markCompleted(args.ownerId, args.taskId, args.completedBy, now);
}

/** Move a task to the terminal `expired` state with a 30-day TTL. */
export async function expireTaskById(
  args: { ownerId: string; taskId: string },
  now: Date = new Date()
): Promise<void> {
  const expiredAt = now.toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: table(),
      Key: { owner_id: args.ownerId, task_id: args.taskId },
      UpdateExpression: 'SET #status = :e, expired_at = :ea, #ttl = :ttl',
      ConditionExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':e': 'expired',
        ':ea': expiredAt,
        ':ttl': ttlEpochFrom(expiredAt),
        ':active': 'active',
      },
    })
  );
}

/** Scan all active tasks (sweep helper; table is small at current scale). */
async function scanActiveTasks(): Promise<RecruiterTask[]> {
  const items: RecruiterTask[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: table(),
        FilterExpression: '#status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':active': 'active' },
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...((result.Items as RecruiterTask[]) || []));
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}

/** Expire active tasks overdue beyond the grace window. Returns count expired. */
export async function expireStaleTasks(now: Date = new Date()): Promise<number> {
  const active = await scanActiveTasks();
  let count = 0;
  for (const t of active) {
    if (!isExpirable(t, now)) continue;
    try {
      await expireTaskById({ ownerId: t.owner_id, taskId: t.task_id }, now);
      count++;
    } catch {
      // already terminal — ignore
    }
  }
  return count;
}

// ─── Fire-and-forget wrappers (never throw — task gen must not break handlers) ─

export async function safeGenerateTask(s: TaskSpec | null): Promise<void> {
  if (!s) return;
  try {
    await createTaskIfAbsent(s);
  } catch (err) {
    console.error('[recruiterTasks] task generation failed:', err);
  }
}

export async function safeResolveTask(args: {
  entityRef: string;
  type: TaskType;
  completedBy: string;
}): Promise<void> {
  try {
    await resolveTaskByEntity(args);
  } catch (err) {
    console.error('[recruiterTasks] task resolution failed:', err);
  }
}

export async function safeResolveScreeningTasks(args: {
  candidateId: string;
  completedBy: string;
}): Promise<void> {
  try {
    await resolveScreeningTasksForCandidate(args);
  } catch (err) {
    console.error('[recruiterTasks] screening task resolution failed:', err);
  }
}

/** Best-effort display context for a pipeline task (candidate + requirement names). */
export async function loadTaskContext(requirementId?: string, candidateId?: string): Promise<TaskContext> {
  try {
    const [req, cand] = await Promise.all([
      requirementId ? getRequirementById(requirementId) : Promise.resolve(null),
      candidateId ? getCandidateById(candidateId) : Promise.resolve(null),
    ]);
    return {
      candidate_name: cand?.full_name,
      requirement_title: req?.job_title,
      client_name: req?.client_name,
    };
  } catch {
    return {};
  }
}

// ─── Sweep data gatherers (scan other tables; small at current scale) ──────────

/** Low-confidence bulk-imported profiles from batches updated recently. */
export async function fetchLowConfidenceImports(
  now: Date = new Date(),
  windowMs: number = 24 * 3_600_000
): Promise<NonNullable<SweepInput['lowConfidenceImports']>> {
  const out: NonNullable<SweepInput['lowConfidenceImports']> = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: config.dynamodb.bulkImportBatchesTable,
        ExclusiveStartKey: lastKey,
      })
    );
    for (const batch of (result.Items as Array<{ updated_at?: string; files?: Array<{ candidate_id?: string; candidate_name?: string; confidence?: number; status?: string }> }>) || []) {
      if (batch.updated_at && now.getTime() - new Date(batch.updated_at).getTime() > windowMs) continue;
      for (const f of batch.files ?? []) {
        if (f.candidate_id && typeof f.confidence === 'number' && f.confidence < 0.7) {
          out.push({ candidateId: f.candidate_id, candidateName: f.candidate_name, confidence: f.confidence });
        }
      }
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return out;
}

/** Resumes ingested from email within the recent window. */
export async function fetchRecentIngestedResumes(
  now: Date = new Date(),
  windowMs: number = 2 * 3_600_000
): Promise<NonNullable<SweepInput['ingestedResumes']>> {
  const out: NonNullable<SweepInput['ingestedResumes']> = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: config.dynamodb.emailIngestLogTable,
        FilterExpression: '#status = :done',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':done': 'completed' },
        ExclusiveStartKey: lastKey,
      })
    );
    for (const entry of (result.Items as Array<{ processed_at?: string; candidate_ids?: string[] }>) || []) {
      if (entry.processed_at && now.getTime() - new Date(entry.processed_at).getTime() > windowMs) continue;
      for (const candidateId of entry.candidate_ids ?? []) {
        out.push({ candidateId });
      }
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return out;
}
