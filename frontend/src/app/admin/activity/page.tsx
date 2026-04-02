'use client';

import { useState, useEffect, useCallback } from 'react';
import { PeriodSelector } from '@/components/activity/PeriodSelector';
import { ActivitySummaryCard } from '@/components/activity/ActivitySummaryCard';
import { ActivityDetailTable } from '@/components/activity/ActivityDetailTable';
import { api } from '@/lib/api';
import type {
  ActivityPeriod,
  ActivitySummary,
  RecruiterBreakdown,
  AuditLogEntry,
  RecruiterListItem,
} from '@/lib/api';
import { ACTION_CATEGORIES, getCategoryCount, getTotalCount } from '@/components/activity/activityConstants';

export default function AdminActivityDashboardPage() {
  const [period, setPeriod] = useState<ActivityPeriod>('previousDay');
  const [viewMode, setViewMode] = useState<'cumulative' | 'individual'>('cumulative');
  const [selectedRecruiterId, setSelectedRecruiterId] = useState<string>('');
  const [recruiters, setRecruiters] = useState<RecruiterListItem[]>([]);

  const [summary, setSummary] = useState<ActivitySummary>({});
  const [recruiterBreakdown, setRecruiterBreakdown] = useState<RecruiterBreakdown>({});
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [showDetail, setShowDetail] = useState(false);

  // Load recruiter list on mount
  useEffect(() => {
    api.listApprovedRecruiters().then((data) => {
      setRecruiters(data.recruiters);
    }).catch(() => {
      console.error('Failed to load recruiters');
    });
  }, []);

  const fetchDashboard = useCallback(
    async (append = false, token?: string) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setLogs([]);
      }

      try {
        const params: {
          period: ActivityPeriod;
          userId?: string;
          detail?: boolean;
          limit?: number;
          nextToken?: string;
        } = {
          period,
          detail: showDetail,
          limit: 100,
          nextToken: append ? token : undefined,
        };

        if (viewMode === 'individual' && selectedRecruiterId) {
          params.userId = selectedRecruiterId;
        }

        const data = await api.getActivityDashboard(params);

        setSummary(data.summary);
        setRecruiterBreakdown(data.recruiterBreakdown || {});

        if (append) {
          setLogs((prev) => [...prev, ...data.logs]);
        } else {
          setLogs(data.logs);
        }
        setNextToken(data.pagination.nextToken);
      } catch {
        console.error('Failed to fetch activity dashboard');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [period, viewMode, selectedRecruiterId, showDetail]
  );

  useEffect(() => {
    // Don't fetch individual view without a selected recruiter
    if (viewMode === 'individual' && !selectedRecruiterId) {
      setLoading(false);
      setSummary({});
      setRecruiterBreakdown({});
      setLogs([]);
      return;
    }
    fetchDashboard(false);
  }, [fetchDashboard, viewMode, selectedRecruiterId]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Activity Dashboard
      </h1>

      {/* Controls */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Period
            </label>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              View
            </label>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('cumulative')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'cumulative'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                All Recruiters
              </button>
              <button
                onClick={() => setViewMode('individual')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'individual'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Individual
              </button>
            </div>
          </div>

          {viewMode === 'individual' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Recruiter
              </label>
              <select
                value={selectedRecruiterId}
                onChange={(e) => setSelectedRecruiterId(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[240px]"
              >
                <option value="">Select a recruiter...</option>
                {recruiters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.email})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {viewMode === 'cumulative' ? 'Overall Summary' : 'Recruiter Summary'}
        </h2>
        <ActivitySummaryCard summary={summary} loading={loading} />
      </div>

      {/* Recruiter Breakdown (cumulative mode only) */}
      {viewMode === 'cumulative' && Object.keys(recruiterBreakdown).length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Recruiter Breakdown
          </h2>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                      Recruiter
                    </th>
                    {ACTION_CATEGORIES.map((cat) => (
                      <th
                        key={cat.key}
                        className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-400"
                      >
                        {cat.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-400">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(recruiterBreakdown)
                    .sort(([, a], [, b]) => getTotalCount(b.counts) - getTotalCount(a.counts))
                    .map(([userId, entry]) => (
                      <tr
                        key={userId}
                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          <div className="truncate max-w-[200px]" title={entry.email}>
                            {entry.email}
                          </div>
                        </td>
                        {ACTION_CATEGORIES.map((cat) => {
                          const count = getCategoryCount(entry.counts, cat);
                          return (
                            <td
                              key={cat.key}
                              className={`px-4 py-3 text-center ${
                                count > 0
                                  ? 'text-gray-900 dark:text-gray-100 font-medium'
                                  : 'text-gray-300 dark:text-gray-600'
                              }`}
                            >
                              {count}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-gray-100">
                          {getTotalCount(entry.counts)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Logs Toggle */}
      {viewMode === 'individual' && selectedRecruiterId && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Detailed Logs
            </h2>
            <button
              onClick={() => setShowDetail((prev) => !prev)}
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              {showDetail ? 'Hide Details' : 'Show Details'}
            </button>
          </div>

          {showDetail && (
            <ActivityDetailTable
              logs={logs}
              loading={loading}
              hasMore={!!nextToken}
              onLoadMore={() => fetchDashboard(true, nextToken)}
              loadingMore={loadingMore}
              showUserColumn
            />
          )}
        </div>
      )}
    </div>
  );
}
