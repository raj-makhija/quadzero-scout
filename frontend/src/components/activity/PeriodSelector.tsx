'use client';

import type { ActivityPeriod } from '@/lib/api';

interface PeriodSelectorProps {
  value: ActivityPeriod;
  onChange: (period: ActivityPeriod) => void;
}

const PERIOD_OPTIONS: { value: ActivityPeriod; label: string }[] = [
  { value: 'previousDay', label: 'Previous Day' },
  { value: 'week', label: 'Last 7 Days' },
  { value: 'month', label: 'Last 30 Days' },
  { value: 'year', label: 'Last Year' },
];

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ActivityPeriod)}
      className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      {PERIOD_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
