'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { X, AlertCircle, Loader2, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import type { CandidateSearchResult, ScreeningUpdatedValues, AdditionalFieldDefinition, ScreeningLockConflict } from '@/lib/api';
import { FormField, FormInput, FormSelect, FormTextarea } from '@/components/ui/form-field';
import {
  SENIORITY_OPTIONS,
  AVAILABILITY_OPTIONS,
  CANDIDATE_ENGAGEMENT_OPTIONS,
  EXPECTED_CTC_MODE_OPTIONS,
  calculateNegotiableCtc,
  formatDate,
  generateHeadline,
} from '@/lib/utils';
import ScreeningHistoryPanel from '@/components/screening-history-panel';

interface ScreeningModalProps {
  candidate?: CandidateSearchResult;
  candidateId?: string;
  candidateName?: string;
  onClose: () => void;
  onScreeningComplete: (candidateId: string, updatedValues?: Partial<CandidateSearchResult>) => void;
  isShortlistFlow?: boolean;
  additionalFields?: AdditionalFieldDefinition[];
}

export function ScreeningModal({ candidate, candidateId: candidateIdProp, candidateName: candidateNameProp, onClose, onScreeningComplete, isShortlistFlow, additionalFields }: ScreeningModalProps) {
  const resolvedCandidateId = candidate?.candidateId || candidateIdProp || '';
  const resolvedCandidateName = candidate?.fullName || candidateNameProp || 'Candidate';
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Core fields
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [currentCtc, setCurrentCtc] = useState('');
  const [expectedCtc, setExpectedCtc] = useState('');
  const [expectedCtcMode, setExpectedCtcMode] = useState<'explicit' | 'negotiable'>('explicit');
  const [availability, setAvailability] = useState('');
  const [engagementModel, setEngagementModel] = useState('');
  const [totalExperience, setTotalExperience] = useState('');
  const [seniority, setSeniority] = useState('');
  const [headline, setHeadline] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [notInterested, setNotInterested] = useState(false);

  // Advanced fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [primarySkillsText, setPrimarySkillsText] = useState('');
  const [secondarySkillsText, setSecondarySkillsText] = useState('');
  const [industries, setIndustries] = useState('');
  const [roles, setRoles] = useState('');
  const [certifications, setCertifications] = useState('');
  const [summary, setSummary] = useState('');

  // Screening notes
  const [notes, setNotes] = useState('');

  // Custom/additional fields from requirement definitions
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  // Track which fields are empty/missing for highlighting
  const [emptyFields, setEmptyFields] = useState<Set<string>>(new Set());

  // Validation: track whether user attempted submit
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Screening lock state
  const [lockAcquired, setLockAcquired] = useState(false);
  const [lockConflict, setLockConflict] = useState<ScreeningLockConflict | null>(null);
  const [lockExpired, setLockExpired] = useState(false);
  const lockAcquiredRef = useRef(false);
  const lockTokenRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Acquire lock and fetch profile on mount
  useEffect(() => {
    async function acquireLockAndFetchProfile() {
      // Step 1: Acquire the screening lock
      try {
        const lockResult = await api.acquireScreeningLock(resolvedCandidateId);
        setLockAcquired(true);
        lockAcquiredRef.current = true;
        lockTokenRef.current = lockResult.lockToken;
      } catch (err: unknown) {
        const apiError = err as { code?: string; details?: ScreeningLockConflict; name?: string };
        if (apiError.name === 'ApiError' && apiError.code === 'SCREENING_LOCKED' && apiError.details) {
          setLockConflict(apiError.details);
          setFetchingProfile(false);
          return; // Don't fetch profile — show conflict UI
        }
        // Non-lock errors: proceed anyway (lock is best-effort UX improvement)
        console.warn('Failed to acquire screening lock:', err);
        setLockAcquired(true);
        lockAcquiredRef.current = true;
      }

      // Step 2: Fetch the candidate profile
      try {
        const profile = await api.getProfile(resolvedCandidateId);
        setFullName(profile.fullName || '');
        setEmail(profile.email || '');
        setPhone(profile.phone || '');
        setLocation(profile.location || '');
        setCurrentCtc(profile.currentCtc != null ? String(profile.currentCtc) : '');
        setExpectedCtc(profile.expectedCtc != null ? String(profile.expectedCtc) : '');
        setExpectedCtcMode((profile.expectedCtcType as 'explicit' | 'negotiable') || 'explicit');
        setAvailability(profile.availability || '');
        setEngagementModel(profile.engagementModel || 'either');
        setTotalExperience(profile.totalExperience != null ? String(profile.totalExperience) : '');
        setSeniority(profile.seniority || '');
        setPrimarySkillsText((profile.primarySkills || []).join(', '));
        setSecondarySkillsText((profile.secondarySkills || []).join(', '));
        setIndustries((profile.industries || []).join(', '));
        setRoles((profile.roles || []).join(', '));
        setCertifications((profile.certifications || []).join(', '));
        setSummary(profile.summary || '');
        setHeadline(profile.headline || generateHeadline(profile.seniority || '', profile.roles, profile.primarySkills));
        setLinkedinUrl(profile.linkedinUrl || '');
        setGithubUrl(profile.githubUrl || '');
        setNotInterested(profile.notInterested || false);

        // Pre-fill custom fields from candidate profile
        if (additionalFields && additionalFields.length > 0) {
          const initial: Record<string, string> = {};
          for (const field of additionalFields) {
            const existing = profile.customFields?.[field.key];
            initial[field.key] = existing != null ? String(existing) : '';
          }
          setCustomFieldValues(initial);
        }

        // Identify empty fields
        const empty = new Set<string>();
        if (!profile.phone) empty.add('phone');
        if (!profile.location) empty.add('location');
        if (profile.currentCtc == null) empty.add('currentCtc');
        if (profile.expectedCtc == null) empty.add('expectedCtc');
        if (!profile.availability) empty.add('availability');
        if (!profile.linkedinUrl) empty.add('linkedinUrl');
        if (!profile.githubUrl) empty.add('githubUrl');
        setEmptyFields(empty);
      } catch {
        // Fall back to search result data if available
        if (candidate) {
          setFullName(resolvedCandidateName || '');
          setLocation(candidate.location || '');
          setCurrentCtc(candidate.currentCtc != null ? String(candidate.currentCtc) : '');
          setExpectedCtc(candidate.expectedCtc != null ? String(candidate.expectedCtc) : '');
          setAvailability(candidate.availability || '');
          setEngagementModel(candidate.engagementModel || 'either');
          setTotalExperience(String(candidate.totalExperience || ''));
          setSeniority(candidate.seniority || '');
          setPrimarySkillsText((candidate.primarySkills || []).join(', '));
        } else {
          setFullName(resolvedCandidateName || '');
        }
      } finally {
        setFetchingProfile(false);
      }
    }
    acquireLockAndFetchProfile();

    // Cleanup: release lock on unmount
    return () => {
      if (lockAcquiredRef.current && resolvedCandidateId) {
        api.releaseScreeningLock(resolvedCandidateId, lockTokenRef.current || undefined).catch(() => {});
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [resolvedCandidateId]);

  // Heartbeat: keep lock alive every 4 minutes
  useEffect(() => {
    if (!lockAcquired || !resolvedCandidateId) return;

    heartbeatRef.current = setInterval(async () => {
      try {
        await api.heartbeatScreeningLock(resolvedCandidateId);
      } catch {
        // Lock expired — disable save and warn user
        setLockExpired(true);
        lockAcquiredRef.current = false;
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      }
    }, 4 * 60 * 1000); // 4 minutes

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [lockAcquired, resolvedCandidateId]);

  // Wrapper for onClose that releases the lock first
  const handleClose = useCallback(() => {
    if (lockAcquiredRef.current && resolvedCandidateId) {
      lockAcquiredRef.current = false;
      api.releaseScreeningLock(resolvedCandidateId, lockTokenRef.current || undefined).catch(() => {});
    }
    onClose();
  }, [onClose, resolvedCandidateId]);

  // Release lock on page unload (browser close, navigation, refresh)
  useEffect(() => {
    if (!lockAcquired || !resolvedCandidateId) return;

    const handleBeforeUnload = () => {
      if (lockAcquiredRef.current && lockTokenRef.current) {
        const url = `${api.getApiUrl()}/recruiter/screening-lock/release-beacon`;
        const body = JSON.stringify({ candidateId: resolvedCandidateId, lockToken: lockTokenRef.current });
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [lockAcquired, resolvedCandidateId]);

  const handleSubmit = useCallback(async () => {
    setSubmitAttempted(true);

    // Validate required fields (CTC, availability, engagement optional when not interested)
    const missingFields: string[] = [];
    if (!notInterested) {
      if (currentCtc === '') missingFields.push('Current CTC');
      if (expectedCtcMode === 'explicit' && expectedCtc === '') missingFields.push('Expected CTC');
      if (expectedCtcMode === 'negotiable') {
        if (currentCtc === '') missingFields.push('Current CTC (needed for negotiable calculation)');
        if (totalExperience === '') missingFields.push('Total Experience (needed for negotiable calculation)');
      }
      if (!availability) missingFields.push('Notice Period');
      if (!engagementModel) missingFields.push('Engagement Preference');
    }
    if (!notes.trim()) missingFields.push('Screening Notes');

    // Validate required additional fields
    if (additionalFields && additionalFields.length > 0) {
      for (const field of additionalFields) {
        const val = customFieldValues[field.key];
        if (field.required && (!val || val.trim() === '')) {
          missingFields.push(field.label);
        }
      }
    }

    if (missingFields.length > 0) {
      setErrorMessage(`Please fill in: ${missingFields.join(', ')}`);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const updatedValues: ScreeningUpdatedValues = {};

      // Always include not-interested flag
      updatedValues.notInterested = notInterested;

      // Only include fields that have values
      if (fullName) updatedValues.fullName = fullName;
      if (email) updatedValues.email = email;
      if (phone) updatedValues.phone = phone;
      updatedValues.location = location || null;
      if (currentCtc !== '') updatedValues.currentCtc = parseFloat(currentCtc);
      else updatedValues.currentCtc = null;
      updatedValues.expectedCtcType = expectedCtcMode;
      if (expectedCtcMode === 'negotiable') {
        updatedValues.expectedCtc = calculateNegotiableCtc(parseFloat(currentCtc), parseFloat(totalExperience));
      } else if (expectedCtc !== '') {
        updatedValues.expectedCtc = parseFloat(expectedCtc);
      } else {
        updatedValues.expectedCtc = null;
      }
      if (availability) updatedValues.availability = availability;
      if (engagementModel) updatedValues.engagementModel = engagementModel;
      if (totalExperience !== '') updatedValues.totalExperience = parseFloat(totalExperience);
      if (seniority) updatedValues.seniority = seniority;
      if (headline) updatedValues.headline = headline;
      if (linkedinUrl) updatedValues.linkedinUrl = linkedinUrl;
      if (githubUrl) updatedValues.githubUrl = githubUrl;

      // Parse comma-separated fields
      if (primarySkillsText) {
        updatedValues.primarySkills = primarySkillsText.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (secondarySkillsText) {
        updatedValues.secondarySkills = secondarySkillsText.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (industries) {
        updatedValues.industries = industries.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (roles) {
        updatedValues.roles = roles.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (certifications) {
        updatedValues.certifications = certifications.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (summary) updatedValues.summary = summary;

      // Include custom fields from requirement additional fields
      if (additionalFields && additionalFields.length > 0) {
        const customFields: Record<string, string | number> = {};
        for (const field of additionalFields) {
          const val = customFieldValues[field.key];
          if (val && val.trim() !== '') {
            customFields[field.key] = field.type === 'number' ? Number(val) : val;
          }
        }
        if (Object.keys(customFields).length > 0) {
          updatedValues.customFields = customFields;
        }
      }

      await api.screenCandidate(resolvedCandidateId, updatedValues, notes || undefined);

      // Release the screening lock (fire-and-forget)
      if (lockAcquiredRef.current) {
        lockAcquiredRef.current = false;
        api.releaseScreeningLock(resolvedCandidateId, lockTokenRef.current || undefined).catch(() => {});
      }

      // Build updated candidate fields to pass back to the caller
      const refreshedFields: Partial<CandidateSearchResult> = {
        currentCtc: currentCtc !== '' ? parseFloat(currentCtc) : undefined,
        expectedCtc: expectedCtcMode === 'negotiable'
          ? calculateNegotiableCtc(parseFloat(currentCtc), parseFloat(totalExperience))
          : expectedCtc !== '' ? parseFloat(expectedCtc) : undefined,
        expectedCtcType: expectedCtcMode,
        availability: availability || undefined,
        engagementModel: (engagementModel as CandidateSearchResult['engagementModel']) || undefined,
        totalExperience: totalExperience !== '' ? parseFloat(totalExperience) : undefined,
        seniority: (seniority as CandidateSearchResult['seniority']) || undefined,
      };
      if (fullName) refreshedFields.fullName = fullName;
      if (location) refreshedFields.location = location;
      refreshedFields.notInterested = notInterested;
      refreshedFields.notInterestedAt = notInterested ? new Date().toISOString() : undefined;

      if (isShortlistFlow) {
        // Show success message briefly, then close
        setSuccessMessage('Screening saved. You can now shortlist this candidate.');
        setTimeout(() => {
          onScreeningComplete(resolvedCandidateId, refreshedFields);
        }, 1500);
      } else {
        onScreeningComplete(resolvedCandidateId, refreshedFields);
      }
    } catch (err) {
      let msg = (err as Error).message || 'Failed to save screening';
      // Include backend details if available (e.g., DynamoDB error specifics)
      const details = (err as any)?.details;
      if (details?.message && details.message !== msg) {
        msg += `: ${details.message}`;
      }
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, [
    resolvedCandidateId, fullName, email, phone, location,
    currentCtc, expectedCtc, expectedCtcMode, availability, engagementModel,
    totalExperience, seniority, primarySkillsText, secondarySkillsText,
    industries, roles, certifications, summary, notes, notInterested, onScreeningComplete,
    isShortlistFlow, additionalFields, customFieldValues,
  ]);

  return (
    <>
    {showHistory && (
      <ScreeningHistoryPanel
        candidateId={resolvedCandidateId}
        candidateName={resolvedCandidateName}
        mode="modal"
        onClose={() => setShowHistory(false)}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Screen Candidate
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {resolvedCandidateName}
              {candidate?.lastScreenedAt && (
                <span className="ml-2">
                  &middot; Last screened: {formatDate(candidate.lastScreenedAt)}
                  <button
                    type="button"
                    onClick={() => setShowHistory(true)}
                    className="ml-2 text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    View History
                  </button>
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {lockConflict ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Candidate is being screened
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                <strong>{lockConflict.lockedBy}</strong> ({lockConflict.lockedByEmail})
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                Started screening {formatDate(lockConflict.lockedAt)}
              </p>
              <button onClick={handleClose} className="btn-secondary">
                Close
              </button>
            </div>
          ) : successMessage ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{successMessage}</p>
            </div>
          ) : fetchingProfile ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
              <span className="ml-2 text-gray-500">Loading profile...</span>
            </div>
          ) : (
            <>
              {/* Lock expired warning */}
              {lockExpired && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
                  <Lock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Your screening lock has expired. Another recruiter may now be able to screen this candidate. Please save or cancel promptly.
                  </p>
                </div>
              )}

              {/* Error message */}
              {errorMessage && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
                </div>
              )}

              {emptyFields.size > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Some fields are missing information. Fields highlighted in yellow need attention.
                  </p>
                </div>
              )}

              {/* Not Interested Toggle */}
              <div className={`p-3 rounded-lg flex items-center justify-between ${notInterested ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                <div>
                  <label className="font-medium text-sm text-gray-900 dark:text-gray-100">
                    Candidate not interested in joining
                  </label>
                  {notInterested && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                      CTC, notice period, and engagement are optional for not-interested candidates
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setNotInterested(!notInterested)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    notInterested ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    notInterested ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Section: Compensation */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Compensation{notInterested ? ' — optional' : ''}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Current CTC (LPA)"
                    htmlFor="currentCtc"
                    required={!notInterested}
                    touched={submitAttempted}
                    error={!notInterested && currentCtc === '' ? 'Required' : undefined}
                    className={emptyFields.has('currentCtc') && !currentCtc ? 'bg-amber-50 dark:bg-amber-900/10 p-2 rounded' : ''}
                  >
                    <FormInput
                      id="currentCtc"
                      type="number"
                      step="0.1"
                      min="0"
                      max="500"
                      value={currentCtc}
                      onChange={(e) => setCurrentCtc(e.target.value)}
                      placeholder="e.g. 12.5"
                      hasError={submitAttempted && !notInterested && currentCtc === ''}
                    />
                  </FormField>
                  <div>
                    <FormField
                      label="Expected CTC (LPA)"
                      htmlFor="expectedCtcMode"
                      required={!notInterested}
                    >
                      <FormSelect
                        id="expectedCtcMode"
                        value={expectedCtcMode}
                        onChange={(e) => setExpectedCtcMode(e.target.value as 'explicit' | 'negotiable')}
                        options={EXPECTED_CTC_MODE_OPTIONS}
                      />
                    </FormField>
                    {expectedCtcMode === 'explicit' ? (
                      <div className={`mt-2 ${emptyFields.has('expectedCtc') && !expectedCtc ? 'bg-amber-50 dark:bg-amber-900/10 p-2 rounded' : ''}`}>
                        <FormInput
                          id="expectedCtc"
                          type="number"
                          step="0.1"
                          min="0"
                          max="500"
                          value={expectedCtc}
                          onChange={(e) => setExpectedCtc(e.target.value)}
                          placeholder="e.g. 15.0"
                          hasError={submitAttempted && !notInterested && expectedCtc === ''}
                        />
                      </div>
                    ) : (
                      <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm">
                        {currentCtc && totalExperience ? (
                          <p className="text-blue-700 dark:text-blue-300">
                            <span className="font-medium">
                              {calculateNegotiableCtc(parseFloat(currentCtc), parseFloat(totalExperience))} LPA
                            </span>
                            {' '}({currentCtc} LPA + {parseFloat(totalExperience) <= 3 ? '20' : parseFloat(totalExperience) <= 8 ? '25' : '30'}% based on experience)
                          </p>
                        ) : (
                          <p className="text-amber-600 dark:text-amber-400">
                            Enter current CTC and total experience above to auto-calculate.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section: Availability */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Availability{notInterested ? ' — optional' : ''}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Notice Period"
                    htmlFor="availability"
                    required={!notInterested}
                    touched={submitAttempted}
                    error={!notInterested && !availability ? 'Required' : undefined}
                    className={emptyFields.has('availability') && !availability ? 'bg-amber-50 dark:bg-amber-900/10 p-2 rounded' : ''}
                  >
                    <FormSelect
                      id="availability"
                      value={availability}
                      onChange={(e) => setAvailability(e.target.value)}
                      options={AVAILABILITY_OPTIONS}
                      placeholder="Select notice period"
                      hasError={submitAttempted && !notInterested && !availability}
                    />
                  </FormField>
                  <FormField
                    label="Engagement Preference"
                    htmlFor="engagementModel"
                    required={!notInterested}
                    touched={submitAttempted}
                    error={!notInterested && !engagementModel ? 'Required' : undefined}
                  >
                    <FormSelect
                      id="engagementModel"
                      value={engagementModel}
                      onChange={(e) => setEngagementModel(e.target.value)}
                      options={CANDIDATE_ENGAGEMENT_OPTIONS}
                      placeholder="Select preference"
                      hasError={submitAttempted && !notInterested && !engagementModel}
                    />
                  </FormField>
                </div>
              </div>

              {/* Section: Headline */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Headline
                </h3>
                <FormField
                  label="Headline"
                  htmlFor="headline"
                  hint="A short title for the candidate, e.g. &quot;Sr. Python Developer&quot;"
                >
                  <FormInput
                    id="headline"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Sr. Python Developer"
                  />
                </FormField>
              </div>

              {/* Section: Contact & Location */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Contact & Location
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Phone"
                    htmlFor="phone"
                    className={emptyFields.has('phone') && !phone ? 'bg-amber-50 dark:bg-amber-900/10 p-2 rounded' : ''}
                  >
                    <FormInput
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                    />
                  </FormField>
                  <FormField
                    label="Location"
                    htmlFor="location"
                    className={emptyFields.has('location') && !location ? 'bg-amber-50 dark:bg-amber-900/10 p-2 rounded' : ''}
                  >
                    <FormInput
                      id="location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Bangalore, India"
                    />
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <FormField
                    label="LinkedIn URL"
                    htmlFor="linkedinUrl"
                    className={emptyFields.has('linkedinUrl') && !linkedinUrl ? 'bg-amber-50 dark:bg-amber-900/10 p-2 rounded' : ''}
                  >
                    <FormInput
                      id="linkedinUrl"
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/username"
                    />
                  </FormField>
                  <FormField
                    label="GitHub URL"
                    htmlFor="githubUrl"
                    className={emptyFields.has('githubUrl') && !githubUrl ? 'bg-amber-50 dark:bg-amber-900/10 p-2 rounded' : ''}
                  >
                    <FormInput
                      id="githubUrl"
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/username"
                    />
                  </FormField>
                </div>
              </div>

              {/* Section: Experience */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Experience
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Total Experience (years)" htmlFor="totalExperience">
                    <FormInput
                      id="totalExperience"
                      type="number"
                      step="0.5"
                      min="0"
                      max="50"
                      value={totalExperience}
                      onChange={(e) => setTotalExperience(e.target.value)}
                    />
                  </FormField>
                  <FormField label="Seniority" htmlFor="seniority">
                    <FormSelect
                      id="seniority"
                      value={seniority}
                      onChange={(e) => setSeniority(e.target.value)}
                      options={SENIORITY_OPTIONS}
                      placeholder="Select seniority"
                    />
                  </FormField>
                </div>
              </div>

              {/* Section: Skills */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Skills
                </h3>
                <div className="space-y-3">
                  <FormField
                    label="Primary Skills"
                    htmlFor="primarySkills"
                    hint="Comma-separated list"
                  >
                    <FormInput
                      id="primarySkills"
                      value={primarySkillsText}
                      onChange={(e) => setPrimarySkillsText(e.target.value)}
                      placeholder="e.g. React, Node.js, TypeScript"
                    />
                  </FormField>
                  <FormField
                    label="Secondary Skills"
                    htmlFor="secondarySkills"
                    hint="Comma-separated list"
                  >
                    <FormInput
                      id="secondarySkills"
                      value={secondarySkillsText}
                      onChange={(e) => setSecondarySkillsText(e.target.value)}
                      placeholder="e.g. Docker, AWS, PostgreSQL"
                    />
                  </FormField>
                </div>
              </div>

              {/* Advanced section (collapsible) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showAdvanced ? 'Hide' : 'Show'} additional fields
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Full Name" htmlFor="fullName">
                        <FormInput
                          id="fullName"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                        />
                      </FormField>
                      <FormField label="Email" htmlFor="email">
                        <FormInput
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </FormField>
                    </div>
                    <FormField
                      label="Industries"
                      htmlFor="industries"
                      hint="Comma-separated"
                    >
                      <FormInput
                        id="industries"
                        value={industries}
                        onChange={(e) => setIndustries(e.target.value)}
                        placeholder="e.g. Fintech, E-commerce"
                      />
                    </FormField>
                    <FormField
                      label="Roles"
                      htmlFor="roles"
                      hint="Comma-separated"
                    >
                      <FormInput
                        id="roles"
                        value={roles}
                        onChange={(e) => setRoles(e.target.value)}
                        placeholder="e.g. Full Stack Developer, Tech Lead"
                      />
                    </FormField>
                    <FormField
                      label="Certifications"
                      htmlFor="certifications"
                      hint="Comma-separated"
                    >
                      <FormInput
                        id="certifications"
                        value={certifications}
                        onChange={(e) => setCertifications(e.target.value)}
                        placeholder="e.g. AWS Solutions Architect"
                      />
                    </FormField>
                    <FormField label="Summary" htmlFor="summary">
                      <FormTextarea
                        id="summary"
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        placeholder="Brief profile summary..."
                        rows={3}
                      />
                    </FormField>
                  </div>
                )}
              </div>

              {/* Requirement Data Points */}
              {additionalFields && additionalFields.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Requirement Data Points
                  </h3>
                  <div className="space-y-3">
                    {additionalFields.map((field) => {
                      const value = customFieldValues[field.key] ?? '';
                      const isEmpty = field.required && (!value || value.trim() === '');

                      return (
                        <FormField
                          key={field.key}
                          label={field.label}
                          htmlFor={`cf_${field.key}`}
                          required={field.required}
                          touched={submitAttempted}
                          error={isEmpty ? 'Required' : undefined}
                        >
                          <FormInput
                            id={`cf_${field.key}`}
                            type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                            value={value}
                            onChange={(e) =>
                              setCustomFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            placeholder={field.type === 'date' ? undefined : `Enter ${field.label.toLowerCase()}`}
                            hasError={submitAttempted && isEmpty}
                          />
                        </FormField>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Screening Notes */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Screening Notes
                </h3>
                <FormField
                  label="Notes from the screening call"
                  htmlFor="screeningNotes"
                  hint="Observations, concerns, or other relevant notes"
                  required
                  touched={submitAttempted}
                  error={!notes.trim() ? 'Required' : undefined}
                >
                  <FormTextarea
                    id="screeningNotes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Candidate confirmed 30-day notice, willing to negotiate on CTC..."
                    rows={3}
                    hasError={submitAttempted && !notes.trim()}
                  />
                </FormField>
              </div>
            </>
          )}
        </div>

        {/* Footer — hidden when lock conflict is shown */}
        {!lockConflict && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleClose}
              disabled={loading}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || fetchingProfile || lockExpired}
              className="btn-primary flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Saving...' : lockExpired ? 'Lock Expired' : 'Save Screening'}
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// Helper to check if screening is expired (>15 days)
export function isScreeningExpired(lastScreenedAt?: string): boolean {
  if (!lastScreenedAt) return true;
  const daysSince = (Date.now() - new Date(lastScreenedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 15;
}

// Helper to get screening status badge info
export function getScreeningStatus(lastScreenedAt?: string, notInterested?: boolean): {
  label: string;
  className: string;
} {
  if (notInterested) {
    return {
      label: 'Not Interested',
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
  }
  if (!lastScreenedAt) {
    return {
      label: 'Not Screened',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    };
  }
  if (isScreeningExpired(lastScreenedAt)) {
    return {
      label: 'Screening Expired',
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    };
  }
  return {
    label: 'Screened',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };
}
