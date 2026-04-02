'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { PeriodSelector } from '@/components/activity/PeriodSelector';
import { ActivitySummaryCard } from '@/components/activity/ActivitySummaryCard';
import { ActivityDetailTable } from '@/components/activity/ActivityDetailTable';
import { api } from '@/lib/api';
import type { ActivityPeriod, ActivitySummary, AuditLogEntry } from '@/lib/api';

export default function RecruiterActivityPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [period, setPeriod] = useState<ActivityPeriod>('previousDay');
  const [activeTab, setActiveTab] = useState<'summary' | 'detailed'>('summary');
  const [summary, setSummary] = useState<ActivitySummary>({});
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextToken, setNextToken] = useState<string | undefined>();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
    }
  }, [session, status, router]);

  const fetchActivity = useCallback(
    async (append = false, token?: string) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setLogs([]);
      }

      try {
        const data = await api.getMyActivity({
          period,
          detail: activeTab === 'detailed',
          limit: 100,
          nextToken: append ? token : undefined,
        });

        setSummary(data.summary);
        if (append) {
          setLogs((prev) => [...prev, ...data.logs]);
        } else {
          setLogs(data.logs);
        }
        setNextToken(data.pagination.nextToken);
      } catch {
        console.error('Failed to fetch activity');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [period, activeTab]
  );

  useEffect(() => {
    if (status === 'authenticated') {
      fetchActivity(false);
    }
  }, [status, fetchActivity]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            My Activity
          </h1>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'summary'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab('detailed')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'detailed'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Detailed
          </button>
        </div>

        {/* Content */}
        {activeTab === 'summary' ? (
          <ActivitySummaryCard summary={summary} loading={loading} />
        ) : (
          <ActivityDetailTable
            logs={logs}
            loading={loading}
            hasMore={!!nextToken}
            onLoadMore={() => fetchActivity(true, nextToken)}
            loadingMore={loadingMore}
          />
        )}
      </div>
    </div>
  );
}
