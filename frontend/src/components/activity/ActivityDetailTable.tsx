'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { AuditLogEntry } from '@/lib/api';
import { ACTION_LABELS, formatTimestamp } from './activityConstants';

function ActionBadge({ action }: { action: string }) {
  const config = ACTION_LABELS[action] || {
    label: action,
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}
    >
      {config.label}
    </span>
  );
}

interface ActivityDetailTableProps {
  logs: AuditLogEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore?: boolean;
  showUserColumn?: boolean;
}

export function ActivityDetailTable({
  logs,
  loading,
  hasMore,
  onLoadMore,
  loadingMore = false,
  showUserColumn = false,
}: ActivityDetailTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="card p-12 text-center text-gray-500 dark:text-gray-400">
        No activity logs found for this period.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 w-8"></th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                Timestamp
              </th>
              {showUserColumn && (
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  User
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                Action
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                Entity
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                IP Address
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <>
                <tr
                  key={log.eventId}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                  onClick={() =>
                    setExpandedRow(expandedRow === log.eventId ? null : log.eventId)
                  }
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
                  {showUserColumn && (
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      <div className="truncate max-w-[200px]" title={log.userEmail}>
                        {log.userEmail}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <ActionBadge action={log.action} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    <span
                      className="text-xs font-mono truncate max-w-[150px] block"
                      title={log.entityId}
                    >
                      {log.entityType}:{' '}
                      {log.entityId.length > 12
                        ? log.entityId.slice(0, 12) + '...'
                        : log.entityId}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs font-mono">
                    {log.ipAddress || '-'}
                  </td>
                </tr>
                {expandedRow === log.eventId && (
                  <tr
                    key={`${log.eventId}-detail`}
                    className="bg-gray-50 dark:bg-gray-800/50"
                  >
                    <td colSpan={showUserColumn ? 6 : 5} className="px-8 py-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">
                            Event ID:
                          </span>
                          <span className="ml-2 text-gray-800 dark:text-gray-200 font-mono text-xs">
                            {log.eventId}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">
                            User ID:
                          </span>
                          <span className="ml-2 text-gray-800 dark:text-gray-200 font-mono text-xs">
                            {log.userId}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">
                            Role:
                          </span>
                          <span className="ml-2 text-gray-800 dark:text-gray-200">
                            {log.userRole}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">
                            Entity ID:
                          </span>
                          <span className="ml-2 text-gray-800 dark:text-gray-200 font-mono text-xs">
                            {log.entityId}
                          </span>
                        </div>
                      </div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="mt-3">
                          <span className="font-medium text-gray-600 dark:text-gray-400 block mb-1">
                            Metadata:
                          </span>
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

      {hasMore && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
          >
            {loadingMore ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
