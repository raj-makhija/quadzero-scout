/**
 * backupWorker (ticket #167) — EventBridge nightly (2:00 AM IST).
 *
 * Runs a full backup of all prod DynamoDB tables and resume S3 objects into
 * the stage-scoped backup bucket. The backup service writes a manifest marked
 * `complete` only when the whole run succeeds; a mid-run failure is recorded as
 * `failed` and re-thrown so it surfaces in CloudWatch.
 */
import { runBackup } from '../../lib/backup.js';

export async function handler(): Promise<void> {
  const manifest = await runBackup(new Date());
  console.log('Backup complete:', {
    snapshotId: manifest.snapshotId,
    tables: manifest.tables.length,
    s3ObjectCount: manifest.s3ObjectCount,
  });
}
