import { getCloneJob, updateCloneJob } from '../../lib/dynamodb.js';
import { runCloneJob } from '../../lib/cloneData.js';
import type { CloneTableResult, CloneS3Result } from '../../types/index.js';

interface CloneDataWorkerEvent {
  jobId: string;
  target: string;
}

export async function handler(event: CloneDataWorkerEvent): Promise<void> {
  const { jobId, target } = event;
  console.log(`Clone data worker started for job ${jobId} → target ${target}`);

  const job = await getCloneJob(jobId);
  if (!job) {
    console.error('Clone job not found:', jobId);
    return;
  }

  const tables: CloneTableResult[] = [];
  let s3: CloneS3Result = { copied: 0, failed: 0 };

  try {
    const result = await runCloneJob(target, {
      onTableResult: async (r) => {
        tables.push(r);
        await updateCloneJob(jobId, { tables: [...tables] });
      },
      onS3Result: async (r) => {
        s3 = r;
        await updateCloneJob(jobId, { s3: r });
      },
    });

    await updateCloneJob(jobId, {
      status: result.hasFailures ? 'partial' : 'completed',
      tables: result.tables,
      s3: result.s3,
    });
    console.log(`Clone job ${jobId} ${result.hasFailures ? 'completed with failures' : 'completed'}`);
  } catch (err) {
    const message = (err as Error).message || 'Unknown error';
    console.error(`Clone job ${jobId} failed:`, message);
    await updateCloneJob(jobId, { status: 'error', tables, s3, error: message });
  }
}
