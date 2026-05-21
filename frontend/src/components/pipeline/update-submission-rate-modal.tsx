'use client';

import { useState } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatInr } from '@/lib/utils';

interface UpdateSubmissionRateModalProps {
  requirementId: string;
  candidateId: string;
  candidateName: string;
  currentRate?: number;
  internalRateHourly?: number;
  proposedRateHourly?: number;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function UpdateSubmissionRateModal({
  requirementId,
  candidateId,
  candidateName,
  currentRate,
  internalRateHourly,
  proposedRateHourly,
  isOpen,
  onClose,
  onUpdated,
}: UpdateSubmissionRateModalProps) {
  const [rate, setRate] = useState(currentRate?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const rateNum = parseFloat(rate);
  const isBelowMin = !isNaN(rateNum) && rateNum >= 0
    && internalRateHourly !== undefined
    && rateNum < internalRateHourly;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rate.trim() || isNaN(rateNum) || rateNum < 0) {
      setErrorMessage('A valid Quoted Rate is required.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      await api.updateSubmissionRate(requirementId, candidateId, { quotedRateHourly: rateNum });
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
              Quoted Rate (₹/hr) <span className="text-red-500">*</span>
            </label>
            {proposedRateHourly !== undefined && (
              <p className="text-xs text-gray-400 mb-1">
                Recommended Rate: {formatInr(proposedRateHourly)}/hr
                {internalRateHourly !== undefined && <> &middot; Minimum: {formatInr(internalRateHourly)}/hr</>}
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
                  Below minimum rate ({formatInr(internalRateHourly!)}/hr). You may still proceed.
                </p>
              </div>
            )}
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Saving...' : 'Update Rate'}
          </button>
        </form>
      </div>
    </div>
  );
}
