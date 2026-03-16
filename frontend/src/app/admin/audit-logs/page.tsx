'use client';

import { useState, useCallback, useEffect } from 'react';
import { api, AuditLogEntry } from '@/lib/api';
import { Search, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  SIGN_IN_SUCCESS: { label: 'Sign In', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  SIGN_IN_FAILURE: { label: 'Sign In Failed', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  CANDIDATE_SEARCH: { label: 'Search', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  CANDIDATE_SEARCH_BY_NAME: { label: 'Name Search', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  RESUME_DOWNLOAD_FORMATTED: { label: 'Resume Download', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  RESUME_DOWNLOAD_ORIGINAL: { label: 'Original Resume', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  SHORTLIST_ADD: { label: 'Shortlisted', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  SHORTLIST_REMOVE: { label: 'Unshortlisted', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  CANDIDATE_SCREEN: { label: 'Screened', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400' },
  REQUIREMENT_CREATE: { label: 'Req Created', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  REQUIREMENT_UPDATE: { label: 'Req Updated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  REQUIREMENT_UPDATE_STATUS: { label: 'Req Status', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  REQUIREMENT_UPDATE_CRITERIA: { label: 'Req Criteria', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  REQUIREMENT_CONSOLIDATE: { label: 'Req Consolidated', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400' },
  REQUIREMENT_TOGGLE_NOTIFY: { label: 'Notify Toggle', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  REQUIREMENT_CHECK_DUPLICATE: { label: 'Dup Check', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  CLIENT_CREATE: { label: 'Client Created', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  CLIENT_UPDATE: { label: 'Client Updated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  SEARCH_SAVE: { label: 'Search Saved', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  SEARCH_DELETE: { label: 'Search Deleted', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  USER_APPROVE: { label: 'User Approved', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  USER_REJECT: { label: 'User Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  PRICING_CONFIG_UPDATE: { label: 'Pricing Updated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  PROMPT_UPDATE: { label: 'Prompt Updated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  BULK_IMPORT_START: { label: 'Bulk Import', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

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

  // Filters
  const [email, setEmail] = useState('');
  const [action, setAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
              setStartDate('');
              setEndDate('');
              setNextToken(undefined);
              // Re-fetch all logs with no filters
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
