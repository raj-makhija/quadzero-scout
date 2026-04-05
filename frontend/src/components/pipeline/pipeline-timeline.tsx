'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Loader2,
  ArrowRight,
  MessageSquare,
  Calendar,
  ClipboardCheck,
  Mail,
  StickyNote,
  Send,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { PipelineActivityItem, CommunicationSource } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  stage_change: <ArrowRight className="h-4 w-4 text-blue-500" />,
  client_feedback: <MessageSquare className="h-4 w-4 text-purple-500" />,
  interview_scheduled: <Calendar className="h-4 w-4 text-amber-500" />,
  interview_feedback: <ClipboardCheck className="h-4 w-4 text-orange-500" />,
  email_sent: <Mail className="h-4 w-4 text-indigo-500" />,
  note: <StickyNote className="h-4 w-4 text-green-500" />,
  offer_extended: <ArrowRight className="h-4 w-4 text-emerald-500" />,
  offer_response: <ArrowRight className="h-4 w-4 text-green-600" />,
};

const ACTIVITY_LABELS: Record<string, string> = {
  stage_change: 'Stage Change',
  client_feedback: 'Client Feedback',
  interview_scheduled: 'Interview Scheduled',
  interview_feedback: 'Interview Feedback',
  email_sent: 'Email Sent',
  note: 'Note',
  offer_extended: 'Offer Extended',
  offer_response: 'Offer Response',
};

const SOURCE_OPTIONS: { value: CommunicationSource; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
  { value: 'chat', label: 'Chat' },
  { value: 'internal', label: 'Internal' },
];

function ActivityContent({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([key]) => !['activity_type', 'requirement_candidate_key', 'activity_id'].includes(key)
  );

  if (entries.length === 0) return null;

  return (
    <div className="mt-1 space-y-0.5">
      {entries.map(([key, value]) => {
        if (value === null || value === undefined) return null;
        const label = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return (
          <p key={key} className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">{label}:</span>{' '}
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </p>
        );
      })}
    </div>
  );
}

interface PipelineTimelineProps {
  requirementId: string;
  candidateId: string;
  candidateName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PipelineTimeline({
  requirementId,
  candidateId,
  candidateName,
  isOpen,
  onClose,
}: PipelineTimelineProps) {
  const [activities, setActivities] = useState<PipelineActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastKey, setLastKey] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  // Note form state
  const [noteText, setNoteText] = useState('');
  const [noteSource, setNoteSource] = useState<CommunicationSource>('internal');
  const [addingNote, setAddingNote] = useState(false);

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getCandidateActivities(requirementId, candidateId, 20);
      setActivities(result.activities);
      setHasMore(result.pagination.hasMore);
      setLastKey(result.pagination.lastEvaluatedKey);
    } catch {
      setError('Failed to load activities.');
    } finally {
      setLoading(false);
    }
  }, [requirementId, candidateId]);

  useEffect(() => {
    if (isOpen) {
      fetchActivities();
    }
  }, [isOpen, fetchActivities]);

  const handleLoadMore = async () => {
    if (!lastKey || loadingMore) return;
    try {
      setLoadingMore(true);
      const result = await api.getCandidateActivities(
        requirementId,
        candidateId,
        20,
        lastKey
      );
      setActivities((prev) => [...prev, ...result.activities]);
      setHasMore(result.pagination.hasMore);
      setLastKey(result.pagination.lastEvaluatedKey);
    } catch {
      toast({ variant: 'error', title: 'Failed to load more activities' });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      setAddingNote(true);
      await api.addPipelineNote(requirementId, candidateId, noteText.trim(), noteSource);
      setNoteText('');
      setNoteSource('internal');
      toast({ variant: 'success', title: 'Note added' });
      fetchActivities();
    } catch {
      toast({ variant: 'error', title: 'Failed to add note' });
    } finally {
      setAddingNote(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 shadow-xl flex flex-col h-full animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Timeline</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{candidateName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Add Note form */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            className="input w-full text-sm"
            rows={2}
            maxLength={2000}
          />
          <div className="flex items-center gap-2">
            <select
              value={noteSource}
              onChange={(e) => setNoteSource(e.target.value as CommunicationSource)}
              className="input text-sm flex-shrink-0"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddNote}
              disabled={!noteText.trim() || addingNote}
              className="btn-primary text-sm flex items-center gap-1 flex-shrink-0"
            >
              {addingNote ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              Add Note
            </button>
          </div>
        </div>

        {/* Activities */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && activities.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                Loading activities...
              </span>
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-sm text-red-500 dark:text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && activities.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
              No activities yet.
            </div>
          )}

          {activities.length > 0 && (
            <div className="space-y-0">
              {activities.map((activity, idx) => (
                <div key={activity.activity_id} className="relative pl-8 pb-6 last:pb-0">
                  {/* Timeline line */}
                  {idx < activities.length - 1 && (
                    <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                  )}
                  {/* Icon */}
                  <div className="absolute left-0 top-0.5 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    {ACTIVITY_ICONS[activity.activity_type] || (
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {ACTIVITY_LABELS[activity.activity_type] || activity.activity_type}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {formatRelativeTime(activity.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      by {activity.created_by}
                    </p>
                    <ActivityContent data={activity.data} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <div className="pt-4 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1 mx-auto"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load more'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
