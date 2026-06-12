/**
 * One-time migration for ticket #390 (task-queue type rename).
 *
 * The rename:
 *   review_ingested_resume → screen_candidate (candidate-only screening)
 *   screen_candidate       → found_candidate_for_requirement (requirement-bound match)
 *   rescreen_candidate     — unchanged
 *
 * All affected types are POOL-owned and the scheduled sweep is idempotent, so we
 * simply clear the stale active POOL tasks; the next sweep rebuilds them under
 * the new names. This avoids tasks lingering with an unmapped/mis-typed name.
 *
 * Two stale shapes are cleared:
 *   1. type === 'review_ingested_resume'  — the string is gone from the union.
 *   2. type === 'screen_candidate' AND entity_ref starts with 'REQ#'
 *        — the OLD requirement-bound match. After the rename, 'screen_candidate'
 *          is candidate-only (entity_ref 'CAND#<id>', no REQ prefix), so the
 *          REQ-prefixed entity_ref unambiguously identifies a pre-rename row and
 *          never matches a legitimately-new screen_candidate task. This keeps the
 *          migration idempotent even if a sweep runs between deploy and migration.
 *
 * Owned/pipeline tasks (owner_id !== 'POOL') are never touched.
 * Not auto-invoked at deploy — run manually, once per stage.
 *
 * Usage:
 *   npx tsx scripts/migrateRenameTaskTypes.ts            # dry run (default; no writes)
 *   npx tsx scripts/migrateRenameTaskTypes.ts --dry-run  # dry run (explicit)
 *   npx tsx scripts/migrateRenameTaskTypes.ts --apply    # delete the stale tasks
 *
 * Env vars:
 *   AWS_REGION                      (default: ap-south-1)
 *   DYNAMODB_TABLE_RECRUITER_TASKS  (default: RecruiterTasks-prod)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const table = process.env.DYNAMODB_TABLE_RECRUITER_TASKS || 'RecruiterTasks-prod';
const APPLY = process.argv.includes('--apply');
const BATCH_CONCURRENCY = 10;

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

interface PoolTask {
  owner_id: string;
  task_id: string;
  type: string;
  entity_ref?: string;
}

/** True for a stale pre-rename POOL task that should be cleared. */
export function isStaleTaskType(item: { type: string; entity_ref?: string }): boolean {
  if (item.type === 'review_ingested_resume') return true;
  if (item.type === 'screen_candidate' && (item.entity_ref ?? '').startsWith('REQ#')) return true;
  return false;
}

async function run(): Promise<void> {
  console.log(`RecruiterTasks table:  ${table}`);
  console.log(`Region:                ${region}`);
  console.log(`Mode:                  ${APPLY ? 'APPLY (deletes)' : 'DRY RUN (no writes)'}`);
  console.log('');

  let lastKey: Record<string, unknown> | undefined;
  let scanned = 0;
  const toDelete: PoolTask[] = [];

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: table,
        // Only active POOL tasks; owned/pipeline tasks are never considered.
        FilterExpression: 'owner_id = :pool AND #status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':pool': 'POOL', ':active': 'active' },
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );

    const items = (result.Items || []) as PoolTask[];
    scanned += items.length;
    for (const item of items) {
      if (isStaleTaskType(item)) toDelete.push(item);
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  console.log(`Scanned active POOL tasks: ${scanned}`);
  console.log(`Stale tasks to clear:      ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const t of toDelete) {
    console.log(`  ${APPLY ? 'DELETE' : 'would delete'} type=${t.type} entity_ref=${t.entity_ref} task_id=${t.task_id}`);
  }

  if (APPLY) {
    for (let i = 0; i < toDelete.length; i += BATCH_CONCURRENCY) {
      const batch = toDelete.slice(i, i + BATCH_CONCURRENCY);
      await Promise.all(
        batch.map((t) =>
          docClient.send(
            new DeleteCommand({
              TableName: table,
              Key: { owner_id: t.owner_id, task_id: t.task_id },
            })
          )
        )
      );
    }
  }

  console.log('');
  console.log(`DONE (${APPLY ? 'APPLIED' : 'DRY RUN'}) — ${toDelete.length} stale task(s) ${APPLY ? 'deleted' : 'would be deleted'}.`);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
