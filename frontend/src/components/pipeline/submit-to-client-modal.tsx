'use client';

import { useState } from 'react';
import { X, Loader2, AlertCircle, Send, MailCheck, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { PipelineCandidateView, QuotedRateDenomination } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatInr } from '@/lib/utils';

const DENOM_LABELS: Record<QuotedRateDenomination, string> = {
  hourly: '/hr',
  monthly: '/mo',
  annual: '/yr',
};

const HOURS_PER_MONTH = 160;

function referenceRateInDenom(
  hourlyRate: number | undefined,
  monthlyRate: number | undefined,
  denomination: QuotedRateDenomination
): string | null {
  if (hourlyRate === undefined) return null;
  switch (denomination) {
    case 'hourly': return `${formatInr(hourlyRate)}/hr`;
    case 'monthly': return `${formatInr(monthlyRate ?? hourlyRate * HOURS_PER_MONTH)}/mo`;
    case 'annual': return `${formatInr((monthlyRate ?? hourlyRate * HOURS_PER_MONTH) * 12)}/yr`;
  }
}

function internalRateInDenom(
  hourlyRate: number | undefined,
  monthlyRate: number | undefined,
  denomination: QuotedRateDenomination
): number | undefined {
  if (hourlyRate === undefined) return undefined;
  switch (denomination) {
    case 'hourly': return hourlyRate;
    case 'monthly': return monthlyRate ?? hourlyRate * HOURS_PER_MONTH;
    case 'annual': return (monthlyRate ?? hourlyRate * HOURS_PER_MONTH) * 12;
  }
}

interface SubmitToClientModalProps {
  requirementId: string;
  candidates: Pick<PipelineCandidateView, 'candidateId' | 'fullName' | 'proposedRateHourly' | 'proposedRateMonthly' | 'internalRateHourly' | 'internalRateMonthly'>[];
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  contactPersonName?: string;
}

export function SubmitToClientModal({
  requirementId,
  candidates,
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
  const [singleRate, setSingleRate] = useState('');
  const [batchRates, setBatchRates] = useState<Record<string, string>>({});
  const [denomination, setDenomination] = useState<QuotedRateDenomination>('hourly');
  const [gstInclusive, setGstInclusive] = useState(false);

  if (!isOpen) return null;

  const isBatch = candidates.length > 1;

  const getSingleRateNum = () => {
    const val = parseFloat(singleRate);
    return isNaN(val) ? -1 : val;
  };

  const single = candidates[0];
  const singleRateNum = getSingleRateNum();
  const singleInternalInDenom = internalRateInDenom(single?.internalRateHourly, single?.internalRateMonthly, denomination);
  const isSingleBelowMin = singleRateNum >= 0
    && singleInternalInDenom !== undefined
    && singleRateNum < singleInternalInDenom;

  const denomSuffix = DENOM_LABELS[denomination];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!offline && !clientEmail.trim()) {
      setErrorMessage('Client email is required when sending via Scout.');
      return;
    }

    if (isBatch) {
      const missing: string[] = [];
      for (const c of candidates) {
        const val = parseFloat(batchRates[c.candidateId] || '');
        if (isNaN(val) || val < 0) missing.push(c.fullName);
      }
      if (missing.length > 0) {
        setErrorMessage(`Quoted Rate is required for: ${missing.join(', ')}`);
        return;
      }
    } else {
      if (!singleRate.trim() || isNaN(singleRateNum) || singleRateNum < 0) {
        setErrorMessage('Quoted Rate is required.');
        return;
      }
    }

    const parsedCcEmails = ccEmails
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    try {
      setLoading(true);
      setErrorMessage('');

      if (isBatch) {
        const quotedRates: Record<string, number> = {};
        for (const c of candidates) {
          quotedRates[c.candidateId] = parseFloat(batchRates[c.candidateId]);
        }
        await api.submitBatchToClient(requirementId, {
          candidateIds: candidates.map(c => c.candidateId),
          clientEmail: clientEmail.trim() || undefined!,
          clientName: clientName.trim() || undefined,
          coverNote: coverNote.trim() || undefined,
          ccEmails: parsedCcEmails.length > 0 ? parsedCcEmails : undefined,
          quotedRates,
          quotedRateDenomination: denomination,
          quotedRateGstInclusive: gstInclusive,
        });
      } else {
        await api.submitCandidateToClient(requirementId, candidates[0].candidateId, {
          clientEmail: clientEmail.trim() || undefined,
          clientName: clientName.trim() || undefined,
          coverNote: coverNote.trim() || undefined,
          ccEmails: parsedCcEmails.length > 0 ? parsedCcEmails : undefined,
          offline,
          offlineSentAt: offline && offlineSentAt
            ? new Date(offlineSentAt).toISOString()
            : undefined,
          quotedRateHourly: singleRateNum,
          quotedRateDenomination: denomination,
          quotedRateGstInclusive: gstInclusive,
        });
      }

      toast({
        variant: 'success',
        title: offline
          ? 'Submission recorded (sent offline)'
          : isBatch
            ? `${candidates.length} candidates submitted to client`
            : 'Candidate submitted to client',
      });

      setClientEmail('');
      setClientName(contactPersonName || '');
      setCoverNote('');
      setCcEmails('');
      setOffline(false);
      setOfflineSentAt('');
      setSingleRate('');
      setBatchRates({});
      setDenomination('hourly');
      setGstInclusive(false);
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
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Submit to Client
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isBatch ? `${candidates.length} candidates` : candidates[0]?.fullName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
            </div>
          )}

          {/* Rate denomination selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rate type:</label>
            <select
              value={denomination}
              onChange={(e) => setDenomination(e.target.value as QuotedRateDenomination)}
              className="input text-sm py-1"
            >
              <option value="hourly">Per Hour</option>
              <option value="monthly">Per Month</option>
              <option value="annual">Per Annum</option>
            </select>
          </div>

          {/* Quoted Rate — single candidate */}
          {!isBatch && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Quoted Rate (₹{denomSuffix}) <span className="text-red-500">*</span>
              </label>
              {single?.proposedRateHourly !== undefined && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Recommended: {referenceRateInDenom(single.proposedRateHourly, single.proposedRateMonthly, denomination)}
                  {single.internalRateHourly !== undefined && (
                    <> &middot; Minimum: {referenceRateInDenom(single.internalRateHourly, single.internalRateMonthly, denomination)}</>
                  )}
                </p>
              )}
              <input
                type="number"
                min="0"
                step="any"
                value={singleRate}
                onChange={(e) => setSingleRate(e.target.value)}
                placeholder="Enter quoted rate"
                className="input w-full text-sm"
              />
              {isSingleBelowMin && (
                <div className="mt-1.5 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Below minimum rate ({formatInr(singleInternalInDenom!)}{denomSuffix}). You may still proceed.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quoted Rates — batch */}
          {isBatch && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
                Quoted Rate per Candidate (₹{denomSuffix}) <span className="text-red-500">*</span>
              </label>
              {candidates.map((c) => {
                const rateVal = parseFloat(batchRates[c.candidateId] || '');
                const cInternalInDenom = internalRateInDenom(c.internalRateHourly, c.internalRateMonthly, denomination);
                const belowMin = !isNaN(rateVal) && rateVal >= 0
                  && cInternalInDenom !== undefined
                  && rateVal < cInternalInDenom;
                return (
                  <div key={c.candidateId}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 dark:text-gray-300 w-32 truncate flex-shrink-0">{c.fullName}</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={batchRates[c.candidateId] || ''}
                        onChange={(e) => setBatchRates(prev => ({ ...prev, [c.candidateId]: e.target.value }))}
                        placeholder="Rate"
                        className="input flex-1 text-sm"
                      />
                    </div>
                    {c.proposedRateHourly !== undefined && (
                      <p className="text-xs text-gray-400 mt-0.5 ml-[8.5rem]">
                        Rec: {referenceRateInDenom(c.proposedRateHourly, c.proposedRateMonthly, denomination)}
                        {c.internalRateHourly !== undefined && <> &middot; Min: {referenceRateInDenom(c.internalRateHourly, c.internalRateMonthly, denomination)}</>}
                      </p>
                    )}
                    {belowMin && (
                      <div className="mt-1 ml-[8.5rem] p-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-300">Below minimum. You may still proceed.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* GST inclusive checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={gstInclusive}
              onChange={(e) => setGstInclusive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">GST inclusive</span>
          </label>

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
                  {isBatch ? `Send ${candidates.length} Candidates` : 'Send'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
