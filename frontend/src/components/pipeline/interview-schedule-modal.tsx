'use client';

import { useState } from 'react';
import { X, Loader2, AlertCircle, Calendar } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { InterviewType } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const INTERVIEW_TYPES: { value: InterviewType; label: string }[] = [
  { value: 'phone', label: 'Phone' },
  { value: 'video', label: 'Video' },
  { value: 'in_person', label: 'In Person' },
  { value: 'assignment', label: 'Assignment' },
];

interface InterviewScheduleModalProps {
  requirementId: string;
  candidateId: string;
  candidateName: string;
  isOpen: boolean;
  onClose: () => void;
  onScheduled: (toStage?: string) => void;
  currentRound?: number;
}

export function InterviewScheduleModal({
  requirementId,
  candidateId,
  candidateName,
  isOpen,
  onClose,
  onScheduled,
  currentRound,
}: InterviewScheduleModalProps) {
  const [round, setRound] = useState(currentRound ? currentRound + 1 : 1);
  const [interviewType, setInterviewType] = useState<InterviewType>('video');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [interviewerName, setInterviewerName] = useState('');
  const [interviewerEmail, setInterviewerEmail] = useState('');
  const [locationOrLink, setLocationOrLink] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!scheduledAt) {
      setErrorMessage('Date and time are required.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      await api.scheduleInterview(requirementId, candidateId, {
        round,
        interviewType,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes: durationMinutes ? parseInt(durationMinutes) : undefined,
        interviewerName: interviewerName.trim() || undefined,
        interviewerEmail: interviewerEmail.trim() || undefined,
        locationOrLink: locationOrLink.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      toast({ variant: 'success', title: `Interview round ${round} scheduled` });

      // Reset form
      setRound(currentRound ? currentRound + 1 : 1);
      setInterviewType('video');
      setScheduledAt('');
      setDurationMinutes('');
      setInterviewerName('');
      setInterviewerEmail('');
      setLocationOrLink('');
      setNotes('');
      onScheduled('interview_scheduled');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to schedule interview. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Schedule Interview
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{candidateName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Error */}
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
            </div>
          )}

          {/* Round and Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Round
              </label>
              <input
                type="number"
                min={1}
                value={round}
                onChange={(e) => setRound(parseInt(e.target.value) || 1)}
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Type
              </label>
              <select
                value={interviewType}
                onChange={(e) => setInterviewType(e.target.value as InterviewType)}
                className="input w-full text-sm"
              >
                {INTERVIEW_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Time */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Date & Time <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="input w-full text-sm"
              required
            />
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Duration (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={480}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="e.g. 60"
              className="input w-full text-sm"
            />
          </div>

          {/* Interviewer Name and Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Interviewer Name
              </label>
              <input
                type="text"
                value={interviewerName}
                onChange={(e) => setInterviewerName(e.target.value)}
                placeholder="Name"
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Interviewer Email
              </label>
              <input
                type="email"
                value={interviewerEmail}
                onChange={(e) => setInterviewerEmail(e.target.value)}
                placeholder="email@company.com"
                className="input w-full text-sm"
              />
            </div>
          </div>

          {/* Location/Link */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Link / Location
            </label>
            <input
              type="text"
              value={locationOrLink}
              onChange={(e) => setLocationOrLink(e.target.value)}
              placeholder="Zoom link or office address"
              className="input w-full text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes for the interview..."
              className="input w-full text-sm"
              rows={3}
              maxLength={2000}
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4" />
                  Schedule Interview
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
