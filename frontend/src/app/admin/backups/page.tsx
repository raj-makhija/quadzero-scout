'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, BackupSnapshot, RestoreJobStatus } from '@/lib/api';
import { DatabaseBackup, RotateCcw, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const POLL_INTERVAL = 5000; // 5 seconds

export default function BackupsPage() {
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [restoreJob, setRestoreJob] = useState<RestoreJobStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listBackups();
      setSnapshots(res.snapshots);
    } catch (err) {
      console.error('Failed to load backups:', err);
      toast({ title: 'Failed to load backups', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSnapshots();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadSnapshots]);

  const pollRestore = useCallback(async (jobId: string) => {
    try {
      const job = await api.getRestoreStatus(jobId);
      setRestoreJob(job);
      if (job.status !== 'in_progress' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        if (job.status === 'complete') {
          toast({ title: 'Restore complete', variant: 'success' });
        } else {
          toast({ title: 'Restore failed', description: job.error, variant: 'error' });
        }
      }
    } catch (err) {
      console.error('Failed to poll restore status:', err);
    }
  }, [toast]);

  const handleRestore = async (snapshotId: string) => {
    setConfirmId(null);
    try {
      const { jobId } = await api.initiateRestore(snapshotId);
      setRestoreJob({
        jobId,
        snapshotId,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tablesRestored: 0,
        itemsRestored: 0,
        s3ObjectsRestored: 0,
      });
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => pollRestore(jobId), POLL_INTERVAL);
      toast({ title: 'Restore started', description: `Restoring from ${snapshotId}`, variant: 'default' });
    } catch (err) {
      console.error('Failed to initiate restore:', err);
      toast({ title: 'Failed to start restore', variant: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <DatabaseBackup className="w-6 h-6" />
            Backups
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Nightly snapshots of all prod data. Restore replaces current data with the selected snapshot.
          </p>
        </div>
        <button
          onClick={loadSnapshots}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Active restore status */}
      {restoreJob && (
        <div className="card p-4">
          <div className="flex items-center gap-2 font-medium">
            {restoreJob.status === 'in_progress' && <Loader2 className="w-5 h-5 animate-spin text-primary-600" />}
            {restoreJob.status === 'complete' && <CheckCircle className="w-5 h-5 text-green-600" />}
            {restoreJob.status === 'failed' && <XCircle className="w-5 h-5 text-red-600" />}
            <span>
              Restore from {restoreJob.snapshotId} — {restoreJob.status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {restoreJob.tablesRestored} tables, {restoreJob.itemsRestored} items, {restoreJob.s3ObjectsRestored} files restored
          </p>
          {restoreJob.error && <p className="text-sm text-red-600 mt-1">{restoreJob.error}</p>}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : snapshots.length === 0 ? (
        <div className="card p-8 text-center text-gray-500 dark:text-gray-400">
          No backups found yet. The first nightly backup will appear here after it runs.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">Snapshot</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tables</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Files</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {snapshots.map(s => (
                <tr key={s.snapshotId}>
                  <td className="px-4 py-3 font-mono text-xs">{s.snapshotId}</td>
                  <td className="px-4 py-3">
                    {s.status === 'complete' ? (
                      <span className="text-green-600">complete</span>
                    ) : (
                      <span className="text-red-600">failed</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{s.tableCount}</td>
                  <td className="px-4 py-3">{s.itemCount}</td>
                  <td className="px-4 py-3">{s.s3ObjectCount}</td>
                  <td className="px-4 py-3 text-right">
                    {confirmId === s.snapshotId ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-600">Overwrite all prod data?</span>
                        <button
                          onClick={() => handleRestore(s.snapshotId)}
                          className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(s.snapshotId)}
                        disabled={s.status !== 'complete' || restoreJob?.status === 'in_progress'}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
