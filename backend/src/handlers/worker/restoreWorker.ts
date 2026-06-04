/**
 * restoreWorker (ticket #167) — async, admin-triggered.
 *
 * Invoked asynchronously by adminInitiateRestore so the work runs outside the
 * 30s API Gateway window and can handle large datasets. Reads the chosen
 * snapshot, batch-writes DynamoDB items back and copies S3 objects back to the
 * resumes bucket, updating the restore-job record throughout.
 */
import { runRestore } from '../../lib/backup.js';

interface RestoreWorkerEvent {
  snapshotId: string;
  jobId: string;
}

export async function handler(event: RestoreWorkerEvent): Promise<void> {
  await runRestore(event.snapshotId, event.jobId, new Date());
  console.log('Restore complete:', { snapshotId: event.snapshotId, jobId: event.jobId });
}
