'use client';

import { useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type {
  ClientFeedbackRating,
  InterviewFeedbackRating,
  InterviewDecision,
  CommunicationSource,
} from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const CLIENT_RATINGS: { value: ClientFeedbackRating; label: string; color: string }[] = [
  { value: 'positive', label: 'Positive', color: 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 dark:border-green-400' },
  { value: 'neutral', label: 'Neutral', color: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-400' },
  { value: 'negative', label: 'Negative', color: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 dark:border-red-400' },
];

const INTERVIEW_RATINGS: { value: InterviewFeedbackRating; label: string; color: string }[] = [
  { value: 'strong_yes', label: 'Strong Yes', color: 'border-green-600 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 dark:border-green-400' },
  { value: 'yes', label: 'Yes', color: 'border-green-400 bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300 dark:border-green-500' },
  { value: 'neutral', label: 'Neutral', color: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-400' },
  { value: 'no', label: 'No', color: 'border-red-400 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300 dark:border-red-500' },
  { value: 'strong_no', label: 'Strong No', color: 'border-red-600 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 dark:border-red-400' },
];

const DECISIONS: { value: InterviewDecision; label: string; color: string }[] = [
  { value: 'proceed', label: 'Proceed', color: 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 dark:border-green-400' },
  { value: 'reject', label: 'Reject', color: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 dark:border-red-400' },
  { value: 'hold', label: 'Hold', color: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-400' },
];

const SOURCE_OPTIONS: { value: CommunicationSource; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
  { value: 'chat', label: 'Chat' },
];

interface FeedbackFormModalProps {
  requirementId: string;
  candidateId: string;
  candidateName: string;
  mode: 'client' | 'interview';
  isOpen: boolean;
  onClose: () => void;
  onRecorded: () => void;
  currentRound?: number;
}

export function FeedbackFormModal({
  requirementId,
  candidateId,
  candidateName,
  mode,
  isOpen,
  onClose,
  onRecorded,
  currentRound,
}: FeedbackFormModalProps) {
  // Client feedback state
  const [clientRating, setClientRating] = useState<ClientFeedbackRating | ''>('');
  const [feedbackText, setFeedbackText] = useState('');
  const [source, setSource] = useState<CommunicationSource>('email');

  // Interview feedback state
  const [round, setRound] = useState(currentRound ? currentRound : 1);
  const [interviewRating, setInterviewRating] = useState<InterviewFeedbackRating | ''>('');
  const [decision, setDecision] = useState<InterviewDecision | ''>('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const isClient = mode === 'client';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!feedbackText.trim()) {
      setErrorMessage('Feedback text is required.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      if (isClient) {
        if (!clientRating) {
          setErrorMessage('Please select a rating.');
          setLoading(false);
          return;
        }
        await api.recordClientFeedback(requirementId, candidateId, {
          rating: clientRating,
          feedbackText: feedbackText.trim(),
          source,
        });
      } else {
        if (!interviewRating) {
          setErrorMessage('Please select a rating.');
          setLoading(false);
          return;
        }
        if (!decision) {
          setErrorMessage('Please select a decision.');
          setLoading(false);
          return;
        }
        await api.recordInterviewFeedback(requirementId, candidateId, {
          round,
          rating: interviewRating,
          feedbackText: feedbackText.trim(),
          source,
          decision,
        });
      }

      toast({
        variant: 'success',
        title: isClient ? 'Client feedback recorded' : 'Interview feedback recorded',
      });

      // Reset form
      setClientRating('');
      setInterviewRating('');
      setDecision('');
      setFeedbackText('');
      setSource('email');
      onRecorded();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to record feedback. Please try again.');
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
              {isClient ? 'Record Client Feedback' : 'Record Interview Feedback'}
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

          {/* Round (interview mode only) */}
          {!isClient && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Round
              </label>
              <input
                type="number"
                min={1}
                value={round}
                onChange={(e) => setRound(parseInt(e.target.value) || 1)}
                className="input w-24 text-sm"
              />
            </div>
          )}

          {/* Rating */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              Rating <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {isClient
                ? CLIENT_RATINGS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setClientRating(opt.value)}
                      className={`px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-colors ${
                        clientRating === opt.value
                          ? opt.color
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))
                : INTERVIEW_RATINGS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setInterviewRating(opt.value)}
                      className={`px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-colors ${
                        interviewRating === opt.value
                          ? opt.color
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
            </div>
          </div>

          {/* Feedback text */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Feedback <span className="text-red-500">*</span>
            </label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Enter feedback details..."
              className="input w-full text-sm"
              rows={4}
              required
              maxLength={5000}
            />
          </div>

          {/* Source */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Source
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as CommunicationSource)}
              className="input text-sm"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Decision (interview mode only) */}
          {!isClient && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                Decision <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {DECISIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDecision(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-colors ${
                      decision === opt.value
                        ? opt.color
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                  Recording...
                </>
              ) : (
                'Record Feedback'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
