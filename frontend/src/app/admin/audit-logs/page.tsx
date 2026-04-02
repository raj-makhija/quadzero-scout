'use client';

import { useState, useCallback, useEffect } from 'react';
import { api, AuditLogEntry } from '@/lib/api';
import { Search, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { ACTION_LABELS, ALL_ACTIONS, formatTimestamp } from '@/components/activity/activityConstants';

function ActionBadge({ action }: { action: string }) {
  const config = ACTION_LABELS[action] || { label: action, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Filters — default to today's date for proper timestamp-descending sorting
  const today = new Date().toISOString().slice(0, 10);
  const [email, setEmail] = useState('');
  const [action, setAction] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const fetchLogs = useCallback(async (append = false, token?: string) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setLogs([]);
    }

    try {
      const result = await api.listAuditLogs({
        email: email || undefined,
        action: action || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: 50,
        nextToken: append ? token : undefined,
      });

      if (append) {
        setLogs((prev) => [...prev, ...result.logs]);
      } else {
        setLogs(result.logs);
      }
      setNextToken(result.pagination.nextToken);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [email, action, startDate, endDate]);

  // Auto-load all logs on page mount
  useEffect(() => {
    fetchLogs(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Audit Logs
      </h1>

      {/* Filters */}
      <form onSubmit={handleSearch} className="card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Filter by email"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Action Type
            </label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Actions</option>
              {ALL_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            Search
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('');
              setAction('');
              setStartDate(today);
              setEndDate(today);
              setNextToken(undefined);
              // Re-fetch logs with today's date
              setTimeout(() => fetchLogs(false), 0);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Clear
          </button>
        </div>
      </form>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : logs.length === 0 ? (
        <div className="card p-12 text-center text-gray-500 dark:text-gray-400">
          No audit logs found.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 w-8"></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">User</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Entity</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <>
                    <tr
                      key={log.eventId}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === log.eventId ? null : log.eventId)}
                    >
                      <td className="px-4 py-3">
                        {expandedRow === log.eventId ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        <div className="truncate max-w-[200px]" title={log.userEmail}>
                          {log.userEmail}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        <span className="text-xs font-mono truncate max-w-[150px] block" title={log.entityId}>
                          {log.entityType}: {log.entityId.length > 12 ? log.entityId.slice(0, 12) + '...' : log.entityId}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs font-mono">
                        {log.ipAddress || '-'}
                      </td>
                    </tr>
                    {expandedRow === log.eventId && (
                      <tr key={`${log.eventId}-detail`} className="bg-gray-50 dark:bg-gray-800/50">
                        <td colSpan={6} className="px-8 py-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Event ID:</span>
                              <span className="ml-2 text-gray-800 dark:text-gray-200 font-mono text-xs">{log.eventId}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">User ID:</span>
                              <span className="ml-2 text-gray-800 dark:text-gray-200 font-mono text-xs">{log.userId}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Role:</span>
                              <span className="ml-2 text-gray-800 dark:text-gray-200">{log.userRole}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Entity ID:</span>
                              <span className="ml-2 text-gray-800 dark:text-gray-200 font-mono text-xs">{log.entityId}</span>
                            </div>
                          </div>
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div className="mt-3">
                              <span className="font-medium text-gray-600 dark:text-gray-400 block mb-1">Metadata:</span>
                              <pre className="bg-gray-100 dark:bg-gray-900 rounded-lg p-3 text-xs text-gray-800 dark:text-gray-200 overflow-x-auto">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load More */}
          {nextToken && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-center">
              <button
                onClick={() => fetchLogs(true, nextToken)}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
              >
                {loadingMore ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : null}
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
