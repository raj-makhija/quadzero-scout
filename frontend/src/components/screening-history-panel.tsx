'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, X, Loader2, Clock, User } from 'lucide-react';
import { api } from '@/lib/api';
import type { ScreeningHistoryEntry, ScreeningProfileData } from '@/lib/api';
import {
  formatDate,
  formatDateTime,
  formatSeniority,
  formatAvailability,
  formatCandidateEngagement,
} from '@/lib/utils';

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Full Name',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  primary_skills: 'Primary Skills',
  primary_skill_years: 'Primary Skill Years',
  secondary_skills: 'Secondary Skills',
  total_experience: 'Total Experience',
  seniority: 'Seniority',
  availability: 'Notice Period',
  last_working_day: 'Last Working Day',
  engagement_model: 'Engagement Preference',
  industries: 'Industries',
  roles: 'Roles',
  education: 'Education',
  certifications: 'Certifications',
  summary: 'Summary',
  current_ctc: 'Current CTC',
  expected_ctc: 'Expected CTC',
  expected_ctc_type: 'Expected CTC Type',
  custom_fields: 'Custom Fields',
  not_interested: 'Not Interested',
};

function formatFieldValue(key: string, value: unknown): string {
  if (key === 'last_working_day' && value === null) return 'Still on the job – LWD TBD';
  if (value === null || value === undefined) return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    if (key === 'education') {
      return value.map((e) => `${e.degree} — ${e.institution}${e.year ? ` (${e.year})` : ''}`).join(', ');
    }
    return value.join(', ');
  }

  if (key === 'primary_skill_years' && typeof value === 'object') {
    return Object.entries(value as Record<string, number>)
      .map(([skill, years]) => `${skill}: ${years}y`)
      .join(', ');
  }

  if (key === 'custom_fields' && typeof value === 'object') {
    return Object.entries(value as Record<string, string | number>)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }

  if (key === 'last_working_day') return formatDate(String(value));
  if (key === 'expected_ctc_type') return value === 'negotiable' ? 'Negotiable (auto-calculated)' : 'Explicit';
  if (key === 'current_ctc' || key === 'expected_ctc') return `${value} LPA`;
  if (key === 'total_experience') return `${value} years`;
  if (key === 'seniority') return formatSeniority(String(value));
  if (key === 'availability') return formatAvailability(String(value));
  if (key === 'engagement_model') return formatCandidateEngagement(String(value));

  return String(value);
}

function FieldChangeDiff({ entry }: { entry: ScreeningHistoryEntry }) {
  if (!entry.fieldsUpdated || entry.fieldsUpdated.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">No fields were changed.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700/50">
            <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Field</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Before</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {entry.fieldsUpdated.map((field) => {
            const prev = entry.previousValues?.[field as keyof ScreeningProfileData];
            const updated = entry.updatedValues?.[field as keyof ScreeningProfileData];
            return (
              <tr key={field}>
                <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {FIELD_LABELS[field] || field}
                </td>
                <td className="px-3 py-2 text-red-700 dark:text-red-400 bg-red-50/50 dark:bg-red-900/10">
                  {formatFieldValue(field, prev)}
                </td>
                <td className="px-3 py-2 text-green-700 dark:text-green-400 bg-green-50/50 dark:bg-green-900/10">
                  {formatFieldValue(field, updated)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TimelineEntry({ entry }: { entry: ScreeningHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);

  const notesPreview = entry.notes
    ? entry.notes.length > 80
      ? entry.notes.slice(0, 80) + '...'
      : entry.notes
    : null;

  return (
    <div className="relative pl-6 pb-6 last:pb-0">
      {/* Timeline dot and line */}
      <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-primary-500 border-2 border-white dark:border-gray-800 z-10" />
      <div className="absolute left-[5px] top-4 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700 last:hidden" />

      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-700">
        {/* Collapsed header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {formatDateTime(entry.screenedAt)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <User className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{entry.screenerEmail}</span>
              <span>&middot;</span>
              <span>{entry.fieldsUpdated?.length || 0} field{(entry.fieldsUpdated?.length || 0) !== 1 ? 's' : ''} updated</span>
            </div>
            {!expanded && notesPreview && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate italic">
                &ldquo;{notesPreview}&rdquo;
              </p>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
          )}
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
            {entry.notes && (
              <div className="pt-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{entry.notes}</p>
              </div>
            )}
            <div className="pt-1">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Field Changes</p>
              <FieldChangeDiff entry={entry} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ScreeningHistoryPanelProps {
  candidateId: string;
  candidateName?: string;
  mode: 'inline' | 'modal';
  onClose?: () => void;
}

export default function ScreeningHistoryPanel({
  candidateId,
  candidateName,
  mode,
  onClose,
}: ScreeningHistoryPanelProps) {
  const [screenings, setScreenings] = useState<ScreeningHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchHistory() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getScreeningHistory(candidateId);
        if (!cancelled) {
          setScreenings(res.screenings || []);
        }
      } catch {
        if (!cancelled) setError('Failed to load screening history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchHistory();
    return () => { cancelled = true; };
  }, [candidateId]);

  const content = (
    <>
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading history...</span>
        </div>
      )}
      {error && (
        <div className="px-4 py-6 text-center text-sm text-red-500 dark:text-red-400">{error}</div>
      )}
      {!loading && !error && screenings.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
          No screening history found.
        </div>
      )}
      {!loading && !error && screenings.length > 0 && (
        <div className="p-4">
          {screenings.map((entry, idx) => (
            <TimelineEntry key={`${entry.screenedAt}-${idx}`} entry={entry} />
          ))}
        </div>
      )}
    </>
  );

  if (mode === 'modal') {
    return (
      <div className="fixed inset-0 z-[55] flex items-center justify-center">
        <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col mx-4">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Screening History
              </h2>
              {candidateName && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{candidateName}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1">{content}</div>
        </div>
      </div>
    );
  }

  // Inline mode — collapsible card
  return (
    <div className="card mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Screening History
          </h2>
          {!loading && screenings.length > 0 && (
            <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {screenings.length}
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {!collapsed && content}
    </div>
  );
}
