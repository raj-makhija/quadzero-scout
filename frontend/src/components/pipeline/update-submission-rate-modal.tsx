'use client';

import { useState } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatInr } from '@/lib/utils';
import {
  type QuotedRateDenomination,
  DENOMINATION_LABELS,
  DENOMINATION_SUFFIXES,
  getReferenceRateInDenom,
} from '@/lib/rateUtils';

interface UpdateSubmissionRateModalProps {
  requirementId: string;
  candidateId: string;
  candidateName: string;
  currentRate?: number;
  currentDenomination?: QuotedRateDenomination;
  currentGstInclusive?: boolean;
  internalRateHourly?: number;
  internalRateMonthly?: number;
  proposedRateHourly?: number;
  proposedRateMonthly?: number;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function UpdateSubmissionRateModal({
  requirementId,
  candidateId,
  candidateName,
  currentRate,
  currentDenomination,
  currentGstInclusive,
  internalRateHourly,
  internalRateMonthly,
  proposedRateHourly,
  proposedRateMonthly,
  isOpen,
  onClose,
  onUpdated,
}: UpdateSubmissionRateModalProps) {
  const [rate, setRate] = useState(currentRate?.toString() || '');
  const [denomination, setDenomination] = useState<QuotedRateDenomination>(currentDenomination || 'hourly');
  const [gstInclusive, setGstInclusive] = useState(currentGstInclusive || false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const rateNum = parseFloat(rate);
  const internalInDenom = getReferenceRateInDenom(internalRateHourly, internalRateMonthly, denomination);
  const isBelowMin = !isNaN(rateNum) && rateNum >= 0
    && internalInDenom !== undefined
    && rateNum < internalInDenom;

  const denomSuffix = DENOMINATION_SUFFIXES[denomination];
  const proposedInDenom = getReferenceRateInDenom(proposedRateHourly, proposedRateMonthly, denomination);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rate.trim() || isNaN(rateNum) || rateNum < 0) {
      setErrorMessage('A valid Quoted Rate is required.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      await api.updateSubmissionRate(requirementId, candidateId, {
        quotedRateHourly: rateNum,
        quotedRateDenomination: denomination,
        quotedRateGstInclusive: gstInclusive,
      });
      toast({ variant: 'success', title: 'Quoted Rate updated' });
      onUpdated();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to update rate. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Edit Quoted Rate</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{candidateName}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {errorMessage && (
            <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
          )}
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Rate Type
            </label>
            <select
              value={denomination}
              onChange={(e) => setDenomination(e.target.value as QuotedRateDenomination)}
              className="input w-full text-sm"
            >
              {(Object.keys(DENOMINATION_LABELS) as QuotedRateDenomination[]).map((d) => (
                <option key={d} value={d}>{DENOMINATION_LABELS[d]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Quoted Rate (₹{denomSuffix}) <span className="text-red-500">*</span>
            </label>
            {proposedInDenom !== undefined && (
              <p className="text-xs text-gray-400 mb-1">
                Recommended: {formatInr(proposedInDenom)}{denomSuffix}
                {internalInDenom !== undefined && <> &middot; Minimum: {formatInr(internalInDenom)}{denomSuffix}</>}
              </p>
            )}
            <input
              type="number"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="input w-full text-sm"
              autoFocus
            />
            {isBelowMin && (
              <div className="mt-1.5 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Below minimum rate ({formatInr(internalInDenom!)}{denomSuffix}). You may still proceed.
                </p>
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={gstInclusive}
              onChange={(e) => setGstInclusive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">GST inclusive</span>
          </label>
          <button type="submit" disabled={loading} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Saving...' : 'Update Rate'}
          </button>
        </form>
      </div>
    </div>
  );
}
