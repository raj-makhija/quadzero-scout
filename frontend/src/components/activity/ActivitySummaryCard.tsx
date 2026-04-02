'use client';

import {
  Search,
  ListChecks,
  FileDown,
  ClipboardCheck,
  FileText,
  Building2,
} from 'lucide-react';
import { ACTION_CATEGORIES, getCategoryCount, getTotalCount } from './activityConstants';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  searches: <Search className="w-5 h-5" />,
  shortlists: <ListChecks className="w-5 h-5" />,
  resumes: <FileDown className="w-5 h-5" />,
  screenings: <ClipboardCheck className="w-5 h-5" />,
  requirements: <FileText className="w-5 h-5" />,
  clients: <Building2 className="w-5 h-5" />,
};

interface ActivitySummaryCardProps {
  summary: Record<string, number>;
  loading?: boolean;
}

export function ActivitySummaryCard({ summary, loading }: ActivitySummaryCardProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12 mb-1" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  const total = getTotalCount(summary);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {ACTION_CATEGORIES.map((category) => {
          const count = getCategoryCount(summary, category);
          const isZero = count === 0;
          return (
            <div
              key={category.key}
              className={`card p-4 ${isZero ? 'opacity-50' : ''}`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${category.bgColor}`}
              >
                <span className={category.iconColor}>
                  {CATEGORY_ICONS[category.key]}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {count}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {category.label}
              </div>
            </div>
          );
        })}
      </div>
      {total === 0 && (
        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          No activity recorded for this period.
        </p>
      )}
    </div>
  );
}
