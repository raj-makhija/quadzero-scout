'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/Header';
import { PricingPanel } from '@/components/PricingPanel';
import { ComboboxInput } from '@/components/ui/combobox-input';
import { api, ApiError, ParsedCriteria, SearchCriteria, CandidateSearchResult, EngagementModel, Payroll, DuplicateMatch, ConsolidateResponse, ClientDefaultsResponse, AdditionalFieldDefinition } from '@/lib/api';
import { AdditionalFieldsBuilder } from '@/components/additional-fields-builder';
import { formatSeniority, formatAvailability, formatCandidateEngagement, getMatchScoreColor, getMatchScoreBgColor, formatRelativeTime, SENIORITY_OPTIONS, AVAILABILITY_OPTIONS, ENGAGEMENT_MODEL_OPTIONS, PAYROLL_OPTIONS, formatEngagementModel } from '@/lib/utils';
import { ScreeningModal, getScreeningStatus, isScreeningExpired } from '@/components/screening-modal';
import { ShortlistModal } from '@/components/shortlist-modal';
import { toast } from '@/hooks/use-toast';

type ViewMode = 'input' | 'requirement_details' | 'criteria' | 'results';

const STORAGE_KEY = 'scout_recruiter_search';
const PAGE_SIZE = 20;

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
  const [allResults, setAllResults] = useState<CandidateSearchResult[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading] = useState(prefilled?.viewMode === 'results');
  const [error, setError] = useState<string | null>(null);
  const [paginationKey, setPaginationKey] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showNotSuitable, setShowNotSuitable] = useState(false);

  // Derive the current page of results from allResults (filtering not-suitable unless toggled)
  const filteredResults = useMemo(
    () => showNotSuitable ? allResults : allResults.filter(c => !c.isNotSuitable),
    [allResults, showNotSuitable]
  );
  const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE);
  const results = useMemo(
    () => filteredResults.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredResults, currentPage]
  );
  const [formattingCandidateId, setFormattingCandidateId] = useState<string | null>(null);
  const [sourceRequirementId, setSourceRequirementId] = useState<string | null>(prefilled?.requirementId || null);
  const [sortBy, setSortBy] = useState<'matchScore' | 'experience' | 'lastUpdated'>('matchScore');
  const [screeningCandidate, setScreeningCandidate] = useState<CandidateSearchResult | null>(null);

  // Shortlisting state
  const [shortlistModalCandidate, setShortlistModalCandidate] = useState<CandidateSearchResult | null>(null);
  const [requirementContext, setRequirementContext] = useState<{
    requirementId: string;
    clientName: string;
    jobTitle?: string;
    engagementModel: string;
    contractDurationMonths?: number;
    paymentTermsDays?: number;
    budgetMinLpa?: number;
    budgetMaxLpa?: number;
    additionalFields?: AdditionalFieldDefinition[];
  } | null>(() => {
    if (prefilled?.requirementId && prefilled?.requirementMeta) {
      return { requirementId: prefilled.requirementId, ...prefilled.requirementMeta };
    }
    return null;
  });

  // Skill input state for adding skills
  const [mustHaveSkillInput, setMustHaveSkillInput] = useState('');
  const [goodToHaveSkillInput, setGoodToHaveSkillInput] = useState('');
  const [roleInput, setRoleInput] = useState('');
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [criteriaSaveSuccess, setCriteriaSaveSuccess] = useState(false);
  const [locationInput, setLocationInput] = useState('');

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
  const [additionalFields, setAdditionalFields] = useState<AdditionalFieldDefinition[]>([]);

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
  const runSearch = useCallback(async (criteria: SearchCriteria, lastEvaluatedKey?: string, sort?: 'matchScore' | 'experience' | 'lastUpdated', append?: boolean) => {
    try {
      setLoading(true);
      setError(null);
      const pagination = lastEvaluatedKey ? { lastEvaluatedKey } : undefined;
      const response = await api.searchCandidates(criteria, pagination, sort || sortBy, sourceRequirementId || undefined);
      if (append) {
        setAllResults(prev => [...prev, ...response.candidates]);
      } else {
        setAllResults(response.candidates);
        setCurrentPage(1);
      }
      setTotalMatches(prev => append ? prev + response.totalMatches : response.totalMatches);
      setPaginationKey(response.pagination.lastEvaluatedKey);
      setHasMore(response.pagination.hasMore);
      setViewMode('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

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

  // Fetch requirement context when sourceRequirementId exists but context is missing
  useEffect(() => {
    if (!sourceRequirementId || !isAuthenticated || requirementContext) return;
    let cancelled = false;

    api.getRequirement(sourceRequirementId)
      .then((req) => {
        if (!cancelled) {
          setRequirementContext({
            requirementId: req.requirementId,
            clientName: req.clientName,
            jobTitle: req.jobTitle,
            engagementModel: req.engagementModel,
            contractDurationMonths: req.contractDurationMonths,
            paymentTermsDays: req.paymentTermsDays,
            budgetMinLpa: req.budgetMinLpa,
            budgetMaxLpa: req.budgetMaxLpa,
            additionalFields: req.additionalFields,
          });
        }
      })
      .catch(() => { /* non-fatal — pricing will work without context */ });

    return () => { cancelled = true; };
  }, [sourceRequirementId, isAuthenticated, requirementContext]);

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
        roles: response.parsedCriteria.roles || [],
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
    await runSearch(searchCriteria);
  };

  const handleNextPage = async () => {
    if (currentPage < totalPages) {
      // Navigate to next local page
      setCurrentPage(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (hasMore && paginationKey) {
      // Fetch more results from server and advance
      setCurrentPage(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await runSearch(searchCriteria, paginationKey, undefined, true);
    }
  };

  const handlePreviousPage = async () => {
    if (currentPage <= 1) return;
    setCurrentPage(prev => prev - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleViewResume = async (candidateId: string) => {
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
          const ext = response.fileName?.split('.').pop()?.toLowerCase() || 'pdf';
          window.open(`/recruiter/viewer?url=${encodeURIComponent(response.downloadUrl)}&type=${ext}`, '_blank');
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

  const handleViewOriginalResume = async (candidateId: string) => {
    if (!isAuthenticated) {
      handleLoginRequired();
      return;
    }
    try {
      setError(null);
      const response = await api.getOriginalResumeUrl(candidateId);
      const ext = response.fileName?.split('.').pop()?.toLowerCase() || 'pdf';
      window.open(`/recruiter/viewer?url=${encodeURIComponent(response.downloadUrl)}&type=${ext}`, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get original resume');
    }
  };

  const handleSortChange = useCallback((newSort: 'matchScore' | 'experience' | 'lastUpdated') => {
    setSortBy(newSort);
    if (allResults.length > 0) {
      runSearch(searchCriteria, undefined, newSort);
    }
  }, [allResults.length, searchCriteria, runSearch]);

  const handleScreenCandidate = useCallback((candidate: CandidateSearchResult) => {
    setScreeningCandidate(candidate);
  }, []);

  const handleScreeningComplete = useCallback((candidateId: string, updatedValues?: Partial<CandidateSearchResult>) => {
    setScreeningCandidate(null);
    // Update the candidate's lastScreenedAt and any screened values in the local results
    const now = new Date().toISOString();
    setAllResults(prev => {
      const updated = prev.map(c =>
        c.candidateId === candidateId ? { ...c, ...updatedValues, lastScreenedAt: now } : c
      );
      // After screening in shortlist flow, auto-open the shortlist modal
      if (sourceRequirementId && requirementContext) {
        const refreshed = updated.find(c => c.candidateId === candidateId);
        if (refreshed) {
          setShortlistModalCandidate(refreshed);
        }
      }
      return updated;
    });
  }, [sourceRequirementId, requirementContext]);

  // Smart routing: conditions met → ShortlistModal; conditions not met → ScreeningModal
  const handleShortlistClick = useCallback((candidate: CandidateSearchResult) => {
    if (!sourceRequirementId || !requirementContext) {
      toast({ variant: 'warning', title: 'Requirement Required', description: 'Save this search as a requirement to shortlist candidates.' });
      return;
    }

    const screeningValid = !isScreeningExpired(candidate.lastScreenedAt);
    const ctcAvailable = candidate.expectedCtc != null;

    if (screeningValid && ctcAvailable) {
      // Conditions met → open ShortlistModal directly
      setShortlistModalCandidate(candidate);
    } else {
      // Conditions not met → open Screening Modal
      setScreeningCandidate(candidate);
    }
  }, [sourceRequirementId, requirementContext]);

  const handleShortlisted = useCallback((candidateId: string) => {
    setAllResults(prev => prev.map(r =>
      r.candidateId === candidateId ? { ...r, isShortlisted: true } : r
    ));
    setShortlistModalCandidate(null);
    toast({
      variant: 'success',
      title: 'Candidate Shortlisted',
      description: `Shortlisted for ${requirementContext?.clientName || 'this requirement'}`,
    });
  }, [requirementContext]);

  const handleMarkNotSuitable = useCallback(async (candidateId: string) => {
    if (!sourceRequirementId) return;
    try {
      await api.markNotSuitable(sourceRequirementId, candidateId);
      setAllResults(prev => prev.map(r =>
        r.candidateId === candidateId ? { ...r, isNotSuitable: true, isShortlisted: false } : r
      ));
      toast({ variant: 'default', title: 'Marked as Not Suitable' });
    } catch (err) {
      toast({ variant: 'error', title: 'Error', description: err instanceof Error ? err.message : 'Failed to mark as not suitable' });
    }
  }, [sourceRequirementId]);

  const handleRescreenFromModal = useCallback((candidate: CandidateSearchResult) => {
    setShortlistModalCandidate(null);
    setScreeningCandidate(candidate);
  }, []);

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
      const dupResponse = await api.checkRequirementDuplicate(clientName, parsedCriteria, generatedTitle || undefined);

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
      const saveResult = await api.saveRequirement({
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
        additionalFields: additionalFields.length > 0 ? additionalFields : undefined,
      });

      // Capture requirement ID so shortlisting is available from search results
      setSourceRequirementId(saveResult.requirementId);
      setRequirementContext({
        requirementId: saveResult.requirementId,
        clientName: clientName.trim(),
        jobTitle: generatedTitle || undefined,
        engagementModel: engagementModel as string,
        contractDurationMonths: contractDurationMonths ? parseInt(contractDurationMonths) : undefined,
        paymentTermsDays: resolvedPaymentTerms,
        budgetMinLpa: budgetMinLpa ? parseFloat(budgetMinLpa) : undefined,
        budgetMaxLpa: budgetMaxLpa ? parseFloat(budgetMaxLpa) : undefined,
        additionalFields: additionalFields.length > 0 ? additionalFields : undefined,
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

      // Capture consolidated requirement ID for shortlisting
      setSourceRequirementId(match.requirementId);
      setRequirementContext({
        requirementId: match.requirementId,
        clientName: clientName.trim(),
        jobTitle: generateJobTitle(clientName, endClient, coreSkill) || undefined,
        engagementModel: engagementModel as string,
        contractDurationMonths: contractDurationMonths ? parseInt(contractDurationMonths) : undefined,
        paymentTermsDays: clientDefaults?.found && clientDefaults.defaultPaymentTermsDays
          ? clientDefaults.defaultPaymentTermsDays
          : paymentTermsDays ? parseInt(paymentTermsDays) : undefined,
        budgetMinLpa: budgetMinLpa ? parseFloat(budgetMinLpa) : undefined,
        budgetMaxLpa: budgetMaxLpa ? parseFloat(budgetMaxLpa) : undefined,
      });

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

  const addSkill = (skill: string, type: 'mustHave' | 'goodToHave') => {
    const trimmed = skill.trim().toLowerCase();
    if (!trimmed) return;

    if (type === 'mustHave') {
      const current = searchCriteria.mustHaveSkills || [];
      if (!current.includes(trimmed)) {
        updateCriteria('mustHaveSkills', [...current, trimmed]);
      }
      setMustHaveSkillInput('');
    } else {
      const current = searchCriteria.goodToHaveSkills || [];
      if (!current.includes(trimmed)) {
        updateCriteria('goodToHaveSkills', [...current, trimmed]);
      }
      setGoodToHaveSkillInput('');
    }
  };

  const addRole = (role: string) => {
    const trimmed = role.trim();
    if (!trimmed) return;
    const current = searchCriteria.roles || [];
    if (!current.some(r => r.toLowerCase() === trimmed.toLowerCase())) {
      updateCriteria('roles', [...current, trimmed]);
    }
    setRoleInput('');
  };

  const removeRole = (role: string) => {
    updateCriteria('roles', (searchCriteria.roles || []).filter(r => r !== role));
  };

  // Parse current location string into individual location tags
  const locationTags = (searchCriteria.location || '')
    .split(/[,;]/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const addLocation = (loc: string) => {
    const trimmed = loc.trim();
    if (!trimmed) return;
    const current = locationTags;
    if (!current.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
      updateCriteria('location', [...current, trimmed].join(', '));
    }
    setLocationInput('');
  };

  const removeLocation = (loc: string) => {
    const updated = locationTags.filter(l => l !== loc);
    updateCriteria('location', updated.length > 0 ? updated.join(', ') : undefined);
  };

  // Derive the original search criteria from parsedCriteria for comparison
  const deriveSearchCriteria = (pc: ParsedCriteria): SearchCriteria => ({
    coreSkill: pc.coreSkill || undefined,
    mustHaveSkills: pc.mustHaveSkills,
    goodToHaveSkills: pc.goodToHaveSkills,
    minExperience: pc.minExperience || undefined,
    maxExperience: pc.maxExperience || undefined,
    seniority: pc.seniority,
    availability: pc.availability,
    location: pc.location || undefined,
    roles: pc.roles || [],
    maxBudgetLpa: (budgetMaxLpa ? parseFloat(budgetMaxLpa) : undefined) || pc.rateLpa || undefined,
  });

  const originalCriteria = parsedCriteria ? deriveSearchCriteria(parsedCriteria) : null;
  const criteriaModified = originalCriteria
    ? JSON.stringify(searchCriteria) !== JSON.stringify(originalCriteria)
    : false;

  const handleResetCriteria = () => {
    if (originalCriteria) {
      setSearchCriteria(originalCriteria);
      setCriteriaSaveSuccess(false);
    }
  };

  const handleSaveCriteriaToRequirement = async () => {
    if (!sourceRequirementId || !parsedCriteria) return;
    try {
      setSavingCriteria(true);
      setError(null);
      const updatedParsedCriteria: ParsedCriteria = {
        ...parsedCriteria,
        mustHaveSkills: searchCriteria.mustHaveSkills || [],
        goodToHaveSkills: searchCriteria.goodToHaveSkills || [],
        minExperience: searchCriteria.minExperience ?? null,
        maxExperience: searchCriteria.maxExperience ?? null,
        seniority: searchCriteria.seniority || [],
        availability: searchCriteria.availability || [],
        location: searchCriteria.location || null,
        roles: searchCriteria.roles || [],
      };
      await api.updateRequirementCriteria(sourceRequirementId, updatedParsedCriteria, searchCriteria.maxBudgetLpa);
      setParsedCriteria(updatedParsedCriteria);
      setCriteriaSaveSuccess(true);
      setTimeout(() => setCriteriaSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save criteria to requirement');
    } finally {
      setSavingCriteria(false);
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
            onClick={() => allResults.length > 0 && setViewMode('results')}
            disabled={allResults.length === 0}
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

              {/* Additional Data Points */}
              <div className="mt-4">
                <AdditionalFieldsBuilder fields={additionalFields} onChange={setAdditionalFields} />
              </div>
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
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Search Criteria</h2>
                  {criteriaModified && (
                    <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
                      Modified
                    </span>
                  )}
                </div>
                {criteriaModified && (
                  <button onClick={handleResetCriteria} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                    Reset to Original
                  </button>
                )}
              </div>

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
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={mustHaveSkillInput}
                      onChange={(e) => setMustHaveSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSkill(mustHaveSkillInput, 'mustHave');
                        }
                      }}
                      placeholder="Add a skill and press Enter"
                      className="input flex-1"
                    />
                    <button
                      onClick={() => addSkill(mustHaveSkillInput, 'mustHave')}
                      disabled={!mustHaveSkillInput.trim()}
                      className="btn-secondary px-3 py-2 disabled:opacity-50"
                      type="button"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
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
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={goodToHaveSkillInput}
                      onChange={(e) => setGoodToHaveSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSkill(goodToHaveSkillInput, 'goodToHave');
                        }
                      }}
                      placeholder="Add a skill and press Enter"
                      className="input flex-1"
                    />
                    <button
                      onClick={() => addSkill(goodToHaveSkillInput, 'goodToHave')}
                      disabled={!goodToHaveSkillInput.trim()}
                      className="btn-secondary px-3 py-2 disabled:opacity-50"
                      type="button"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Roles */}
                <div>
                  <label className="label">Roles</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(searchCriteria.roles || []).map((role) => (
                      <span key={role} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        {role}
                        <button onClick={() => removeRole(role)} className="ml-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={roleInput}
                      onChange={(e) => setRoleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addRole(roleInput);
                        }
                      }}
                      placeholder="Add a role and press Enter"
                      className="input flex-1"
                    />
                    <button
                      onClick={() => addRole(roleInput)}
                      disabled={!roleInput.trim()}
                      className="btn-secondary px-3 py-2 disabled:opacity-50"
                      type="button"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
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
                    Candidates over budget will be shown with an indicator
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
                  <label className="label">Locations</label>
                  {locationTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {locationTags.map((loc) => (
                        <span key={loc} className="badge bg-primary-100 text-primary-800 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600 flex items-center gap-1">
                          {loc}
                          <button onClick={() => removeLocation(loc)} className="ml-1 hover:text-red-500" title="Remove">
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={locationInput}
                      onChange={(e) => setLocationInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addLocation(locationInput);
                        }
                      }}
                      placeholder="e.g., Bangalore"
                      className="input flex-1"
                    />
                    <button
                      onClick={() => addLocation(locationInput)}
                      disabled={!locationInput.trim()}
                      className="btn-secondary text-sm px-3"
                    >
                      +
                    </button>
                  </div>
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
                <div className="flex items-center gap-3">
                  {sourceRequirementId && criteriaModified && (
                    <button
                      onClick={handleSaveCriteriaToRequirement}
                      disabled={savingCriteria}
                      className="btn-secondary text-sm"
                    >
                      {savingCriteria ? 'Saving...' : 'Save to Requirement'}
                    </button>
                  )}
                  {criteriaSaveSuccess && (
                    <span className="text-sm text-green-600 dark:text-green-400">Saved!</span>
                  )}
                  <button onClick={handleSearch} disabled={loading} className="btn-primary px-8">
                    {loading ? 'Searching...' : 'Search Candidates'}
                  </button>
                </div>
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
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value as 'matchScore' | 'experience' | 'lastUpdated')}
                  className="input text-sm py-1.5 px-2"
                >
                  <option value="lastUpdated">Sort: Last Updated</option>
                  <option value="matchScore">Sort: Match Score</option>
                  <option value="experience">Sort: Experience</option>
                </select>
                {sourceRequirementId && (
                  <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showNotSuitable}
                      onChange={(e) => { setShowNotSuitable(e.target.checked); setCurrentPage(1); }}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    Show not suitable
                  </label>
                )}
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
                  <p className="text-sm text-primary-600 dark:text-primary-400">Names, skills, CTC, and resume viewing are available after sign-in.</p>
                </div>
                <button onClick={handleLoginRequired} className="btn-primary whitespace-nowrap self-start sm:self-auto">
                  Sign In
                </button>
              </div>
            )}

            {/* Low results banner */}
            {totalMatches > 0 && totalMatches < 5 && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Only {totalMatches} candidate{totalMatches === 1 ? '' : 's'} matched. Consider broadening your criteria for more results.
                </p>
                <button onClick={() => setViewMode('criteria')} className="btn-secondary text-sm whitespace-nowrap self-start">
                  Refine Criteria
                </button>
              </div>
            )}

            <div className="space-y-4">
              {results.map((candidate, index) => (
                <div
                  key={candidate.candidateId}
                  className={`card p-6 hover:shadow-md transition-shadow cursor-pointer ${candidate.notInterested ? 'opacity-60 border-l-4 border-l-red-400' : candidate.isNotSuitable ? 'opacity-50 border-l-4 border-l-orange-400 bg-orange-50/30 dark:bg-orange-950/10' : candidate.isShortlisted ? 'border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20' : ''}`}
                  onClick={() => {
                    if (!isAuthenticated) { handleLoginRequired(); return; }
                    // Smart routing when requirement exists and candidate not yet shortlisted/not-suitable
                    if (sourceRequirementId && requirementContext && !candidate.isShortlisted && !candidate.isNotSuitable) {
                      handleShortlistClick(candidate);
                    } else {
                      setShortlistModalCandidate(candidate);
                    }
                  }}
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
                        {isAuthenticated && (() => {
                          const status = getScreeningStatus(candidate.lastScreenedAt, candidate.notInterested);
                          return (
                            <span className={`badge text-xs ${status.className}`}>
                              {status.label}
                            </span>
                          );
                        })()}
                        {isAuthenticated && candidate.isShortlisted && (
                          <span className="badge text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            Shortlisted
                          </span>
                        )}
                        {isAuthenticated && candidate.isNotSuitable && (
                          <span className="badge text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                            Not Suitable
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          {candidate.totalExperience} years exp
                          {(searchCriteria.minExperience != null || searchCriteria.maxExperience != null) && candidate.matchDetails.experienceMatch === 'partial' && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">(close to range)</span>
                          )}
                          {(searchCriteria.minExperience != null || searchCriteria.maxExperience != null) && candidate.matchDetails.experienceMatch === 'none' && (
                            <span className="text-xs text-red-500 dark:text-red-400">(outside range)</span>
                          )}
                        </span>
                        <span>{formatSeniority(candidate.seniority)}</span>
                        {isAuthenticated && candidate.location && (
                          <span className="flex items-center gap-1">
                            {candidate.location}
                            {searchCriteria.location && candidate.matchDetails.locationMatch === 'none' && (
                              <span className="text-xs text-amber-600 dark:text-amber-400">(different location)</span>
                            )}
                          </span>
                        )}
                        {isAuthenticated && !candidate.location && searchCriteria.location && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">Location unknown</span>
                        )}
                        <span className="flex items-center gap-1">
                          {formatAvailability(candidate.availability)}
                          {searchCriteria.availability && searchCriteria.availability.length > 0 && candidate.matchDetails.availabilityMatch === 'partial' && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">(slightly longer)</span>
                          )}
                          {searchCriteria.availability && searchCriteria.availability.length > 0 && candidate.matchDetails.availabilityMatch === 'none' && (
                            <span className="text-xs text-red-500 dark:text-red-400">(longer than desired)</span>
                          )}
                        </span>
                        {isAuthenticated && candidate.expectedCtc && (
                          <span className="flex items-center gap-1">
                            {candidate.expectedCtc} LPA expected
                            {searchCriteria.maxBudgetLpa != null && !candidate.matchDetails.ctcMatch && (
                              <span className="text-xs text-red-500 dark:text-red-400">(over budget)</span>
                            )}
                          </span>
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

                          {(() => {
                            const hiddenMatched = candidate.matchDetails.mustHaveMatched.filter(
                              s => !candidate.primarySkills.includes(s)
                            );
                            return hiddenMatched.length > 0 ? (
                              <div className="mt-2 text-sm text-green-700 dark:text-green-400">
                                Matched: {hiddenMatched.join(', ')}
                              </div>
                            ) : null;
                          })()}

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
                        {sourceRequirementId && !candidate.isShortlisted && !candidate.isNotSuitable && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShortlistClick(candidate);
                              }}
                              className="btn-primary text-sm whitespace-nowrap"
                            >
                              Shortlist
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkNotSuitable(candidate.candidateId);
                              }}
                              className="btn-outline text-sm whitespace-nowrap text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950/30"
                            >
                              Not Suitable
                            </button>
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewResume(candidate.candidateId);
                          }}
                          disabled={formattingCandidateId === candidate.candidateId}
                          className="btn-outline text-sm self-start whitespace-nowrap"
                        >
                          {formattingCandidateId === candidate.candidateId ? 'Formatting...' : 'View Resume'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewOriginalResume(candidate.candidateId);
                          }}
                          className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          View Original
                        </button>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          Updated {formatRelativeTime(candidate.lastUpdated)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {results.length === 0 && (
                <div className="card p-12 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No candidates found</h3>
                  <p className="mt-2 text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                    Try widening your search: increase the experience range, raise the max budget,
                    add alternative skills, or relax seniority requirements.
                  </p>
                  <div className="mt-6">
                    <button onClick={() => setViewMode('criteria')} className="btn-primary">
                      Modify Search Criteria
                    </button>
                  </div>
                </div>
              )}

              {/* Pagination */}
              {filteredResults.length > PAGE_SIZE && (
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
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={(currentPage >= totalPages && !hasMore) || loading}
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

      {/* Screening Modal */}
      {screeningCandidate && (
        <ScreeningModal
          candidate={screeningCandidate}
          onClose={() => setScreeningCandidate(null)}
          onScreeningComplete={handleScreeningComplete}
          isShortlistFlow={!!sourceRequirementId}
          additionalFields={requirementContext?.additionalFields}
        />
      )}

      {/* Shortlist Modal */}
      {shortlistModalCandidate && (
        <ShortlistModal
          candidate={shortlistModalCandidate}
          requirementContext={requirementContext}
          searchCriteria={searchCriteria}
          isInternalRecruiter={isInternalRecruiter}
          onClose={() => setShortlistModalCandidate(null)}
          onShortlisted={handleShortlisted}
          onRescreen={handleRescreenFromModal}
          onCtcUpdated={(expectedCtc, currentCtc) => {
            setShortlistModalCandidate(prev => prev ? { ...prev, expectedCtc, currentCtc } : prev);
            setAllResults(prev => prev.map(c =>
              c.candidateId === shortlistModalCandidate.candidateId ? { ...c, expectedCtc, currentCtc } : c
            ));
          }}
          onViewResume={handleViewResume}
          onViewOriginalResume={handleViewOriginalResume}
          formattingCandidateId={formattingCandidateId}
          onSaveRequirement={() => { setShortlistModalCandidate(null); setViewMode('requirement_details'); }}
        />
      )}
    </div>
  );
}
