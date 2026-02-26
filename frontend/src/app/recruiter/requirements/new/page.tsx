'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/Header';
import { api, ParsedCriteria, DuplicateMatch, EngagementModel, Payroll, ConsolidateResponse, ClientDefaultsResponse } from '@/lib/api';
import { ENGAGEMENT_MODEL_OPTIONS, PAYROLL_OPTIONS, formatEngagementModel } from '@/lib/utils';

type Step = 'jd_input' | 'details' | 'duplicate_check' | 'confirmation';

export default function PostRequirementPage() {
  const router = useRouter();
  const { status } = useSession();

  // Redirect to sign-in if not authenticated
  if (status === 'unauthenticated') {
    router.push('/auth/signin?callbackUrl=' + encodeURIComponent('/recruiter/requirements/new'));
    return null;
  }

  const [step, setStep] = useState<Step>('jd_input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: JD input
  const [jobDescription, setJobDescription] = useState('');

  // Step 2: Requirement details
  const [parsedCriteria, setParsedCriteria] = useState<ParsedCriteria | null>(null);
  const [clientName, setClientName] = useState('');
  const [endClient, setEndClient] = useState('');
  const [engagementModel, setEngagementModel] = useState<EngagementModel | ''>('');
  const [payroll, setPayroll] = useState<Payroll | ''>('');
  const [budgetMinLpa, setBudgetMinLpa] = useState<string>('');
  const [budgetMaxLpa, setBudgetMaxLpa] = useState<string>('');
  const [contractDurationMonths, setContractDurationMonths] = useState<string>('');
  const [paymentTermsDays, setPaymentTermsDays] = useState<string>('');
  const [coreSkill, setCoreSkill] = useState('');

  // Client defaults
  const [clientDefaults, setClientDefaults] = useState<ClientDefaultsResponse | null>(null);
  const clientLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3: Duplicate check
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Step 4: Confirmation
  const [savedRequirementId, setSavedRequirementId] = useState<string | null>(null);
  const [consolidated, setConsolidated] = useState(false);
  const [consolidateResult, setConsolidateResult] = useState<ConsolidateResponse | null>(null);

  // Debounced client defaults lookup
  const lookupClientDefaults = useCallback((name: string) => {
    if (clientLookupTimer.current) clearTimeout(clientLookupTimer.current);
    if (!name.trim()) {
      setClientDefaults(null);
      return;
    }
    clientLookupTimer.current = setTimeout(async () => {
      try {
        const result = await api.getClientDefaults(name.trim());
        setClientDefaults(result);
        if (result.found) {
          if (result.defaultEngagementModel && !engagementModel) {
            const em = result.defaultEngagementModel;
            if (['full_time_regular', 'full_time_contract', 'part_time_contract'].includes(em)) {
              setEngagementModel(em as EngagementModel);
            }
          }
          if (result.defaultPayroll && !payroll) {
            const p = result.defaultPayroll;
            if (['quadzero', 'client'].includes(p)) {
              setPayroll(p as Payroll);
            }
          }
        }
      } catch {
        setClientDefaults(null);
      }
    }, 500);
  }, [engagementModel, payroll]);

  const generateJobTitle = (client: string, end: string, skill: string): string => {
    const parts: string[] = [];
    if (client.trim()) {
      let part = client.trim();
      if (end.trim()) part += ` (${end.trim()})`;
      parts.push(part);
    }
    if (skill.trim()) parts.push(skill.trim());
    return parts.join(' - ') || '';
  };

  const handleParseJD = async () => {
    if (!jobDescription.trim()) {
      setError('Please enter a job description');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await api.parseJobDescription(jobDescription);
      setParsedCriteria(response.parsedCriteria);

      // Pre-fill fields from LLM extraction
      if (response.parsedCriteria.clientName) {
        setClientName(response.parsedCriteria.clientName);
      }
      if (response.parsedCriteria.endClient) {
        setEndClient(response.parsedCriteria.endClient);
      }
      if (response.parsedCriteria.engagementModel) {
        const em = response.parsedCriteria.engagementModel;
        if (['full_time_regular', 'full_time_contract', 'part_time_contract'].includes(em)) {
          setEngagementModel(em as EngagementModel);
        }
      }
      if (response.parsedCriteria.payroll) {
        const p = response.parsedCriteria.payroll;
        if (['quadzero', 'client'].includes(p)) {
          setPayroll(p as Payroll);
        }
      }
      if (response.parsedCriteria.budgetMinLpa != null) {
        setBudgetMinLpa(response.parsedCriteria.budgetMinLpa.toString());
      }
      if (response.parsedCriteria.budgetMaxLpa != null) {
        setBudgetMaxLpa(response.parsedCriteria.budgetMaxLpa.toString());
      }
      if (response.parsedCriteria.coreSkill) {
        setCoreSkill(response.parsedCriteria.coreSkill);
      }
      if (response.parsedCriteria.contractDurationMonths != null) {
        setContractDurationMonths(response.parsedCriteria.contractDurationMonths.toString());
      }
      if (response.parsedCriteria.paymentTermsDays != null) {
        setPaymentTermsDays(response.parsedCriteria.paymentTermsDays.toString());
      }

      // Trigger client defaults lookup if client name was extracted
      if (response.parsedCriteria.clientName) {
        lookupClientDefaults(response.parsedCriteria.clientName);
      }

      setStep('details');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse job description');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckDuplicates = async () => {
    if (!clientName.trim()) {
      setError('Client name is required');
      return;
    }
    if (!engagementModel) {
      setError('Engagement model is required');
      return;
    }
    if (!payroll) {
      setError('Payroll is required');
      return;
    }
    if (!parsedCriteria) return;

    try {
      setCheckingDuplicates(true);
      setError(null);

      const generatedTitle = generateJobTitle(clientName, endClient, coreSkill);
      const response = await api.checkDuplicate(clientName, parsedCriteria, generatedTitle || undefined);

      if (response.duplicates.length > 0) {
        setDuplicates(response.duplicates);
        setStep('duplicate_check');
      } else {
        // No duplicates, save directly
        await saveRequirement();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check for duplicates');
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const saveRequirement = async (duplicateOf?: string) => {
    if (!parsedCriteria) return;

    try {
      setLoading(true);
      setError(null);

      // Resolve payment terms: from client defaults or recruiter input
      const resolvedPaymentTerms = clientDefaults?.found && clientDefaults.defaultPaymentTermsDays
        ? clientDefaults.defaultPaymentTermsDays
        : paymentTermsDays ? parseInt(paymentTermsDays) : undefined;

      const generatedTitle = generateJobTitle(clientName, endClient, coreSkill);
      const response = await api.saveRequirement({
        clientName: clientName.trim(),
        endClient: endClient.trim() || undefined,
        engagementModel: engagementModel as EngagementModel,
        payroll: payroll as Payroll,
        budgetMinLpa: budgetMinLpa ? parseFloat(budgetMinLpa) : undefined,
        budgetMaxLpa: budgetMaxLpa ? parseFloat(budgetMaxLpa) : undefined,
        contractDurationMonths: contractDurationMonths ? parseInt(contractDurationMonths) : undefined,
        paymentTermsDays: resolvedPaymentTerms,
        jobTitle: generatedTitle || undefined,
        jdText: jobDescription,
        parsedCriteria,
        status: duplicateOf ? 'duplicate' : 'active',
        duplicateOf,
      });

      // Persist payment terms to client if recruiter entered them
      if (paymentTermsDays && clientName.trim()) {
        try {
          if (clientDefaults?.found && clientDefaults.clientId) {
            await api.updateClient(clientDefaults.clientId, {
              defaultPaymentTermsDays: parseInt(paymentTermsDays),
            });
          } else if (!clientDefaults?.found) {
            await api.saveClient({
              clientName: clientName.trim(),
              defaultPaymentTermsDays: parseInt(paymentTermsDays),
              defaultEngagementModel: engagementModel || undefined,
              defaultPayroll: payroll || undefined,
            });
          }
        } catch {
          // Non-fatal: requirement was saved, client update failed silently
        }
      }

      setSavedRequirementId(response.requirementId);
      setStep('confirmation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save requirement');
    } finally {
      setLoading(false);
    }
  };

  const handleConsolidate = async (match: DuplicateMatch) => {
    if (!parsedCriteria) return;
    try {
      setLoading(true);
      setError(null);
      const result = await api.consolidateRequirement(match.requirementId, {
        jdText: jobDescription,
        parsedCriteria,
        similarityScore: match.similarityScore,
      });
      setSavedRequirementId(result.requirementId);
      setConsolidated(true);
      setConsolidateResult(result);
      setStep('confirmation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to consolidate requirement');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsNew = async () => {
    setConsolidated(false);
    setConsolidateResult(null);
    await saveRequirement();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header>
        <nav className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/recruiter/requirements')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Requirements
          </button>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <span className="text-sm text-primary-600 dark:text-primary-400 font-medium">
            Post New
          </span>
        </nav>
      </Header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Progress Steps */}
        <div className="mb-8 flex items-center justify-center space-x-4">
          {(['jd_input', 'details', 'duplicate_check', 'confirmation'] as Step[]).map((s, i) => {
            const labels = ['JD Input', 'Details', 'Review', 'Done'];
            const isActive = s === step;
            const stepIndex = ['jd_input', 'details', 'duplicate_check', 'confirmation'].indexOf(step);
            const isPast = i < stepIndex;
            return (
              <div key={s} className="flex items-center">
                {i > 0 && <div className={`w-8 h-0.5 mr-4 ${isPast ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`} />}
                <div className={`flex items-center space-x-2 ${isActive ? 'text-primary-600 dark:text-primary-400' : isPast ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${isActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : isPast ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600'}`}>
                    {isPast ? '✓' : i + 1}
                  </div>
                  <span className="text-sm font-medium hidden sm:inline">{labels[i]}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Step 1: JD Input */}
        {step === 'jd_input' && (
          <div className="card p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Post New Requirement</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Paste the job description and we&apos;ll extract the key details automatically.
            </p>

            <div className="space-y-4">
              <div>
                <label className="label">Job Description</label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={12}
                  placeholder="Paste the full job description here..."
                  className="input mt-1"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleParseJD}
                  disabled={loading || !jobDescription.trim()}
                  className="btn-primary px-8"
                >
                  {loading ? 'Analyzing...' : 'Parse & Continue'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Requirement Details */}
        {step === 'details' && parsedCriteria && (
          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Requirement Details</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Client Name */}
                <div>
                  <label className="label">
                    Client Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => {
                      setClientName(e.target.value);
                      lookupClientDefaults(e.target.value);
                    }}
                    placeholder="Who shared this requirement?"
                    className="input mt-1"
                    required
                  />
                </div>

                {/* End Client */}
                <div>
                  <label className="label">End Client</label>
                  <input
                    type="text"
                    value={endClient}
                    onChange={(e) => setEndClient(e.target.value)}
                    placeholder="Who will leverage the resource? (optional)"
                    className="input mt-1"
                  />
                </div>

                {/* Engagement Model */}
                <div>
                  <label className="label">
                    Engagement Model <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={engagementModel}
                    onChange={(e) => setEngagementModel(e.target.value as EngagementModel)}
                    className="input mt-1"
                    required
                  >
                    <option value="">Select engagement model</option>
                    {ENGAGEMENT_MODEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Payroll */}
                <div>
                  <label className="label">
                    Payroll <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={payroll}
                    onChange={(e) => setPayroll(e.target.value as Payroll)}
                    className="input mt-1"
                    required
                  >
                    <option value="">Select payroll</option>
                    {PAYROLL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Budget Range */}
                <div>
                  <label className="label">Budget Range (LPA)</label>
                  <div className="mt-1 flex items-center space-x-2">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={budgetMinLpa}
                      onChange={(e) => setBudgetMinLpa(e.target.value)}
                      placeholder="Min"
                      className="input w-28"
                    />
                    <span className="text-gray-500 dark:text-gray-400">to</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={budgetMaxLpa}
                      onChange={(e) => setBudgetMaxLpa(e.target.value)}
                      placeholder="Max"
                      className="input w-28"
                    />
                  </div>
                </div>

                {/* Contract Duration */}
                <div>
                  <label className="label">Contract Duration (months)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={contractDurationMonths}
                    onChange={(e) => setContractDurationMonths(e.target.value)}
                    placeholder="e.g., 6, 12"
                    className="input mt-1"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Longer contracts may qualify for platform fee discounts.
                  </p>
                </div>

                {/* Core Skill */}
                <div>
                  <label className="label">Core Skill</label>
                  <input
                    type="text"
                    value={coreSkill}
                    onChange={(e) => setCoreSkill(e.target.value)}
                    placeholder="e.g., React, Java, Data Engineering"
                    className="input mt-1"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Auto-detected from JD. Used to generate the requirement title.
                  </p>
                </div>
              </div>

              {/* Payment Terms — from Client MSA */}
              {clientName.trim() && clientDefaults?.found && clientDefaults.defaultPaymentTermsDays ? (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Payment terms: <strong>Net {clientDefaults.defaultPaymentTermsDays} days</strong> (from <strong>{clientDefaults.clientName}</strong> MSA)
                  </p>
                </div>
              ) : clientName.trim() ? (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <label className="block text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                    No payment terms on file for <strong>{clientName.trim()}</strong>. Please select:
                  </label>
                  <select
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(e.target.value)}
                    className="input w-48"
                  >
                    <option value="">Select payment terms</option>
                    <option value="30">Net 30 days</option>
                    <option value="45">Net 45 days</option>
                    <option value="60">Net 60 days</option>
                    <option value="90">Net 90 days</option>
                  </select>
                </div>
              ) : null}
            </div>

            {/* Parsed Criteria Summary */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Extracted Search Criteria</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Must-Have Skills</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {parsedCriteria.mustHaveSkills.map((skill) => (
                      <span key={skill} className="badge-primary text-xs">{skill}</span>
                    ))}
                    {parsedCriteria.mustHaveSkills.length === 0 && (
                      <span className="text-sm text-gray-400">None extracted</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Good-to-Have Skills</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {parsedCriteria.goodToHaveSkills.map((skill) => (
                      <span key={skill} className="badge-secondary text-xs">{skill}</span>
                    ))}
                    {parsedCriteria.goodToHaveSkills.length === 0 && (
                      <span className="text-sm text-gray-400">None extracted</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Experience</label>
                  <p className="text-sm mt-1">
                    {parsedCriteria.minExperience != null || parsedCriteria.maxExperience != null
                      ? `${parsedCriteria.minExperience ?? '0'} - ${parsedCriteria.maxExperience ?? '∞'} years`
                      : 'Not specified'}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Seniority</label>
                  <p className="text-sm mt-1">
                    {parsedCriteria.seniority.length > 0
                      ? parsedCriteria.seniority.join(', ')
                      : 'Not specified'}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Location</label>
                  <p className="text-sm mt-1">{parsedCriteria.location || 'Not specified'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Remote</label>
                  <p className="text-sm mt-1">{parsedCriteria.remote ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep('jd_input')} className="btn-secondary">
                Back
              </button>
              <button
                onClick={handleCheckDuplicates}
                disabled={checkingDuplicates || !clientName.trim() || !engagementModel || !payroll}
                className="btn-primary px-8"
              >
                {checkingDuplicates ? 'Checking...' : 'Save Requirement'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Duplicate Check */}
        {step === 'duplicate_check' && (
          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Similar Requirements Found</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                We found similar requirements from <strong>{clientName}</strong>. You can add this to an existing requirement to track demand, or save it as a new one.
              </p>

              <div className="space-y-4">
                {duplicates.map((dup) => (
                  <div key={dup.requirementId} className="border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            {dup.jobTitle || 'Untitled Requirement'}
                          </h3>
                          <span className="badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                            {dup.similarityScore}% match
                          </span>
                          {dup.requestCount && dup.requestCount > 1 && (
                            <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">
                              Received {dup.requestCount}x
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{dup.reason}</p>
                        <div className="flex flex-wrap gap-1">
                          {dup.mustHaveSkills.slice(0, 5).map((skill) => (
                            <span key={skill} className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                              {skill}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          Created: {new Date(dup.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleConsolidate(dup)}
                        disabled={loading}
                        className="btn-secondary text-sm whitespace-nowrap self-start"
                      >
                        Add to Existing
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep('details')} className="btn-secondary">
                Back
              </button>
              <button
                onClick={handleSaveAsNew}
                disabled={loading}
                className="btn-primary px-8"
              >
                {loading ? 'Saving...' : 'Save as New Requirement'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 'confirmation' && savedRequirementId && (
          <div className="card p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {consolidated ? 'Requirement Consolidated' : 'Requirement Saved'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {consolidated && consolidateResult ? (
                <>
                  This requirement has been consolidated into the existing record for <strong>{clientName}</strong>.
                  It has now been received <strong>{consolidateResult.requestCount} {consolidateResult.requestCount === 1 ? 'time' : 'times'}</strong>.
                </>
              ) : (
                <>
                  Your requirement for <strong>{clientName}</strong> has been saved successfully.
                  {engagementModel && (
                    <span> ({formatEngagementModel(engagementModel)})</span>
                  )}
                </>
              )}
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <button
                onClick={() => router.push('/recruiter/requirements')}
                className="btn-secondary"
              >
                View All Requirements
              </button>
              <button
                onClick={() => {
                  // Navigate to search with pre-filled criteria
                  if (parsedCriteria) {
                    sessionStorage.setItem('scout_recruiter_search', JSON.stringify({
                      jobDescription,
                      coreSkill,
                      searchCriteria: {
                        mustHaveSkills: parsedCriteria.mustHaveSkills,
                        goodToHaveSkills: parsedCriteria.goodToHaveSkills,
                        minExperience: parsedCriteria.minExperience || undefined,
                        maxExperience: parsedCriteria.maxExperience || undefined,
                        seniority: parsedCriteria.seniority,
                        availability: parsedCriteria.availability,
                        location: parsedCriteria.location || undefined,
                        maxBudgetLpa: parsedCriteria.rateLpa || undefined,
                      },
                      parsedCriteria,
                      suggestions: [],
                      viewMode: 'criteria',
                    }));
                  }
                  router.push('/recruiter/search');
                }}
                className="btn-primary"
              >
                Search Candidates
              </button>
              <button
                onClick={() => {
                  // Reset form
                  setStep('jd_input');
                  setJobDescription('');
                  setCoreSkill('');
                  setParsedCriteria(null);
                  setClientName('');
                  setEndClient('');
                  setEngagementModel('');
                  setPayroll('');
                  setBudgetMinLpa('');
                  setBudgetMaxLpa('');
                  setContractDurationMonths('');
                  setPaymentTermsDays('');
                  setClientDefaults(null);
                  setDuplicates([]);
                  setSavedRequirementId(null);
                  setConsolidated(false);
                  setConsolidateResult(null);
                  setError(null);
                }}
                className="btn-secondary"
              >
                Post Another
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
