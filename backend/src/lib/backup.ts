/**
 * Backup & restore service (ticket #167).
 *
 * Nightly backup: scans every prod DynamoDB table to JSON and copies the
 * resume S3 objects into a dedicated, stage-scoped backup bucket under a
 * per-run snapshot prefix. A manifest.json records what the snapshot contains
 * and whether the run completed — a partial run is marked `failed` so it is
 * never treated as a valid restore point.
 *
 * Restore: an admin-triggered async worker reads a chosen snapshot's manifest,
 * batch-writes the DynamoDB items back and copies the S3 objects back to the
 * resumes bucket. Progress is tracked as a small JSON job object in the backup
 * bucket so the admin UI can poll for in-progress / complete / failed.
 *
 * Backup metadata lives entirely in S3 (manifests + job objects) — no new
 * DynamoDB table is introduced (see the ticket cost assessment).
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
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from './config.js';

const ddbClient = new DynamoDBClient({ region: config.region });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const s3Client = new S3Client({ region: config.region });

// Resume-data prefixes captured by a backup (acceptance criteria).
export const BACKUP_S3_PREFIXES = ['resumes/', 'formatted-resumes/', 'email-resumes/'] as const;

const SNAPSHOTS_ROOT = 'snapshots';
const RESTORE_JOBS_ROOT = 'restore-jobs';
const BATCH_WRITE_SIZE = 25;

export interface BackupTableResult {
  name: string;
  itemCount: number;
  key: string;
}

export interface BackupManifest {
  snapshotId: string;
  status: 'complete' | 'failed';
  startedAt: string;
  completedAt: string;
  tables: BackupTableResult[];
  s3ObjectCount: number;
  error?: string;
}

export interface RestoreJob {
  jobId: string;
  snapshotId: string;
  status: 'in_progress' | 'complete' | 'failed';
  startedAt: string;
  updatedAt: string;
  tablesRestored: number;
  itemsRestored: number;
  s3ObjectsRestored: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Every DynamoDB table the backup must capture (all tables in config). */
export function listBackupTables(): string[] {
  return Object.values(config.dynamodb);
}

/** S3-safe snapshot id derived from the run timestamp, e.g. 2026-06-04T20-30-00-000Z. */
export function buildSnapshotId(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function manifestKey(snapshotId: string): string {
  return `${SNAPSHOTS_ROOT}/${snapshotId}/manifest.json`;
}

export function tableBackupKey(snapshotId: string, tableName: string): string {
  return `${SNAPSHOTS_ROOT}/${snapshotId}/dynamodb/${tableName}.json`;
}

export function s3BackupKey(snapshotId: string, originalKey: string): string {
  return `${SNAPSHOTS_ROOT}/${snapshotId}/s3/${originalKey}`;
}

/** Reverse of s3BackupKey: recover the original resumes-bucket key. */
export function originalKeyFromBackup(snapshotId: string, backupKey: string): string {
  return backupKey.slice(`${SNAPSHOTS_ROOT}/${snapshotId}/s3/`.length);
}

function restoreJobKey(jobId: string): string {
  return `${RESTORE_JOBS_ROOT}/${jobId}.json`;
}

// ---------------------------------------------------------------------------
// S3 primitives (against the backup bucket unless noted)
// ---------------------------------------------------------------------------

async function putBackupObject(key: string, body: string): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.s3.backupsBucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    })
  );
}

async function getBackupJson<T>(key: string): Promise<T | null> {
  try {
    const res = await s3Client.send(
      new GetObjectCommand({ Bucket: config.s3.backupsBucket, Key: key })
    );
    if (!res.Body) return null;
    const text = await res.Body.transformToString();
    return JSON.parse(text) as T;
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null;
    throw err;
  }
}

async function listAllKeys(bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3Client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

// ---------------------------------------------------------------------------
// DynamoDB primitives
// ---------------------------------------------------------------------------

async function scanAllItems(tableName: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastKey })
    );
    for (const item of res.Items ?? []) {
      items.push(item as Record<string, unknown>);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function batchWriteItems(
  tableName: string,
  items: Record<string, unknown>[]
): Promise<void> {
  for (const group of chunk(items, BATCH_WRITE_SIZE)) {
    let requestItems: Record<string, { PutRequest: { Item: Record<string, unknown> } }[]> = {
      [tableName]: group.map(Item => ({ PutRequest: { Item } })),
    };
    // Retry unprocessed items (throttling) a bounded number of times.
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await docClient.send(new BatchWriteCommand({ RequestItems: requestItems }));
      const unprocessed = res.UnprocessedItems?.[tableName];
      if (!unprocessed || unprocessed.length === 0) break;
      requestItems = { [tableName]: unprocessed as typeof requestItems[string] };
    }
  }
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

async function backupS3Objects(snapshotId: string): Promise<number> {
  let count = 0;
  for (const prefix of BACKUP_S3_PREFIXES) {
    const keys = await listAllKeys(config.s3.resumesBucket, prefix);
    for (const key of keys) {
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: config.s3.backupsBucket,
          Key: s3BackupKey(snapshotId, key),
          CopySource: `${config.s3.resumesBucket}/${encodeURIComponent(key)}`,
        })
      );
      count++;
    }
  }
  return count;
}

/** Run a full backup. Always writes a manifest; a mid-run failure is recorded as `failed`. */
export async function runBackup(now: Date): Promise<BackupManifest> {
  const snapshotId = buildSnapshotId(now);
  const startedAt = now.toISOString();
  const tables: BackupTableResult[] = [];
  try {
    for (const tableName of listBackupTables()) {
      const items = await scanAllItems(tableName);
      const key = tableBackupKey(snapshotId, tableName);
      await putBackupObject(key, JSON.stringify(items));
      tables.push({ name: tableName, itemCount: items.length, key });
    }
    const s3ObjectCount = await backupS3Objects(snapshotId);
    const manifest: BackupManifest = {
      snapshotId,
      status: 'complete',
      startedAt,
      completedAt: new Date().toISOString(),
      tables,
      s3ObjectCount,
    };
    await putBackupObject(manifestKey(snapshotId), JSON.stringify(manifest));
    return manifest;
  } catch (err) {
    const manifest: BackupManifest = {
      snapshotId,
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      tables,
      s3ObjectCount: 0,
      error: (err as Error).message,
    };
    await putBackupObject(manifestKey(snapshotId), JSON.stringify(manifest));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Snapshot listing / restore
// ---------------------------------------------------------------------------

/** List all snapshot manifests, newest first. */
export async function listSnapshots(): Promise<BackupManifest[]> {
  const keys = await listAllKeys(config.s3.backupsBucket, `${SNAPSHOTS_ROOT}/`);
  const manifestKeys = keys.filter(k => k.endsWith('/manifest.json'));
  const manifests: BackupManifest[] = [];
  for (const key of manifestKeys) {
    const m = await getBackupJson<BackupManifest>(key);
    if (m) manifests.push(m);
  }
  manifests.sort((a, b) => b.snapshotId.localeCompare(a.snapshotId));
  return manifests;
}

export async function getManifest(snapshotId: string): Promise<BackupManifest | null> {
  return getBackupJson<BackupManifest>(manifestKey(snapshotId));
}

export async function getRestoreJob(jobId: string): Promise<RestoreJob | null> {
  return getBackupJson<RestoreJob>(restoreJobKey(jobId));
}

async function putRestoreJob(job: RestoreJob): Promise<void> {
  await putBackupObject(restoreJobKey(job.jobId), JSON.stringify(job));
}

/** Create the initial in-progress restore job record (called before the worker runs). */
export async function createRestoreJob(
  jobId: string,
  snapshotId: string,
  now: Date
): Promise<RestoreJob> {
  const job: RestoreJob = {
    jobId,
    snapshotId,
    status: 'in_progress',
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    tablesRestored: 0,
    itemsRestored: 0,
    s3ObjectsRestored: 0,
  };
  await putRestoreJob(job);
  return job;
}

async function restoreS3Objects(snapshotId: string): Promise<number> {
  const prefix = `${SNAPSHOTS_ROOT}/${snapshotId}/s3/`;
  const keys = await listAllKeys(config.s3.backupsBucket, prefix);
  let count = 0;
  for (const backupKey of keys) {
    const originalKey = originalKeyFromBackup(snapshotId, backupKey);
    if (!originalKey) continue;
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: config.s3.resumesBucket,
        Key: originalKey,
        CopySource: `${config.s3.backupsBucket}/${encodeURIComponent(backupKey)}`,
      })
    );
    count++;
  }
  return count;
}

/** Restore prod data from a snapshot, updating the job record as it progresses. */
export async function runRestore(snapshotId: string, jobId: string, now: Date): Promise<void> {
  const job = (await getRestoreJob(jobId)) ?? (await createRestoreJob(jobId, snapshotId, now));
  try {
    const manifest = await getManifest(snapshotId);
    if (!manifest || manifest.status !== 'complete') {
      throw new Error(`Snapshot ${snapshotId} is missing or incomplete`);
    }

    let itemsRestored = 0;
    let tablesRestored = 0;
    for (const table of manifest.tables) {
      const items = (await getBackupJson<Record<string, unknown>[]>(table.key)) ?? [];
      await batchWriteItems(table.name, items);
      itemsRestored += items.length;
      tablesRestored++;
    }

    const s3ObjectsRestored = await restoreS3Objects(snapshotId);

    await putRestoreJob({
      ...job,
      status: 'complete',
      updatedAt: new Date().toISOString(),
      tablesRestored,
      itemsRestored,
      s3ObjectsRestored,
    });
  } catch (err) {
    await putRestoreJob({
      ...job,
      status: 'failed',
      updatedAt: new Date().toISOString(),
      error: (err as Error).message,
    });
    throw err;
  }
}
