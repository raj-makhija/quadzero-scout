/**
 * Clone Prod Data engine (ticket #303).
 *
 * Ported from the local `backend/scripts/cloneProdToDev.ts` CLI script into an
 * in-cloud worker library. Differences from the script:
 *   - Source stage is always `prod`; target is always the current stage
 *     (`config.stage`), never client-supplied.
 *   - The `Users` table is intentionally EXCLUDED from the registry so prod
 *     password hashes / user PII never land in dev/qa.
 *   - Progress is reported via callbacks (written to the clone-job record)
 *     instead of stdout.
 *
 * Uses its own AWS SDK clients (not the stage-bound lib/dynamodb.js / lib/s3.js)
 * because it reads cross-stage from prod and writes to the current stage.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { config } from './config.js';
import type { CloneTableResult, CloneS3Result } from '../types/index.js';

export const CLONE_SOURCE_STAGE = 'prod';
const BATCH_SIZE = 25;

export interface CloneTableConfig {
  baseName: string;
  partitionKey: string;
  sortKey?: string;
}

// 9 data + config tables. `Users` is deliberately omitted (prod credentials/PII).
export const CLONE_TABLE_REGISTRY: CloneTableConfig[] = [
  { baseName: 'TalentProfiles', partitionKey: 'candidate_id' },
  { baseName: 'Requirements', partitionKey: 'requirement_id' },
  { baseName: 'Shortlists', partitionKey: 'requirement_id', sortKey: 'candidate_id' },
  { baseName: 'SavedSearches', partitionKey: 'recruiter_id', sortKey: 'search_id' },
  { baseName: 'BulkImportBatches', partitionKey: 'batch_id' },
  { baseName: 'Clients', partitionKey: 'client_id' },
  { baseName: 'CandidateScreenings', partitionKey: 'candidate_id', sortKey: 'screened_at' },
  { baseName: 'Prompts', partitionKey: 'prompt_key', sortKey: 'version' },
  { baseName: 'PricingConfig', partitionKey: 'config_key', sortKey: 'version' },
];

const dynamoClient = new DynamoDBClient({ region: config.region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const s3Client = new S3Client({ region: config.region });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tableName(baseName: string, stage: string): string {
  return `${baseName}-${stage}`;
}

function bucketName(stage: string): string {
  return `quadzero-scout-resumes-${stage}`;
}

async function* scanAllItems(
  table: string,
  projectionExpression?: string
): AsyncGenerator<Record<string, unknown>[]> {
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: table,
        ...(lastKey && { ExclusiveStartKey: lastKey }),
        ...(projectionExpression && { ProjectionExpression: projectionExpression }),
      })
    );
    if (result.Items && result.Items.length > 0) {
      yield result.Items as Record<string, unknown>[];
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
}

async function batchWriteItems(
  table: string,
  items: Record<string, unknown>[]
): Promise<{ written: number; failed: number }> {
  let written = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    let unprocessed: { PutRequest: { Item: Record<string, unknown> } }[] | undefined =
      batch.map((item) => ({ PutRequest: { Item: item } }));
    let retries = 0;
    const MAX_RETRIES = 5;

    while (unprocessed && unprocessed.length > 0 && retries < MAX_RETRIES) {
      const result = await docClient.send(
        new BatchWriteCommand({ RequestItems: { [table]: unprocessed } })
      );
      const remaining = result.UnprocessedItems?.[table] as typeof unprocessed | undefined;
      if (remaining && remaining.length > 0) {
        unprocessed = remaining;
        retries++;
        await sleep(100 * Math.pow(2, retries));
      } else {
        written += unprocessed.length;
        unprocessed = undefined;
      }
    }

    if (unprocessed && unprocessed.length > 0) {
      failed += unprocessed.length;
    }
  }

  return { written, failed };
}

async function batchDeleteItems(
  table: string,
  keys: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    let unprocessed: { DeleteRequest: { Key: Record<string, unknown> } }[] | undefined =
      batch.map((key) => ({ DeleteRequest: { Key: key } }));
    let retries = 0;

    while (unprocessed && unprocessed.length > 0 && retries < 5) {
      const result = await docClient.send(
        new BatchWriteCommand({ RequestItems: { [table]: unprocessed } })
      );
      const remaining = result.UnprocessedItems?.[table] as typeof unprocessed | undefined;
      if (remaining && remaining.length > 0) {
        unprocessed = remaining;
        retries++;
        await sleep(100 * Math.pow(2, retries));
      } else {
        unprocessed = undefined;
      }
    }
  }
}

async function clearTable(table: string, tableConfig: CloneTableConfig): Promise<void> {
  const keyAttributes = [tableConfig.partitionKey];
  if (tableConfig.sortKey) keyAttributes.push(tableConfig.sortKey);
  const projection = keyAttributes.join(', ');

  for await (const page of scanAllItems(table, projection)) {
    const keys = page.map((item) =>
      Object.fromEntries(keyAttributes.map((attr) => [attr, item[attr]]))
    );
    await batchDeleteItems(table, keys);
  }
}

async function cloneTable(tableConfig: CloneTableConfig, target: string): Promise<CloneTableResult> {
  const sourceTable = tableName(tableConfig.baseName, CLONE_SOURCE_STAGE);
  const targetTable = tableName(tableConfig.baseName, target);

  await clearTable(targetTable, tableConfig);

  let scanned = 0;
  let written = 0;
  let failed = 0;

  for await (const page of scanAllItems(sourceTable)) {
    scanned += page.length;
    const res = await batchWriteItems(targetTable, page);
    written += res.written;
    failed += res.failed;
  }

  return { table: tableConfig.baseName, scanned, written, failed };
}

async function clearS3Bucket(bucket: string): Promise<void> {
  let continuationToken: string | undefined;
  do {
    const listResult = await s3Client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken, MaxKeys: 1000 })
    );
    const objects = listResult.Contents || [];
    if (objects.length === 0) break;
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects.map((obj) => ({ Key: obj.Key })), Quiet: true },
      })
    );
    continuationToken = listResult.NextContinuationToken;
  } while (continuationToken);
}

async function cloneS3Bucket(target: string): Promise<CloneS3Result> {
  const sourceBucket = bucketName(CLONE_SOURCE_STAGE);
  const targetBucket = bucketName(target);

  await clearS3Bucket(targetBucket);

  let continuationToken: string | undefined;
  let copied = 0;
  let failed = 0;

  do {
    const listResult = await s3Client.send(
      new ListObjectsV2Command({ Bucket: sourceBucket, ContinuationToken: continuationToken, MaxKeys: 1000 })
    );
    const objects = listResult.Contents || [];

    for (const obj of objects) {
      if (!obj.Key) continue;
      try {
        await s3Client.send(
          new CopyObjectCommand({
            Bucket: targetBucket,
            Key: obj.Key,
            CopySource: `${sourceBucket}/${encodeURIComponent(obj.Key)}`,
            ServerSideEncryption: 'AES256',
          })
        );
        copied++;
      } catch {
        failed++;
      }
    }

    continuationToken = listResult.NextContinuationToken;
  } while (continuationToken);

  return { copied, failed };
}

export interface CloneProgressHooks {
  onTableResult?: (result: CloneTableResult) => Promise<void>;
  onS3Result?: (result: CloneS3Result) => Promise<void>;
}

export interface CloneRunResult {
  tables: CloneTableResult[];
  s3: CloneS3Result;
  hasFailures: boolean;
}

/**
 * Run a full clone of prod data into `target` (dev|qa). Reports per-table and
 * S3 progress through `hooks` as each step completes.
 */
export async function runCloneJob(
  target: string,
  hooks: CloneProgressHooks = {}
): Promise<CloneRunResult> {
  const tables: CloneTableResult[] = [];

  for (const tableConfig of CLONE_TABLE_REGISTRY) {
    const result = await cloneTable(tableConfig, target);
    tables.push(result);
    if (hooks.onTableResult) await hooks.onTableResult(result);
  }

  const s3 = await cloneS3Bucket(target);
  if (hooks.onS3Result) await hooks.onS3Result(s3);

  const hasFailures = tables.some((t) => t.failed > 0) || s3.failed > 0;
  return { tables, s3, hasFailures };
}
