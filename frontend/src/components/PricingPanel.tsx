'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, PricingOutput } from '@/lib/api';

interface RequirementContext {
  contractDurationMonths?: number;
  paymentTermsDays?: number;
  engagementModel?: string;
}

interface PricingPanelProps {
  candidateId?: string;
  candidateExpectedCtcLpa: number | undefined;
  candidateCurrentCtcLpa: number | undefined;
  candidateExperienceYears: number;
  isInternalRecruiter?: boolean;
  onCtcUpdated?: (expectedCtc: number, currentCtc?: number) => void;
  requirementContext?: RequirementContext;
}

const formatInr = (value: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

const BUDGET_CASE_LABELS: Record<string, string> = {
  A: 'Above client budget — margin constrained',
  B: 'Within budget range',
  C: 'Below budget floor — margin uplifted',
};

export function PricingPanel({
  candidateId,
  candidateExpectedCtcLpa,
  candidateCurrentCtcLpa,
  candidateExperienceYears,
  isInternalRecruiter,
  onCtcUpdated,
  requirementContext,
}: PricingPanelProps) {
  const [contractDuration, setContractDuration] = useState(
    requirementContext?.contractDurationMonths || 12
  );
  const [paymentTerms, setPaymentTerms] = useState(
    requirementContext?.paymentTermsDays || 90
  );
  const [engagementModel, setEngagementModel] = useState(
    requirementContext?.engagementModel || ''
  );
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PricingOutput | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // CTC editing state
  const [ctcCurrentInput, setCtcCurrentInput] = useState('');
  const [ctcExpectedInput, setCtcExpectedInput] = useState('');
  const [savingCtc, setSavingCtc] = useState(false);
  const [ctcError, setCtcError] = useState<string | null>(null);
  const [savedCtc, setSavedCtc] = useState<number | null>(null);

  const effectiveExpectedCtc = savedCtc ?? candidateExpectedCtcLpa;

  const handleCalculate = useCallback(async (expectedCtcOverride?: number) => {
    const ctcToUse = expectedCtcOverride ?? effectiveExpectedCtc;
    if (ctcToUse == null) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const input: Parameters<typeof api.calculatePricing>[0] = {
        candidateExpectedCtcLpa: ctcToUse,
        candidateExperienceYears,
        contractDurationMonths: contractDuration,
        paymentTermsDays: paymentTerms,
      };

      if (engagementModel) {
        input.engagementModel = engagementModel;
      }

      if (budgetMin && budgetMax) {
        input.clientBudgetMinHourly = parseFloat(budgetMin);
        input.clientBudgetMaxHourly = parseFloat(budgetMax);
      }

      const res = await api.calculatePricing(input);
      setResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setLoading(false);
    }
  }, [effectiveExpectedCtc, candidateExperienceYears, contractDuration, paymentTerms, engagementModel, budgetMin, budgetMax]);

  // Auto-calculate after CTC is saved
  const [autoCalcPending, setAutoCalcPending] = useState(false);
  useEffect(() => {
    if (autoCalcPending && savedCtc != null) {
      handleCalculate(savedCtc);
      setAutoCalcPending(false);
    }
  }, [autoCalcPending, savedCtc, handleCalculate]);

  // Auto-calculate on mount when requirement context is provided and CTC is available
  const autoCalcOnMountDone = useRef(false);
  useEffect(() => {
    if (requirementContext && effectiveExpectedCtc != null && !autoCalcOnMountDone.current && !result) {
      autoCalcOnMountDone.current = true;
      handleCalculate();
    }
  }, [requirementContext, effectiveExpectedCtc, handleCalculate, result]);

  const handleSaveCtc = async () => {
    if (!candidateId) return;

    const expectedVal = parseFloat(ctcExpectedInput);
    if (isNaN(expectedVal) || expectedVal <= 0) {
      setCtcError('Expected CTC is required and must be greater than 0');
      return;
    }
    if (expectedVal > 500) {
      setCtcError('Expected CTC must be 500 LPA or less');
      return;
    }

    const currentVal = ctcCurrentInput ? parseFloat(ctcCurrentInput) : undefined;
    if (currentVal !== undefined && (isNaN(currentVal) || currentVal < 0 || currentVal > 500)) {
      setCtcError('Current CTC must be between 0 and 500 LPA');
      return;
    }

    setSavingCtc(true);
    setCtcError(null);
    try {
      await api.updateCandidateCtc(candidateId, expectedVal, currentVal);
      setSavedCtc(expectedVal);
      onCtcUpdated?.(expectedVal, currentVal);
      setAutoCalcPending(true);
    } catch (err) {
      setCtcError(err instanceof Error ? err.message : 'Failed to save CTC');
    } finally {
      setSavingCtc(false);
    }
  };

  // Show CTC input form for internal recruiters when CTC is missing
  if (effectiveExpectedCtc == null) {
    if (isInternalRecruiter && candidateId) {
      return (
        <div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Billing Rate Calculator</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Candidate CTC not available. Enter CTC to calculate billing rate.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Current CTC (LPA)</label>
              <input
                type="number"
                min={0}
                max={500}
                step="0.1"
                placeholder="Optional"
                value={ctcCurrentInput}
                onChange={(e) => setCtcCurrentInput(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Expected CTC (LPA) *</label>
              <input
                type="number"
                min={0}
                max={500}
                step="0.1"
                placeholder="Required"
                value={ctcExpectedInput}
                onChange={(e) => setCtcExpectedInput(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          {ctcError && (
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">{ctcError}</p>
          )}
          <button
            onClick={handleSaveCtc}
            disabled={savingCtc}
            className="btn-primary w-full text-sm py-2"
          >
            {savingCtc ? 'Saving...' : 'Save & Calculate'}
          </button>
        </div>
      );
    }

    return (
      <div>
        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Billing Rate Calculator</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Candidate CTC not available. Cannot calculate billing rate.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-4">Billing Rate Calculator</h3>

      {/* Input Form */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="col-span-2">
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Engagement Model</label>
          <select
            value={engagementModel}
            onChange={(e) => setEngagementModel(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">Not specified</option>
            <option value="full_time_regular">Full-Time Regular</option>
            <option value="full_time_contract">Full-Time Contract</option>
            <option value="part_time_contract">Part-Time Contract</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Contract Duration</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={60}
              value={contractDuration}
              onChange={(e) => setContractDuration(parseInt(e.target.value) || 12)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">months</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Payment Terms</label>
          <select
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(parseInt(e.target.value))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value={30}>30 days</option>
            <option value={45}>45 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Budget Min (&#8377;/hr)</label>
          <input
            type="number"
            min={0}
            placeholder="Optional"
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Budget Max (&#8377;/hr)</label>
          <input
            type="number"
            min={0}
            placeholder="Optional"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      <button
        onClick={() => handleCalculate()}
        disabled={loading}
        className="btn-primary w-full text-sm py-2"
      >
        {loading ? 'Calculating...' : 'Calculate Billing Rate'}
      </button>

      {errorMsg && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 space-y-4">
          {/* Band Info */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Experience Band: <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{result.experienceBand}</span>
            {' | '}Monthly CTC: <span className="font-medium text-gray-700 dark:text-gray-300">{formatInr(result.monthlyCtcInr)}</span>
          </div>

          {/* Contract Duration Discount */}
          {result.contractDurationDiscountPct > 0 && (
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <div className="text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">Contract Duration Discount</div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Original Platform Fee</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatInr(result.originalPlatformFee)}/mo</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Discount</span>
                <span className="font-medium text-purple-700 dark:text-purple-300">-{(result.contractDurationDiscountPct * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Discounted Platform Fee</span>
                <span className="font-medium text-green-600 dark:text-green-400">{formatInr(result.platformFee)}/mo</span>
              </div>
            </div>
          )}

          {/* Final Recommended Rate */}
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="text-xs font-medium text-green-800 dark:text-green-300 mb-2">
              {result.budgetOptimization.applied ? 'Budget-Optimized Rate' : 'Recommended Quoted Rate'}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-green-700 dark:text-green-300">{formatInr(result.finalQuotedHourly)}</div>
                <div className="text-xs text-green-600 dark:text-green-400">per hour</div>
              </div>
              <div>
                <div className="text-lg font-bold text-green-700 dark:text-green-300">{formatInr(result.finalQuotedMonthly)}</div>
                <div className="text-xs text-green-600 dark:text-green-400">per month</div>
              </div>
              <div>
                <div className="text-lg font-bold text-green-700 dark:text-green-300">{formatInr(result.finalQuotedAnnual)}</div>
                <div className="text-xs text-green-600 dark:text-green-400">per annum</div>
              </div>
            </div>
          </div>

          {/* Internal Rates */}
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Internal Rates</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Quoted: </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatInr(result.quotedBillingMonthly)}/mo | {formatInr(result.quotedBillingHourly)}/hr
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Minimum: </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatInr(result.minimumBillingMonthly)}/mo | {formatInr(result.minimumBillingHourly)}/hr
                </span>
              </div>
            </div>
          </div>

          {/* Budget Optimization Details */}
          {result.budgetOptimization.applied && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2">Budget Optimization</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Client Budget</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatInr(result.budgetOptimization.clientBudgetMinHourly)} &ndash; {formatInr(result.budgetOptimization.clientBudgetMaxHourly)}/hr
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Internal Ideal</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatInr(Math.round(result.budgetOptimization.internalIdealHourly))}/hr
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Effective Multiplier</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {result.budgetOptimization.effectiveMultiplierOnCost.toFixed(2)}x on cost
                  </span>
                </div>
                <div className="mt-1 text-xs text-blue-700 dark:text-blue-400">
                  Case {result.budgetOptimization.budgetCase}: {BUDGET_CASE_LABELS[result.budgetOptimization.budgetCase]}
                </div>
              </div>
            </div>
          )}

          {/* Analysis */}
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Analysis</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Markup on CTC</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{result.finalEffectiveMarkupPct.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Net Contribution</span>
                <span className={`font-medium ${
                  result.finalContribution >= result.netContribution
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-yellow-600 dark:text-yellow-400'
                }`}>
                  {formatInr(result.finalContribution)}/mo
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Working Capital</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatInr(result.workingCapitalCostPerMonth)}/mo</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Break-even</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{result.recruiterBreakeven} engineers</span>
              </div>
            </div>
          </div>

          {/* Warning Badges */}
          <div className="space-y-1">
            {result.variableMarkupAdjusted && (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Variable markup auto-adjusted from {(result.variableMarkupPct * 100).toFixed(0)}% to {(result.adjustedVariableMarkupPct * 100).toFixed(1)}%
              </div>
            )}
            {result.budgetOptimization.marginConstrained && (
              <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Margin constrained &mdash; deal below ideal contribution
              </div>
            )}
            {result.budgetOptimization.marginUplifted && (
              <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Margin uplifted by budget optimization (audit flag)
              </div>
            )}
            {result.budgetOptimization.contributionCapped && (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Contribution capped at maximum threshold
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
