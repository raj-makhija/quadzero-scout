'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/Header';
import { PricingPanel } from '@/components/PricingPanel';
import { ComboboxInput } from '@/components/ui/combobox-input';
import { api, ParsedCriteria, SearchCriteria, CandidateSearchResult, EngagementModel, Payroll, DuplicateMatch, ConsolidateResponse, ClientDefaultsResponse } from '@/lib/api';
import { formatSeniority, formatAvailability, formatCandidateEngagement, getMatchScoreColor, getMatchScoreBgColor, SENIORITY_OPTIONS, AVAILABILITY_OPTIONS, ENGAGEMENT_MODEL_OPTIONS, PAYROLL_OPTIONS, formatEngagementModel } from '@/lib/utils';

type ViewMode = 'input' | 'requirement_details' | 'criteria' | 'results';

const STORAGE_KEY = 'scout_recruiter_search';

export default function RecruiterSearchPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const isInternalRecruiter = (session?.user as any)?.isInternal === true;

  // Pre-read sessionStorage synchronously to avoid a flash of the input view
  // when navigating here from a requirement detail page with viewMode 'results'.
  const [prefilled] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return null;
  });

  const [viewMode, setViewMode] = useState<ViewMode>(prefilled?.viewMode === 'results' ? 'results' : (prefilled?.viewMode || 'input'));
  const [jobDescription, setJobDescription] = useState(prefilled?.jobDescription || '');
  const [coreSkill, setCoreSkill] = useState(prefilled?.coreSkill || '');
  const [parsedCriteria, setParsedCriteria] = useState<ParsedCriteria | null>(prefilled?.parsedCriteria || null);
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria>(prefilled?.searchCriteria || {});
  const [suggestions, setSuggestions] = useState<string[]>(prefilled?.suggestions || []);
  const [results, setResults] = useState<CandidateSearchResult[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading] = useState(prefilled?.viewMode === 'results');
  const [error, setError] = useState<string | null>(null);
  const [paginationKey, setPaginationKey] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateSearchResult | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formattingCandidateId, setFormattingCandidateId] = useState<string | null>(null);
  const [sourceRequirementId, setSourceRequirementId] = useState<string | null>(prefilled?.requirementId || null);

  // Requirement details state
  const [clientName, setClientName] = useState('');
  const [endClient, setEndClient] = useState('');
  const [engagementModel, setEngagementModel] = useState<EngagementModel | ''>('');
  const [payroll, setPayroll] = useState<Payroll | ''>('');
  const [budgetMinLpa, setBudgetMinLpa] = useState('');
  const [budgetMaxLpa, setBudgetMaxLpa] = useState('');
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [savingRequirement, setSavingRequirement] = useState(false);
  const [requirementSaved, setRequirementSaved] = useState(false);
  const [consolidated, setConsolidated] = useState(false);
  const [consolidateResult, setConsolidateResult] = useState<ConsolidateResponse | null>(null);
  const [contractDurationMonths, setContractDurationMonths] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('');
  const [clientDefaults, setClientDefaults] = useState<ClientDefaultsResponse | null>(null);
  const clientLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clientNameOptions, setClientNameOptions] = useState<string[]>([]);
  const [endClientOptions, setEndClientOptions] = useState<string[]>([]);

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

  // Search helper — reusable for both button click and state restore
  const runSearch = useCallback(async (criteria: SearchCriteria, lastEvaluatedKey?: string) => {
    try {
      setLoading(true);
      setError(null);
      const pagination = lastEvaluatedKey ? { lastEvaluatedKey } : undefined;
      const response = await api.searchCandidates(criteria, pagination);
      setResults(response.candidates);
      setTotalMatches(response.totalMatches);
      setPaginationKey(response.pagination.lastEvaluatedKey);
      setHasMore(response.pagination.hasMore);
      setViewMode('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Run auto-search and clean up sessionStorage for prefilled state
  useEffect(() => {
    if (!prefilled) return;
    sessionStorage.removeItem(STORAGE_KEY);

    if (prefilled.viewMode === 'results' && prefilled.searchCriteria) {
      runSearch(prefilled.searchCriteria);
    }
  }, [prefilled, runSearch]);

  // Fetch distinct client names for autocomplete
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    api.getClientNames()
      .then((data) => {
        if (!cancelled) {
          setClientNameOptions(data.clientNames);
          setEndClientOptions(data.endClients);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch client names for autocomplete:', err);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Persist state and redirect to sign-in
  const handleLoginRequired = () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      jobDescription,
      coreSkill,
      searchCriteria,
      parsedCriteria,
      suggestions,
      viewMode,
      requirementId: sourceRequirementId,
    }));
    router.push('/auth/signin?callbackUrl=' + encodeURIComponent('/recruiter/search'));
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
      setSuggestions(response.suggestions);

      // Convert to search criteria
      setSearchCriteria({
        mustHaveSkills: response.parsedCriteria.mustHaveSkills,
        goodToHaveSkills: response.parsedCriteria.goodToHaveSkills,
        minExperience: response.parsedCriteria.minExperience || undefined,
        maxExperience: response.parsedCriteria.maxExperience || undefined,
        seniority: response.parsedCriteria.seniority,
        availability: response.parsedCriteria.availability,
        location: response.parsedCriteria.location || undefined,
        maxBudgetLpa: response.parsedCriteria.rateLpa || undefined,
      });

      // Pre-fill requirement fields from LLM extraction
      if (response.parsedCriteria.clientName) setClientName(response.parsedCriteria.clientName);
      if (response.parsedCriteria.endClient) setEndClient(response.parsedCriteria.endClient);
      if (response.parsedCriteria.engagementModel) {
        const em = response.parsedCriteria.engagementModel;
        if (['full_time_regular', 'full_time_contract', 'part_time_contract'].includes(em)) {
          setEngagementModel(em as EngagementModel);
        }
      }
      if (response.parsedCriteria.payroll) {
        const p = response.parsedCriteria.payroll;
        if (['quadzero', 'client'].includes(p)) setPayroll(p as Payroll);
      }
      if (response.parsedCriteria.budgetMinLpa != null) setBudgetMinLpa(response.parsedCriteria.budgetMinLpa.toString());
      if (response.parsedCriteria.budgetMaxLpa != null) setBudgetMaxLpa(response.parsedCriteria.budgetMaxLpa.toString());
      if (response.parsedCriteria.coreSkill) setCoreSkill(response.parsedCriteria.coreSkill);
      if (response.parsedCriteria.contractDurationMonths != null) {
        setContractDurationMonths(response.parsedCriteria.contractDurationMonths.toString());
      }

      // Trigger client defaults lookup if client name was extracted
      if (response.parsedCriteria.clientName) {
        lookupClientDefaults(response.parsedCriteria.clientName);
      }

      // Authenticated recruiters go through requirement details; others go straight to criteria
      if (isAuthenticated) {
        setRequirementSaved(false);
        setViewMode('requirement_details');
      } else {
        setViewMode('criteria');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse job description');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setCurrentPage(1);
    await runSearch(searchCriteria);
  };

  const handleNextPage = async () => {
    if (!paginationKey || !hasMore) return;
    setCurrentPage(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await runSearch(searchCriteria, paginationKey);
  };

  const handlePreviousPage = async () => {
    if (currentPage <= 1) return;
    setCurrentPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await runSearch(searchCriteria);
  };

  const openCandidateDrawer = (candidate: CandidateSearchResult) => {
    setSelectedCandidate(candidate);
    setDrawerOpen(true);
  };

  const handleDownloadResume = async (candidateId: string) => {
    if (!isAuthenticated) {
      handleLoginRequired();
      return;
    }
    try {
      setFormattingCandidateId(candidateId);
      setError(null);

      const maxRetries = 20;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await api.getResumeUrl(candidateId);

        if (response.status === 'ready' && response.downloadUrl) {
          window.open(response.downloadUrl, '_blank');
          setFormattingCandidateId(null);
          return;
        }

        // status === 'processing' — wait and retry
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }

      setError('Resume formatting is taking longer than expected. Please try again in a moment.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get resume');
    } finally {
      setFormattingCandidateId(null);
    }
  };

  const handleDownloadOriginalResume = async (candidateId: string) => {
    if (!isAuthenticated) {
      handleLoginRequired();
      return;
    }
    try {
      setError(null);
      const response = await api.getOriginalResumeUrl(candidateId);
      window.open(response.downloadUrl, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get original resume');
    }
  };

  const handleSaveAndContinue = async () => {
    if (!clientName.trim()) { setError('Client name is required'); return; }
    if (!engagementModel) { setError('Engagement model is required'); return; }
    if (!payroll) { setError('Payroll is required'); return; }
    if (!parsedCriteria) return;

    try {
      setSavingRequirement(true);
      setError(null);

      // Check for duplicates first
      const generatedTitle = generateJobTitle(clientName, endClient, coreSkill);
      const dupResponse = await api.checkDuplicate(clientName, parsedCriteria, generatedTitle || undefined);

      if (dupResponse.duplicates.length > 0) {
        setDuplicates(dupResponse.duplicates);
        setShowDuplicateModal(true);
        return;
      }

      // No duplicates — save directly
      await doSaveRequirement();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save requirement');
    } finally {
      setSavingRequirement(false);
    }
  };

  const doSaveRequirement = async () => {
    if (!parsedCriteria) return;

    try {
      setSavingRequirement(true);
      setError(null);

      // Resolve payment terms: from client defaults or recruiter input
      const resolvedPaymentTerms = clientDefaults?.found && clientDefaults.defaultPaymentTermsDays
        ? clientDefaults.defaultPaymentTermsDays
        : paymentTermsDays ? parseInt(paymentTermsDays) : undefined;

      const generatedTitle = generateJobTitle(clientName, endClient, coreSkill);
      await api.saveRequirement({
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
        status: 'active',
      });

      // Persist payment terms to client if recruiter entered them for a client without terms
      if (paymentTermsDays && clientName.trim()) {
        try {
          if (clientDefaults?.found && clientDefaults.clientId) {
            // Client exists but has no payment terms — update
            await api.updateClient(clientDefaults.clientId, {
              defaultPaymentTermsDays: parseInt(paymentTermsDays),
            });
          } else if (!clientDefaults?.found) {
            // Client doesn't exist — create with payment terms
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

      // Sync budget from requirement details into search criteria
      if (budgetMaxLpa) {
        setSearchCriteria(prev => ({ ...prev, maxBudgetLpa: parseFloat(budgetMaxLpa) }));
      }

      setRequirementSaved(true);
      setConsolidated(false);
      setShowDuplicateModal(false);
      setViewMode('criteria');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save requirement');
    } finally {
      setSavingRequirement(false);
    }
  };

  const handleConsolidate = async (match: DuplicateMatch) => {
    if (!parsedCriteria) return;
    try {
      setSavingRequirement(true);
      setError(null);
      const result = await api.consolidateRequirement(match.requirementId, {
        jdText: jobDescription,
        parsedCriteria,
        similarityScore: match.similarityScore,
      });
      if (budgetMaxLpa) {
        setSearchCriteria(prev => ({ ...prev, maxBudgetLpa: parseFloat(budgetMaxLpa) }));
      }
      setConsolidated(true);
      setConsolidateResult(result);
      setRequirementSaved(true);
      setShowDuplicateModal(false);
      setViewMode('criteria');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to consolidate requirement');
    } finally {
      setSavingRequirement(false);
    }
  };

  const handleSkipSave = () => {
    // Sync budget from requirement details into search criteria
    if (budgetMaxLpa) {
      setSearchCriteria(prev => ({ ...prev, maxBudgetLpa: parseFloat(budgetMaxLpa) }));
    }
    setViewMode('criteria');
  };

  const updateCriteria = (key: keyof SearchCriteria, value: unknown) => {
    setSearchCriteria({ ...searchCriteria, [key]: value });
  };

  const removeSkill = (skill: string, type: 'mustHave' | 'goodToHave') => {
    if (type === 'mustHave') {
      updateCriteria('mustHaveSkills', (searchCriteria.mustHaveSkills || []).filter(s => s !== skill));
    } else {
      updateCriteria('goodToHaveSkills', (searchCriteria.goodToHaveSkills || []).filter(s => s !== skill));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <Header>
        <nav className="flex items-center space-x-4">
          <button
            onClick={() => setViewMode('input')}
            className={`text-sm ${viewMode === 'input' ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}
          >
            JD
          </button>
          {isAuthenticated && (
            <>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <button
                onClick={() => parsedCriteria && setViewMode('requirement_details')}
                disabled={!parsedCriteria}
                className={`text-sm ${viewMode === 'requirement_details' ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-500 dark:text-gray-400'} disabled:opacity-50`}
              >
                Requirement
              </button>
            </>
          )}
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <button
            onClick={() => parsedCriteria && setViewMode('criteria')}
            disabled={!parsedCriteria}
            className={`text-sm ${viewMode === 'criteria' ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-500 dark:text-gray-400'} disabled:opacity-50`}
          >
            Criteria
          </button>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <button
            onClick={() => results.length > 0 && setViewMode('results')}
            disabled={results.length === 0}
            className={`text-sm ${viewMode === 'results' ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-500 dark:text-gray-400'} disabled:opacity-50`}
          >
            Results ({totalMatches})
          </button>
        </nav>
      </Header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Job Description Input */}
        {viewMode === 'input' && (
          <div className="card p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Find Candidates</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Paste your job description and let AI extract the search criteria automatically.
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
                  {loading ? 'Analyzing...' : 'Extract Requirements'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Requirement Details (authenticated recruiters only) */}
        {viewMode === 'requirement_details' && parsedCriteria && (
          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Save Requirement</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Fill in the requirement details to save this JD before searching candidates.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="label">Client Name <span className="text-red-500">*</span></label>
                  <ComboboxInput
                    value={clientName}
                    onChange={(val) => { setClientName(val); lookupClientDefaults(val); }}
                    options={clientNameOptions}
                    placeholder="Who shared this requirement?"
                    className="mt-1"
                    id="client-name"
                  />
                </div>
                <div>
                  <label className="label">End Client</label>
                  <ComboboxInput
                    value={endClient}
                    onChange={setEndClient}
                    options={endClientOptions}
                    placeholder="Who will leverage the resource? (optional)"
                    className="mt-1"
                    id="end-client"
                  />
                </div>
                <div>
                  <label className="label">Engagement Model <span className="text-red-500">*</span></label>
                  <select
                    value={engagementModel}
                    onChange={(e) => setEngagementModel(e.target.value as EngagementModel)}
                    className="input mt-1"
                  >
                    <option value="">Select engagement model</option>
                    {ENGAGEMENT_MODEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Payroll <span className="text-red-500">*</span></label>
                  <select
                    value={payroll}
                    onChange={(e) => setPayroll(e.target.value as Payroll)}
                    className="input mt-1"
                  >
                    <option value="">Select payroll</option>
                    {PAYROLL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Budget Range (LPA)</label>
                  <div className="mt-1 flex items-center space-x-2">
                    <input type="number" min="0" step="0.5" value={budgetMinLpa} onChange={(e) => setBudgetMinLpa(e.target.value)} placeholder="Min" className="input w-28" />
                    <span className="text-gray-500 dark:text-gray-400">to</span>
                    <input type="number" min="0" step="0.5" value={budgetMaxLpa} onChange={(e) => setBudgetMaxLpa(e.target.value)} placeholder="Max" className="input w-28" />
                  </div>
                </div>
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

            {/* Duplicate Modal */}
            {showDuplicateModal && duplicates.length > 0 && (
              <div className="card p-6 border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/10">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Similar Requirements Found</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Similar requirements from <strong>{clientName}</strong> already exist. You can add this to an existing requirement to track demand, or save it as a new one.
                </p>
                <div className="space-y-3">
                  {duplicates.map((dup) => (
                    <div key={dup.requirementId} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-yellow-200 dark:border-yellow-700">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{dup.jobTitle || 'Untitled'}</span>
                          <span className="badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">{dup.similarityScore}% match</span>
                          {dup.requestCount && dup.requestCount > 1 && (
                            <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">
                              Received {dup.requestCount}x
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{dup.reason}</p>
                      </div>
                      <button onClick={() => handleConsolidate(dup)} disabled={savingRequirement} className="btn-secondary text-sm whitespace-nowrap self-start">
                        Add to Existing
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end gap-3">
                  <button onClick={() => doSaveRequirement()} disabled={savingRequirement} className="btn-primary text-sm">
                    {savingRequirement ? 'Saving...' : 'Save as New Requirement'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => { setShowDuplicateModal(false); setViewMode('input'); }} className="btn-secondary">Back to JD</button>
              {!showDuplicateModal && (
                <div className="flex gap-3">
                  <button onClick={handleSkipSave} className="btn-secondary">
                    Skip & Search
                  </button>
                  <button
                    onClick={handleSaveAndContinue}
                    disabled={savingRequirement || !clientName.trim() || !engagementModel || !payroll}
                    className="btn-primary px-8"
                  >
                    {savingRequirement ? 'Checking...' : 'Save & Search'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Requirement saved banner */}
        {viewMode === 'criteria' && requirementSaved && (
          <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm text-green-700 dark:text-green-300">
              {consolidated && consolidateResult ? (
                <>
                  Requirement consolidated for <strong>{clientName}</strong>.
                  It has now been received <strong>{consolidateResult.requestCount} {consolidateResult.requestCount === 1 ? 'time' : 'times'}</strong>.
                  Now refine your search criteria below.
                </>
              ) : (
                <>
                  Requirement saved for <strong>{clientName}</strong>
                  {engagementModel && <span> ({formatEngagementModel(engagementModel)})</span>}.
                  Now refine your search criteria below.
                </>
              )}
            </p>
          </div>
        )}

        {/* Search Criteria */}
        {viewMode === 'criteria' && (
          <div className="space-y-6">
            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="card p-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">AI Suggestions</h3>
                <ul className="space-y-1">
                  {suggestions.map((suggestion, i) => (
                    <li key={i} className="text-sm text-yellow-700 dark:text-yellow-300 flex items-start">
                      <svg className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Search Criteria</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Must-Have Skills */}
                <div>
                  <label className="label">Must-Have Skills</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(searchCriteria.mustHaveSkills || []).map((skill) => (
                      <span key={skill} className="badge-primary flex items-center">
                        {skill}
                        <button onClick={() => removeSkill(skill, 'mustHave')} className="ml-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Good-to-Have Skills */}
                <div>
                  <label className="label">Good-to-Have Skills</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(searchCriteria.goodToHaveSkills || []).map((skill) => (
                      <span key={skill} className="badge-secondary flex items-center">
                        {skill}
                        <button onClick={() => removeSkill(skill, 'goodToHave')} className="ml-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Experience */}
                <div>
                  <label className="label">Experience (Years)</label>
                  <div className="mt-2 flex items-center space-x-2">
                    <input
                      type="number"
                      min="0"
                      value={searchCriteria.minExperience || ''}
                      onChange={(e) => updateCriteria('minExperience', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Min"
                      className="input w-24"
                    />
                    <span className="text-gray-500 dark:text-gray-400">to</span>
                    <input
                      type="number"
                      min="0"
                      value={searchCriteria.maxExperience || ''}
                      onChange={(e) => updateCriteria('maxExperience', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Max"
                      className="input w-24"
                    />
                  </div>
                </div>

                {/* Max Budget */}
                <div>
                  <label className="label">Max Budget (LPA)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={searchCriteria.maxBudgetLpa ?? ''}
                    onChange={(e) => updateCriteria('maxBudgetLpa', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="e.g., 25.0"
                    className="input mt-2"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Candidates with expected CTC within 85% of budget will match
                  </p>
                </div>

                {/* Seniority */}
                <div>
                  <label className="label">Seniority Level</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SENIORITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          const current = searchCriteria.seniority || [];
                          if (current.includes(opt.value)) {
                            updateCriteria('seniority', current.filter(s => s !== opt.value));
                          } else {
                            updateCriteria('seniority', [...current, opt.value]);
                          }
                        }}
                        className={`badge cursor-pointer ${
                          (searchCriteria.seniority || []).includes(opt.value)
                            ? 'bg-primary-100 text-primary-800 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600'
                            : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="label">Location</label>
                  <input
                    type="text"
                    value={searchCriteria.location || ''}
                    onChange={(e) => updateCriteria('location', e.target.value || undefined)}
                    placeholder="e.g., Bangalore"
                    className="input mt-2"
                  />
                </div>

                {/* Notice Period */}
                <div>
                  <label className="label">Notice Period</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {AVAILABILITY_OPTIONS.slice(0, 4).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          const current = searchCriteria.availability || [];
                          if (current.includes(opt.value)) {
                            updateCriteria('availability', current.filter(a => a !== opt.value));
                          } else {
                            updateCriteria('availability', [...current, opt.value]);
                          }
                        }}
                        className={`badge cursor-pointer ${
                          (searchCriteria.availability || []).includes(opt.value)
                            ? 'bg-primary-100 text-primary-800 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600'
                            : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between">
                <button onClick={() => setViewMode('input')} className="btn-secondary">
                  Back to JD
                </button>
                <button onClick={handleSearch} disabled={loading} className="btn-primary px-8">
                  {loading ? 'Searching...' : 'Search Candidates'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search Results */}
        {viewMode === 'results' && loading && results.length === 0 && (
          <div className="card p-12 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500 mx-auto" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">Searching for candidates...</p>
          </div>
        )}

        {viewMode === 'results' && !(loading && results.length === 0) && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Search Results</h2>
                <p className="text-gray-600 dark:text-gray-400">{totalMatches} candidates found</p>
              </div>
              <div className="flex items-center gap-3 self-start sm:self-auto">
                {sourceRequirementId && (
                  <button
                    onClick={() => router.push(`/recruiter/requirements/${sourceRequirementId}`)}
                    className="btn-secondary"
                  >
                    Back to Requirement
                  </button>
                )}
                <button onClick={() => setViewMode('criteria')} className="btn-secondary">
                  Modify Search
                </button>
              </div>
            </div>

            {/* Sign-in banner for non-authenticated users */}
            {!isAuthenticated && results.length > 0 && (
              <div className="mb-6 p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-primary-800 dark:text-primary-200">Sign in to view full candidate details</p>
                  <p className="text-sm text-primary-600 dark:text-primary-400">Names, skills, CTC, and resume downloads are available after sign-in.</p>
                </div>
                <button onClick={handleLoginRequired} className="btn-primary whitespace-nowrap self-start sm:self-auto">
                  Sign In
                </button>
              </div>
            )}

            <div className="space-y-4">
              {results.map((candidate, index) => (
                <div
                  key={candidate.candidateId}
                  className="card p-6 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => isAuthenticated ? openCandidateDrawer(candidate) : handleLoginRequired()}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {isAuthenticated ? candidate.fullName : `Candidate #${index + 1}`}
                        </h3>
                        <span className={`badge ${getMatchScoreBgColor(candidate.matchScore)} ${getMatchScoreColor(candidate.matchScore)}`}>
                          {candidate.matchScore}% Match
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                        <span>{candidate.totalExperience} years exp</span>
                        <span>{formatSeniority(candidate.seniority)}</span>
                        {isAuthenticated && candidate.location && <span>{candidate.location}</span>}
                        <span>{formatAvailability(candidate.availability)}</span>
                        {isAuthenticated && candidate.expectedCtc && (
                          <span>{candidate.expectedCtc} LPA expected</span>
                        )}
                      </div>

                      {isAuthenticated ? (
                        <>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {candidate.primarySkills.slice(0, 6).map((skill) => (
                              <span
                                key={skill}
                                className={`badge ${
                                  candidate.matchDetails.mustHaveMatched.includes(skill)
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {skill}
                              </span>
                            ))}
                            {candidate.primarySkills.length > 6 && (
                              <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                +{candidate.primarySkills.length - 6} more
                              </span>
                            )}
                          </div>

                          {candidate.matchDetails.mustHaveRelated?.length > 0 && (
                            <div className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">
                              Related: {candidate.matchDetails.mustHaveRelated.join(', ')}
                            </div>
                          )}

                          {candidate.matchDetails.mustHaveMissing.length > 0 && (
                            <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                              Missing: {candidate.matchDetails.mustHaveMissing.join(', ')}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="mt-3">
                          <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {candidate.primarySkills.length} skills
                          </span>
                          <span className="ml-2 text-sm text-primary-600 dark:text-primary-400">
                            Sign in to view details
                          </span>
                        </div>
                      )}
                    </div>

                    {isAuthenticated && (
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadResume(candidate.candidateId);
                          }}
                          disabled={formattingCandidateId === candidate.candidateId}
                          className="btn-outline text-sm self-start whitespace-nowrap"
                        >
                          {formattingCandidateId === candidate.candidateId ? 'Formatting...' : 'Download Resume'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadOriginalResume(candidate.candidateId);
                          }}
                          className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          Download Original
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {results.length === 0 && (
                <div className="card p-12 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No candidates found</h3>
                  <p className="mt-2 text-gray-500 dark:text-gray-400">Try adjusting your search criteria</p>
                </div>
              )}

              {/* Pagination */}
              {results.length > 0 && (currentPage > 1 || hasMore) && (
                <div className="mt-6 flex items-center justify-between">
                  <button
                    onClick={handlePreviousPage}
                    disabled={currentPage <= 1 || loading}
                    className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Page {currentPage}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={!hasMore || loading}
                    className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Candidate Detail Drawer — only accessible when authenticated */}
      {drawerOpen && selectedCandidate && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedCandidate.fullName}</h2>
                <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                {/* Match Score */}
                <div className={`p-4 rounded-lg ${getMatchScoreBgColor(selectedCandidate.matchScore)}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Match Score</span>
                    <span className={`text-2xl font-bold ${getMatchScoreColor(selectedCandidate.matchScore)}`}>
                      {selectedCandidate.matchScore}%
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Experience</label>
                    <p className="font-medium">{selectedCandidate.totalExperience} years</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Seniority</label>
                    <p className="font-medium">{formatSeniority(selectedCandidate.seniority)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Location</label>
                    <p className="font-medium">{selectedCandidate.location || 'Not specified'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Notice Period</label>
                    <p className="font-medium">{formatAvailability(selectedCandidate.availability)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Engagement Preference</label>
                    <p className="font-medium">{formatCandidateEngagement(selectedCandidate.engagementModel || 'either')}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Current CTC</label>
                    <p className="font-medium">{selectedCandidate.currentCtc ? `${selectedCandidate.currentCtc} LPA` : 'Not specified'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">Expected CTC</label>
                    <p className="font-medium">{selectedCandidate.expectedCtc ? `${selectedCandidate.expectedCtc} LPA` : 'Not specified'}</p>
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-2 block">Skills</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedCandidate.primarySkills.map((skill) => (
                      <span
                        key={skill}
                        className={`badge ${
                          selectedCandidate.matchDetails.mustHaveMatched.includes(skill)
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : selectedCandidate.matchDetails.goodToHaveMatched.includes(skill)
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Match Details */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h3 className="font-medium mb-3">Match Analysis</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center text-green-600 dark:text-green-400">
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Must-have matched: {selectedCandidate.matchDetails.mustHaveMatched.join(', ') || 'None'}
                    </div>
                    {selectedCandidate.matchDetails.mustHaveRelated?.length > 0 && (
                      <div className="flex items-center text-yellow-600 dark:text-yellow-400">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Related (not scored): {selectedCandidate.matchDetails.mustHaveRelated.join(', ')}
                      </div>
                    )}
                    {selectedCandidate.matchDetails.mustHaveMissing.length > 0 && (
                      <div className="flex items-center text-red-600 dark:text-red-400">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Missing: {selectedCandidate.matchDetails.mustHaveMissing.join(', ')}
                      </div>
                    )}
                    <div className="flex items-center text-blue-600 dark:text-blue-400">
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Nice-to-have matched: {selectedCandidate.matchDetails.goodToHaveMatched.join(', ') || 'None'}
                    </div>
                    {selectedCandidate.matchDetails.goodToHaveRelated?.length > 0 && (
                      <div className="flex items-center text-blue-400 dark:text-blue-500">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Nice-to-have related: {selectedCandidate.matchDetails.goodToHaveRelated.join(', ')}
                      </div>
                    )}
                    {searchCriteria.maxBudgetLpa && (
                      <div className={`flex items-center ${selectedCandidate.matchDetails.ctcMatch ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {selectedCandidate.matchDetails.ctcMatch ? (
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        {selectedCandidate.matchDetails.ctcMatch ? 'Within budget' : 'Over budget'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pricing Calculator */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <PricingPanel
                    candidateId={selectedCandidate.candidateId}
                    candidateExpectedCtcLpa={selectedCandidate.expectedCtc}
                    candidateCurrentCtcLpa={selectedCandidate.currentCtc}
                    candidateExperienceYears={selectedCandidate.totalExperience}
                    isInternalRecruiter={isInternalRecruiter}
                    onCtcUpdated={(expectedCtc, currentCtc) => {
                      setSelectedCandidate(prev => prev ? { ...prev, expectedCtc, currentCtc } : prev);
                    }}
                  />
                </div>

                {/* Actions */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <button
                    onClick={() => handleDownloadResume(selectedCandidate.candidateId)}
                    disabled={formattingCandidateId === selectedCandidate.candidateId}
                    className="btn-primary w-full"
                  >
                    {formattingCandidateId === selectedCandidate.candidateId ? 'Formatting resume...' : 'Download Resume'}
                  </button>
                  <div className="mt-2 text-center">
                    <button
                      onClick={() => handleDownloadOriginalResume(selectedCandidate.candidateId)}
                      className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Download Original Resume
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
