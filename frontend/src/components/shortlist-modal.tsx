'use client';

import { useState, useCallback } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { CandidateSearchResult, SearchCriteria, PricingOutput } from '@/lib/api';
import { PricingPanel } from '@/components/PricingPanel';
import { getScreeningStatus, isScreeningExpired } from '@/components/screening-modal';
import {
  formatSeniority,
  formatAvailability,
  formatCandidateEngagement,
  getMatchScoreColor,
  getMatchScoreBgColor,
  formatDate,
} from '@/lib/utils';

interface RequirementContext {
  requirementId: string;
  clientName: string;
  jobTitle?: string;
  engagementModel: string;
  contractDurationMonths?: number;
  paymentTermsDays?: number;
  budgetMinLpa?: number;
  budgetMaxLpa?: number;
  isRateGstInclusive?: boolean;
}

interface ShortlistModalProps {
  candidate: CandidateSearchResult;
  requirementContext: RequirementContext | null;
  searchCriteria: SearchCriteria;
  isInternalRecruiter?: boolean;
  onClose: () => void;
  onShortlisted: (candidateId: string) => void;
  onRescreen: (candidate: CandidateSearchResult) => void;
  onCtcUpdated?: (expectedCtc: number, currentCtc?: number) => void;
  onViewResume?: (candidateId: string) => void;
  onViewOriginalResume?: (candidateId: string) => void;
  formattingCandidateId?: string | null;
  onSaveRequirement?: () => void;
}

export function ShortlistModal({
  candidate,
  requirementContext,
  searchCriteria,
  isInternalRecruiter,
  onClose,
  onShortlisted,
  onRescreen,
  onCtcUpdated,
  onViewResume,
  onViewOriginalResume,
  formattingCandidateId,
  onSaveRequirement,
}: ShortlistModalProps) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmNotInterested, setConfirmNotInterested] = useState(false);
  const [pricingResult, setPricingResult] = useState<PricingOutput | null>(null);

  const isShortlistMode = requirementContext != null;

  const handleShortlist = useCallback(async () => {
    if (!requirementContext) return;
    setLoading(true);
    setErrorMessage('');
    try {
      await api.shortlistCandidate(
        requirementContext.requirementId,
        candidate.candidateId,
        notes || undefined,
        pricingResult ? {
          proposedRateHourly: pricingResult.finalQuotedHourly,
          proposedRateMonthly: pricingResult.finalQuotedMonthly,
          proposedRateAnnual: pricingResult.finalQuotedAnnual,
          internalRateHourly: pricingResult.minimumBillingHourly,
          internalRateMonthly: pricingResult.minimumBillingMonthly,
          internalRateAnnual: pricingResult.minimumBillingAnnual,
        } : undefined
      );
      onShortlisted(candidate.candidateId);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_ERROR' && err.message.includes('already shortlisted')) {
          onShortlisted(candidate.candidateId);
          return;
        }
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to shortlist candidate. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [requirementContext, candidate.candidateId, notes, onShortlisted, pricingResult]);

  const screeningStatus = getScreeningStatus(candidate.lastScreenedAt, candidate.notInterested);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isShortlistMode
                ? `Shortlist for ${requirementContext.clientName}`
                : candidate.fullName
              }
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isShortlistMode ? (
                <>
                  {candidate.fullName}
                  {requirementContext.jobTitle && (
                    <span className="ml-2">&middot; {requirementContext.jobTitle}</span>
                  )}
                </>
              ) : (
                <>
                  {candidate.totalExperience} yrs &middot; {candidate.location || 'Location not specified'}
                </>
              )}
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
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Error message */}
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
            </div>
          )}

          {/* Not Interested Warning */}
          {candidate.notInterested && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  Candidate marked as Not Interested
                </p>
                {candidate.notInterestedAt && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">
                    Marked on {formatDate(candidate.notInterestedAt)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Match Score */}
          <div className={`p-4 rounded-lg ${getMatchScoreBgColor(candidate.matchScore)}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">Match Score</span>
              <span className={`text-2xl font-bold ${getMatchScoreColor(candidate.matchScore)}`}>
                {candidate.matchScore}%
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Experience</label>
              <p className="font-medium">{candidate.totalExperience} years</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Seniority</label>
              <p className="font-medium">{formatSeniority(candidate.seniority)}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Location</label>
              <p className="font-medium">{candidate.location || 'Not specified'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Notice Period</label>
              <p className="font-medium">{formatAvailability(candidate.availability)}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Engagement Preference</label>
              <p className="font-medium">{formatCandidateEngagement(candidate.engagementModel || 'either')}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Current CTC</label>
              <p className="font-medium">{candidate.currentCtc ? `${candidate.currentCtc} LPA` : 'Not specified'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Expected CTC</label>
              <p className="font-medium">{candidate.expectedCtc ? `${candidate.expectedCtc} LPA` : 'Not specified'}</p>
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 mb-2 block">Skills</label>
            <div className="flex flex-wrap gap-2">
              {candidate.primarySkills.map((skill) => (
                <span
                  key={skill}
                  className={`badge ${
                    candidate.matchDetails.mustHaveMatched.includes(skill)
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : candidate.matchDetails.goodToHaveMatched.includes(skill)
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Match Analysis */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="font-medium mb-3">Match Analysis</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center text-green-600 dark:text-green-400">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Must-have matched: {candidate.matchDetails.mustHaveMatched.join(', ') || 'None'}
              </div>
              {candidate.matchDetails.mustHaveRelated?.length > 0 && (
                <div className="flex items-center text-yellow-600 dark:text-yellow-400">
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Related (not scored): {candidate.matchDetails.mustHaveRelated.join(', ')}
                </div>
              )}
              {candidate.matchDetails.mustHaveMissing.length > 0 && (
                <div className="flex items-center text-red-600 dark:text-red-400">
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Missing: {candidate.matchDetails.mustHaveMissing.join(', ')}
                </div>
              )}
              <div className="flex items-center text-blue-600 dark:text-blue-400">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Nice-to-have matched: {candidate.matchDetails.goodToHaveMatched.join(', ') || 'None'}
              </div>
              {candidate.matchDetails.goodToHaveRelated?.length > 0 && (
                <div className="flex items-center text-blue-400 dark:text-blue-500">
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Nice-to-have related: {candidate.matchDetails.goodToHaveRelated.join(', ')}
                </div>
              )}
              {searchCriteria.maxBudgetLpa && (
                <div className={`flex items-center ${candidate.matchDetails.ctcMatch ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={candidate.matchDetails.ctcMatch ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} />
                  </svg>
                  {candidate.matchDetails.ctcMatch ? 'Within budget' : 'Over budget'}
                </div>
              )}
              {searchCriteria.location && (
                <div className={`flex items-center ${
                  candidate.matchDetails.locationMatch === 'full'
                    ? 'text-green-600 dark:text-green-400'
                    : candidate.matchDetails.locationMatch === 'partial'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }`}>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                      candidate.matchDetails.locationMatch === 'full'
                        ? 'M5 13l4 4L19 7'
                        : candidate.matchDetails.locationMatch === 'partial'
                          ? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                          : 'M6 18L18 6M6 6l12 12'
                    } />
                  </svg>
                  {candidate.matchDetails.locationMatch === 'full'
                    ? `Location match: ${candidate.location || 'Unknown'}`
                    : candidate.matchDetails.locationMatch === 'partial'
                      ? 'Location not specified'
                      : `Location mismatch: ${candidate.location || 'Unknown'} (looking for ${searchCriteria.location})`
                  }
                </div>
              )}
              {(searchCriteria.minExperience != null || searchCriteria.maxExperience != null) && (
                <div className={`flex items-center ${
                  candidate.matchDetails.experienceMatch === 'full'
                    ? 'text-green-600 dark:text-green-400'
                    : candidate.matchDetails.experienceMatch === 'partial'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }`}>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                      candidate.matchDetails.experienceMatch === 'full'
                        ? 'M5 13l4 4L19 7'
                        : candidate.matchDetails.experienceMatch === 'partial'
                          ? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                          : 'M6 18L18 6M6 6l12 12'
                    } />
                  </svg>
                  {candidate.matchDetails.experienceMatch === 'full'
                    ? `Experience in range: ${candidate.totalExperience} yrs`
                    : candidate.matchDetails.experienceMatch === 'partial'
                      ? `Experience close to range: ${candidate.totalExperience} yrs (looking for ${searchCriteria.minExperience ?? 0}–${searchCriteria.maxExperience ?? '∞'} yrs)`
                      : `Experience outside range: ${candidate.totalExperience} yrs (looking for ${searchCriteria.minExperience ?? 0}–${searchCriteria.maxExperience ?? '∞'} yrs)`
                  }
                </div>
              )}
              {searchCriteria.availability && searchCriteria.availability.length > 0 && (
                <div className={`flex items-center ${
                  candidate.matchDetails.availabilityMatch === 'full'
                    ? 'text-green-600 dark:text-green-400'
                    : candidate.matchDetails.availabilityMatch === 'partial'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }`}>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                      candidate.matchDetails.availabilityMatch === 'full'
                        ? 'M5 13l4 4L19 7'
                        : candidate.matchDetails.availabilityMatch === 'partial'
                          ? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                          : 'M6 18L18 6M6 6l12 12'
                    } />
                  </svg>
                  {candidate.matchDetails.availabilityMatch === 'full'
                    ? `Availability matches: ${formatAvailability(candidate.availability)}`
                    : candidate.matchDetails.availabilityMatch === 'partial'
                      ? `Available slightly later: ${formatAvailability(candidate.availability)} (looking for ${searchCriteria.availability.map(a => formatAvailability(a)).join(', ')})`
                      : `Availability mismatch: ${formatAvailability(candidate.availability)} (looking for ${searchCriteria.availability.map(a => formatAvailability(a)).join(', ')})`
                  }
                </div>
              )}
            </div>
          </div>

          {/* Screening Status */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Screening Status</h3>
              <span className={`badge text-xs ${screeningStatus.className}`}>{screeningStatus.label}</span>
            </div>
            {candidate.lastScreenedAt && (
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Screening Date</label>
                  <p className="font-medium text-sm">{formatDate(candidate.lastScreenedAt)}</p>
                </div>
                {candidate.lastScreenedBy && (
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Screened By</label>
                    <p className="font-medium text-sm">{candidate.lastScreenedBy}</p>
                  </div>
                )}
              </div>
            )}
            {isScreeningExpired(candidate.lastScreenedAt) && isShortlistMode && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Screening is required before this candidate can be shortlisted.
                  {candidate.lastScreenedAt
                    ? ' The previous screening has expired (>15 days).'
                    : ' This candidate has not been screened yet.'}
                </p>
              </div>
            )}
          </div>

          {/* Pricing Calculator */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <PricingPanel
              candidateId={candidate.candidateId}
              candidateExpectedCtcLpa={candidate.expectedCtc}
              candidateCurrentCtcLpa={candidate.currentCtc}
              candidateExperienceYears={candidate.totalExperience}
              expectedCtcType={candidate.expectedCtcType}
              isInternalRecruiter={isInternalRecruiter}
              onCtcUpdated={onCtcUpdated}
              onPricingCalculated={setPricingResult}
              requirementContext={requirementContext ? {
                contractDurationMonths: requirementContext.contractDurationMonths,
                paymentTermsDays: requirementContext.paymentTermsDays,
                engagementModel: requirementContext.engagementModel,
                isRateGstInclusive: requirementContext.isRateGstInclusive,
              } : undefined}
            />
          </div>

          {/* Shortlist Notes — only in shortlist mode */}
          {isShortlistMode && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">
                Shortlist Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Strong React skills, good culture fit..."
                className="input w-full text-sm"
                rows={2}
                maxLength={1000}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          {/* Shortlist action — only in shortlist mode */}
          {isShortlistMode && (
            <>
              {candidate.isShortlisted ? (
                <div className="flex items-center justify-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    Shortlisted for {requirementContext.clientName}
                  </span>
                </div>
              ) : candidate.notInterested && !confirmNotInterested ? (
                <button
                  onClick={() => setConfirmNotInterested(true)}
                  className="w-full btn btn-outline border-amber-500 text-amber-700 hover:bg-amber-50 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-900/20 flex items-center justify-center gap-2"
                >
                  Candidate is Not Interested — Shortlist Anyway?
                </button>
              ) : (
                <button
                  onClick={handleShortlist}
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Shortlisting...
                    </>
                  ) : (
                    'Shortlist Candidate'
                  )}
                </button>
              )}
              <div className="text-center">
                <button
                  onClick={() => onRescreen(candidate)}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Re-screen Candidate
                </button>
              </div>
            </>
          )}

          {/* Save requirement prompt — view-only mode */}
          {!isShortlistMode && onSaveRequirement && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                Save this search as a requirement to shortlist candidates.
              </p>
              <button
                onClick={onSaveRequirement}
                className="btn-secondary text-sm"
              >
                Save Requirement
              </button>
            </div>
          )}

          {/* View Resume — both modes */}
          {onViewResume && (
            <button
              onClick={() => onViewResume(candidate.candidateId)}
              disabled={formattingCandidateId === candidate.candidateId}
              className={`w-full ${isShortlistMode ? 'btn-secondary' : 'btn-primary'}`}
            >
              {formattingCandidateId === candidate.candidateId ? 'Formatting resume...' : 'View Resume'}
            </button>
          )}
          {onViewOriginalResume && (
            <div className="text-center">
              <button
                onClick={() => onViewOriginalResume(candidate.candidateId)}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                View Original Resume
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
