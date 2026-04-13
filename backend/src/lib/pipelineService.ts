import { randomUUID } from 'crypto';
import type { PipelineStage, PipelineActivityType, PipelineActivityItem } from '../types/index.js';
import { savePipelineActivity, updateShortlistPipelineStage } from './dynamodb.js';

// Valid stage transitions: from -> allowed targets
const VALID_TRANSITIONS: Record<string, string[]> = {
  shortlisted: ['submitted_to_client', 'not_suitable', 'on_hold'],
  submitted_to_client: ['client_reviewed', 'rejected_by_client', 'candidate_withdrawn', 'on_hold'],
  submitted: ['client_reviewed', 'rejected_by_client', 'candidate_withdrawn', 'on_hold'], // legacy
  client_reviewed: ['interview_scheduled', 'rejected_by_client', 'candidate_withdrawn', 'on_hold'],
  interview_scheduled: ['interview_completed', 'interview_scheduled', 'rejected_by_client', 'candidate_withdrawn', 'on_hold'],
  interview_completed: ['offered', 'rejected_by_client', 'candidate_withdrawn', 'on_hold'],
  offered: ['offer_accepted', 'rejected_by_client', 'candidate_withdrawn', 'on_hold'],
  offer_accepted: ['joined', 'candidate_withdrawn', 'on_hold'],
  on_hold: ['shortlisted', 'submitted_to_client', 'client_reviewed', 'interview_scheduled', 'offered'],
};

// Exit states from which no forward transition is allowed (except on_hold reactivation)
const EXIT_STATES = new Set(['joined', 'rejected_by_client', 'candidate_withdrawn', 'not_suitable', 'rejected']);

// Active progression stages (for summary counting)
export const ACTIVE_STAGES = new Set([
  'shortlisted', 'submitted_to_client', 'submitted', 'client_reviewed',
  'interview_scheduled', 'interview_completed', 'offered', 'offer_accepted', 'joined',
]);

export const EXIT_STAGES = new Set([
  'rejected_by_client', 'rejected', 'candidate_withdrawn', 'on_hold',
]);

export const NOT_SUITABLE_STAGES = new Set(['not_suitable']);

/**
 * Get the effective pipeline stage from a shortlist item.
 * Falls back to status if pipeline_stage is not set (backward compat).
 */
export function getEffectiveStage(item: { pipeline_stage?: string; status: string }): string {
  return item.pipeline_stage || item.status;
}

/**
 * Validate whether a stage transition is allowed.
 */
export function isValidTransition(fromStage: string, toStage: string): boolean {
  if (EXIT_STATES.has(fromStage)) return false;
  const allowed = VALID_TRANSITIONS[fromStage];
  if (!allowed) return false;
  return allowed.includes(toStage);
}

/**
 * Create and save a pipeline activity record.
 */
export async function createPipelineActivity(
  requirementId: string,
  candidateId: string,
  activityType: PipelineActivityType,
  createdBy: string,
  data: Record<string, unknown>
): Promise<PipelineActivityItem> {
  const now = new Date().toISOString();
  const item: PipelineActivityItem = {
    requirement_candidate_key: `${requirementId}#${candidateId}`,
    activity_id: `${now}#${randomUUID()}`,
    activity_type: activityType,
    created_by: createdBy,
    created_at: now,
    data,
  };
  await savePipelineActivity(item);
  return item;
}

/**
 * Transition a shortlist item to a new pipeline stage with activity logging.
 */
export async function transitionPipelineStage(
  requirementId: string,
  candidateId: string,
  fromStage: string,
  toStage: PipelineStage,
  userId: string,
  reason?: string,
  extraShortlistFields?: Record<string, unknown>
): Promise<void> {
  await Promise.all([
    updateShortlistPipelineStage(requirementId, candidateId, toStage, userId, {
      ...extraShortlistFields,
      last_activity_at: new Date().toISOString(),
    }),
    createPipelineActivity(requirementId, candidateId, 'stage_change', userId, {
      from_stage: fromStage,
      to_stage: toStage,
      reason,
    }),
  ]);
}
