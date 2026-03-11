'use client';

import { useState, useCallback, useEffect } from 'react';
import { X, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import type { CandidateSearchResult, ScreeningUpdatedValues, AdditionalFieldDefinition } from '@/lib/api';
import { FormField, FormInput, FormSelect, FormTextarea } from '@/components/ui/form-field';
import {
  SENIORITY_OPTIONS,
  AVAILABILITY_OPTIONS,
  CANDIDATE_ENGAGEMENT_OPTIONS,
  formatDate,
} from '@/lib/utils';

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

  // Core fields
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [currentCtc, setCurrentCtc] = useState('');
  const [expectedCtc, setExpectedCtc] = useState('');
  const [availability, setAvailability] = useState('');
  const [engagementModel, setEngagementModel] = useState('');
  const [totalExperience, setTotalExperience] = useState('');
  const [seniority, setSeniority] = useState('');

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

  // Fetch full profile data on mount
  useEffect(() => {
    async function fetchProfile() {
      try {
        const profile = await api.getProfile(resolvedCandidateId);
        setFullName(profile.fullName || '');
        setEmail(profile.email || '');
        setPhone(profile.phone || '');
        setLocation(profile.location || '');
        setCurrentCtc(profile.currentCtc != null ? String(profile.currentCtc) : '');
        setExpectedCtc(profile.expectedCtc != null ? String(profile.expectedCtc) : '');
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
    fetchProfile();
  }, [resolvedCandidateId]);

  const handleSubmit = useCallback(async () => {
    setSubmitAttempted(true);

    // Validate required fields
    const missingFields: string[] = [];
    if (currentCtc === '') missingFields.push('Current CTC');
    if (expectedCtc === '') missingFields.push('Expected CTC');
    if (!availability) missingFields.push('Notice Period');
    if (!engagementModel) missingFields.push('Engagement Preference');
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

      // Only include fields that have values
      if (fullName) updatedValues.fullName = fullName;
      if (email) updatedValues.email = email;
      if (phone) updatedValues.phone = phone;
      updatedValues.location = location || null;
      if (currentCtc !== '') updatedValues.currentCtc = parseFloat(currentCtc);
      else updatedValues.currentCtc = null;
      if (expectedCtc !== '') updatedValues.expectedCtc = parseFloat(expectedCtc);
      else updatedValues.expectedCtc = null;
      if (availability) updatedValues.availability = availability;
      if (engagementModel) updatedValues.engagementModel = engagementModel;
      if (totalExperience !== '') updatedValues.totalExperience = parseFloat(totalExperience);
      if (seniority) updatedValues.seniority = seniority;

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

      // Build updated candidate fields to pass back to the caller
      const refreshedFields: Partial<CandidateSearchResult> = {
        currentCtc: currentCtc !== '' ? parseFloat(currentCtc) : undefined,
        expectedCtc: expectedCtc !== '' ? parseFloat(expectedCtc) : undefined,
        availability: availability || undefined,
        engagementModel: (engagementModel as CandidateSearchResult['engagementModel']) || undefined,
        totalExperience: totalExperience !== '' ? parseFloat(totalExperience) : undefined,
        seniority: (seniority as CandidateSearchResult['seniority']) || undefined,
      };
      if (fullName) refreshedFields.fullName = fullName;
      if (location) refreshedFields.location = location;

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
    currentCtc, expectedCtc, availability, engagementModel,
    totalExperience, seniority, primarySkillsText, secondarySkillsText,
    industries, roles, certifications, summary, notes, onScreeningComplete,
    isShortlistFlow, additionalFields, customFieldValues,
  ]);

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
              Screen Candidate
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {resolvedCandidateName}
              {candidate?.lastScreenedAt && (
                <span className="ml-2">
                  &middot; Last screened: {formatDate(candidate.lastScreenedAt)}
                </span>
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
          {successMessage ? (
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

              {/* Section: Compensation */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Compensation
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Current CTC (LPA)"
                    htmlFor="currentCtc"
                    required
                    touched={submitAttempted}
                    error={currentCtc === '' ? 'Required' : undefined}
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
                      hasError={submitAttempted && currentCtc === ''}
                    />
                  </FormField>
                  <FormField
                    label="Expected CTC (LPA)"
                    htmlFor="expectedCtc"
                    required
                    touched={submitAttempted}
                    error={expectedCtc === '' ? 'Required' : undefined}
                    className={emptyFields.has('expectedCtc') && !expectedCtc ? 'bg-amber-50 dark:bg-amber-900/10 p-2 rounded' : ''}
                  >
                    <FormInput
                      id="expectedCtc"
                      type="number"
                      step="0.1"
                      min="0"
                      max="500"
                      value={expectedCtc}
                      onChange={(e) => setExpectedCtc(e.target.value)}
                      placeholder="e.g. 15.0"
                      hasError={submitAttempted && expectedCtc === ''}
                    />
                  </FormField>
                </div>
              </div>

              {/* Section: Availability */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Availability
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Notice Period"
                    htmlFor="availability"
                    required
                    touched={submitAttempted}
                    error={!availability ? 'Required' : undefined}
                    className={emptyFields.has('availability') && !availability ? 'bg-amber-50 dark:bg-amber-900/10 p-2 rounded' : ''}
                  >
                    <FormSelect
                      id="availability"
                      value={availability}
                      onChange={(e) => setAvailability(e.target.value)}
                      options={AVAILABILITY_OPTIONS}
                      placeholder="Select notice period"
                      hasError={submitAttempted && !availability}
                    />
                  </FormField>
                  <FormField
                    label="Engagement Preference"
                    htmlFor="engagementModel"
                    required
                    touched={submitAttempted}
                    error={!engagementModel ? 'Required' : undefined}
                  >
                    <FormSelect
                      id="engagementModel"
                      value={engagementModel}
                      onChange={(e) => setEngagementModel(e.target.value)}
                      options={CANDIDATE_ENGAGEMENT_OPTIONS}
                      placeholder="Select preference"
                      hasError={submitAttempted && !engagementModel}
                    />
                  </FormField>
                </div>
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || fetchingProfile}
            className="btn-primary flex items-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Saving...' : 'Save Screening'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to check if screening is expired (>15 days)
export function isScreeningExpired(lastScreenedAt?: string): boolean {
  if (!lastScreenedAt) return true;
  const daysSince = (Date.now() - new Date(lastScreenedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 15;
}

// Helper to get screening status badge info
export function getScreeningStatus(lastScreenedAt?: string): {
  label: string;
  className: string;
} {
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
