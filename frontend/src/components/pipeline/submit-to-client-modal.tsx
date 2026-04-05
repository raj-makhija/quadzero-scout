'use client';

import { useState } from 'react';
import { X, Loader2, AlertCircle, Send, MailCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface SubmitToClientModalProps {
  requirementId: string;
  candidateIds: string[];
  candidateNames: string[];
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  contactPersonName?: string;
}

export function SubmitToClientModal({
  requirementId,
  candidateIds,
  candidateNames,
  isOpen,
  onClose,
  onSubmitted,
  contactPersonName,
}: SubmitToClientModalProps) {
  const [clientEmail, setClientEmail] = useState('');
  const [clientName, setClientName] = useState(contactPersonName || '');
  const [coverNote, setCoverNote] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [offline, setOffline] = useState(false);
  const [offlineSentAt, setOfflineSentAt] = useState('');

  if (!isOpen) return null;

  const isBatch = candidateIds.length > 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!offline && !clientEmail.trim()) {
      setErrorMessage('Client email is required when sending via Scout.');
      return;
    }

    const parsedCcEmails = ccEmails
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    try {
      setLoading(true);
      setErrorMessage('');

      if (isBatch) {
        await api.submitBatchToClient(requirementId, {
          candidateIds,
          clientEmail: clientEmail.trim() || undefined!,
          clientName: clientName.trim() || undefined,
          coverNote: coverNote.trim() || undefined,
          ccEmails: parsedCcEmails.length > 0 ? parsedCcEmails : undefined,
        });
      } else {
        await api.submitCandidateToClient(requirementId, candidateIds[0], {
          clientEmail: clientEmail.trim() || undefined,
          clientName: clientName.trim() || undefined,
          coverNote: coverNote.trim() || undefined,
          ccEmails: parsedCcEmails.length > 0 ? parsedCcEmails : undefined,
          offline,
          offlineSentAt: offline && offlineSentAt
            ? new Date(offlineSentAt).toISOString()
            : undefined,
        });
      }

      toast({
        variant: 'success',
        title: offline
          ? 'Submission recorded (sent offline)'
          : isBatch
            ? `${candidateIds.length} candidates submitted to client`
            : 'Candidate submitted to client',
      });

      // Reset form
      setClientEmail('');
      setClientName(contactPersonName || '');
      setCoverNote('');
      setCcEmails('');
      setOffline(false);
      setOfflineSentAt('');
      onSubmitted();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to submit. Please try again.');
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
              Submit to Client
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isBatch ? `${candidateIds.length} candidates` : candidateNames[0]}
            </p>
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

          {/* Candidate list */}
          {isBatch && (
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">
                Candidates
              </label>
              <div className="flex flex-wrap gap-1">
                {candidateNames.map((name, idx) => (
                  <span
                    key={candidateIds[idx]}
                    className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded px-2 py-0.5"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Offline toggle */}
          {!isBatch && (
            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750">
              <input
                type="checkbox"
                checked={offline}
                onChange={(e) => setOffline(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email sent to client offline
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Mark as submitted without sending an email from Scout
                </p>
              </div>
              <MailCheck className="h-4 w-4 text-gray-400" />
            </label>
          )}

          {/* Offline sent date/time */}
          {offline && !isBatch && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                When was the email sent?
              </label>
              <input
                type="datetime-local"
                value={offlineSentAt}
                onChange={(e) => setOfflineSentAt(e.target.value)}
                className="input w-full text-sm"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Leave blank to use the current time
              </p>
            </div>
          )}

          {/* Client Email */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Client Email {!offline && <span className="text-red-500">*</span>}
            </label>
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@company.com"
              className="input w-full text-sm"
              required={!offline}
            />
            {offline && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Optional when recording an offline submission
              </p>
            )}
          </div>

          {/* Client Name */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Client Name
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Contact person name"
              className="input w-full text-sm"
            />
          </div>

          {/* Cover Note — hide for offline */}
          {!offline && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Cover Note
              </label>
              <textarea
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                placeholder="Optional cover note for the client..."
                className="input w-full text-sm"
                rows={3}
                maxLength={2000}
              />
            </div>
          )}

          {/* CC Emails — hide for offline */}
          {!offline && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                CC Emails
              </label>
              <input
                type="text"
                value={ccEmails}
                onChange={(e) => setCcEmails(e.target.value)}
                placeholder="email1@co.com, email2@co.com"
                className="input w-full text-sm"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Comma-separated email addresses
              </p>
            </div>
          )}

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {offline ? 'Recording...' : 'Sending...'}
                </>
              ) : offline ? (
                <>
                  <MailCheck className="h-4 w-4" />
                  Mark as Sent Offline
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {isBatch ? `Send ${candidateIds.length} Candidates` : 'Send'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
