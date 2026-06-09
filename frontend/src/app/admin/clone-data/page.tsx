'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, CloneJobStatus } from '@/lib/api';
import { getStage, getEnvironmentConfig } from '@/lib/environment';
import { AlertTriangle, DatabaseZap, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const POLL_INTERVAL = 5000; // 5 seconds

type Phase = 'idle' | 'starting' | 'processing' | 'done';

export default function CloneDataPage() {
  const stage = getStage();
  // Triple-defense guard #1 (UI): the action is never present on prod.
  if (stage === 'prod') {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          Clone Prod Data
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          This action is not available in the production environment.
        </p>
      </div>
    );
  }

  return <CloneDataPanel stage={stage} />;
}

function CloneDataPanel({ stage }: { stage: 'dev' | 'qa' }) {
  const stageLabel = stage.toUpperCase();
  const envLabel = getEnvironmentConfig(stage).label;
  const [phase, setPhase] = useState<Phase>('idle');
  const [confirmText, setConfirmText] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<CloneJobStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const confirmed = confirmText.trim().toUpperCase() === stageLabel;

  const pollStatus = useCallback(async (id: string) => {
    try {
      const status = await api.getCloneProdDataStatus(id);
      setJobStatus(status);
      if (status.status !== 'processing') {
        setPhase('done');
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (err) {
      console.error('Failed to poll clone status:', err);
    }
  }, []);

  useEffect(() => {
    if (jobId && phase === 'processing') {
      pollStatus(jobId);
      pollRef.current = setInterval(() => pollStatus(jobId), POLL_INTERVAL);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobId, phase, pollStatus]);

  async function handleStart() {
    if (!confirmed || phase === 'starting') return;
    setPhase('starting');
    try {
      const { jobId: newJobId } = await api.startCloneProdData();
      setJobId(newJobId);
      setPhase('processing');
    } catch (err) {
      console.error('Failed to start clone:', err);
      toast({
        title: 'Failed to start clone',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'error',
      });
      setPhase('idle');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Clone Prod Data
      </h1>

      <div className="card p-6 max-w-2xl space-y-6">
        <div className="flex items-start gap-3">
          <DatabaseZap className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
          <div>
            <p className="text-gray-900 dark:text-gray-100 font-medium">
              Clone production data into <span className="font-bold">{envLabel}</span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Copies DynamoDB tables and resume files from <strong>prod</strong> into this
              environment (<strong>{stageLabel}</strong>). The user accounts table is excluded.
              The target is always this environment and cannot be changed.
            </p>
          </div>
        </div>

        {/* Destructive-action warning */}
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-4">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">
            <strong>Destructive.</strong> All existing data in the <strong>{stageLabel}</strong>{' '}
            environment will be permanently deleted before the prod data is copied in.
          </p>
        </div>

        {phase === 'idle' || phase === 'starting' ? (
          <div className="space-y-3">
            <label htmlFor="confirm-stage" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Type <span className="font-bold">{stageLabel}</span> to confirm
            </label>
            <input
              id="confirm-stage"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={stageLabel}
              className="input w-48"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={handleStart}
              disabled={!confirmed || phase === 'starting'}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {phase === 'starting' && <Loader2 className="w-4 h-4 animate-spin" />}
              Start Clone
            </button>
          </div>
        ) : (
          <CloneProgress status={jobStatus} />
        )}
      </div>
    </div>
  );
}

function CloneProgress({ status }: { status: CloneJobStatus | null }) {
  if (!status) {
    return (
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Starting clone…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {status.status === 'processing' && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
        {status.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-600" />}
        {status.status === 'partial' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
        {status.status === 'error' && <XCircle className="w-5 h-5 text-red-600" />}
        <span className="font-medium text-gray-900 dark:text-gray-100 capitalize">{status.status}</span>
      </div>

      {status.error && <p className="text-sm text-red-600 dark:text-red-400">{status.error}</p>}

      {status.tables.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400">
              <th className="py-1">Table</th>
              <th className="py-1 text-right">Scanned</th>
              <th className="py-1 text-right">Written</th>
              <th className="py-1 text-right">Failed</th>
            </tr>
          </thead>
          <tbody>
            {status.tables.map((t) => (
              <tr key={t.table} className="text-gray-800 dark:text-gray-200">
                <td className="py-1">{t.table}</td>
                <td className="py-1 text-right">{t.scanned}</td>
                <td className="py-1 text-right">{t.written}</td>
                <td className="py-1 text-right">{t.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-sm text-gray-700 dark:text-gray-300">
        Resume files copied: <strong>{status.s3.copied}</strong>
        {status.s3.failed > 0 && <span className="text-red-600"> ({status.s3.failed} failed)</span>}
      </p>
    </div>
  );
}
