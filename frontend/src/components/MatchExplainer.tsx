'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  UserPlus,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { MatchDebugResponse, MatchDebugFilterResult, CandidateNameSearchResult, AdditionalFieldDefinition, CandidateSearchResult, RequirementSummary } from '@/lib/api';
import { ScreeningModal, isScreeningExpired, getScreeningStatus } from '@/components/screening-modal';

// ─── Candidate Search Variant ─────────────────────────────────────────────────

interface CheckCandidateProps {
  requirementId: string;
  onShortlisted?: () => void;
  additionalFields?: AdditionalFieldDefinition[];
}

export function CheckCandidateMatch({ requirementId, onShortlisted, additionalFields }: CheckCandidateProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CandidateNameSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateNameSearchResult | null>(null);
  const [debugResult, setDebugResult] = useState<MatchDebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchCandidates = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const res = await api.searchCandidatesByName(q, 8);
      setSuggestions(res.candidates);
      setShowSuggestions(true);
    } catch { setSuggestions([]); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchCandidates(query), 300);
    return () => clearTimeout(timer);
  }, [query, searchCandidates]);

  const handleSelect = async (candidate: CandidateNameSearchResult) => {
    setSelectedCandidate(candidate);
    setQuery(candidate.fullName);
    setShowSuggestions(false);
    setSuggestions([]);
    setLoading(true);
    setError('');
    try {
      const result = await api.matchDebug(candidate.candidateId, requirementId);
      setDebugResult(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to run match check');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSelectedCandidate(null);
    setDebugResult(null);
    setError('');
    setSuggestions([]);
  };

  return (
    <div className="card p-6 mb-6">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
        <Search className="w-4 h-4" />
        Check Candidate Match
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        Search for a candidate to see why they do or don&apos;t match this requirement.
      </p>

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedCandidate(null); setDebugResult(null); }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Type a candidate name..."
          className="input w-full pr-8"
        />
        {(query || selectedCandidate) && (
          <button onClick={handleClear} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
        {searching && (
          <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
        )}

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && !selectedCandidate && (
          <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
            {suggestions.map((c) => (
              <button
                key={c.candidateId}
                onClick={() => handleSelect(c)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{c.fullName}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {c.totalExperience} yrs &middot; {c.seniority} &middot; {c.primarySkills.slice(0, 3).join(', ')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Analyzing match...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Results */}
      {debugResult && <MatchDebugPanel result={debugResult} />}

      {/* Shortlist Action */}
      {debugResult && selectedCandidate && (
        <ShortlistAction
          requirementId={requirementId}
          candidate={selectedCandidate}
          onShortlisted={onShortlisted}
          additionalFields={additionalFields}
          onCandidateUpdated={setSelectedCandidate}
        />
      )}
    </div>
  );
}

// ─── Requirement Search Variant ───────────────────────────────────────────────

interface CheckRequirementProps {
  candidateId: string;
  candidateName: string;
  candidateScreening?: {
    lastScreenedAt?: string;
    notInterested?: boolean;
    notInterestedAt?: string;
  };
}

export function CheckRequirementMatch({ candidateId, candidateName, candidateScreening }: CheckRequirementProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<RequirementSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<RequirementSummary | null>(null);
  const [debugResult, setDebugResult] = useState<MatchDebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [candidateForShortlist, setCandidateForShortlist] = useState<CandidateNameSearchResult | null>(null);

  const searchRequirements = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const res = await api.listRequirements({ search: q, status: 'active', limit: 8 });
      setSuggestions(res.requirements);
      setShowSuggestions(true);
    } catch { setSuggestions([]); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchRequirements(query), 300);
    return () => clearTimeout(timer);
  }, [query, searchRequirements]);

  const handleSelect = async (requirement: RequirementSummary) => {
    setSelectedRequirement(requirement);
    setQuery(requirement.clientName + (requirement.jobTitle ? ` - ${requirement.jobTitle}` : ''));
    setShowSuggestions(false);
    setSuggestions([]);
    setLoading(true);
    setError('');
    setCandidateForShortlist(null);
    try {
      const result = await api.matchDebug(candidateId, requirement.requirementId);
      setDebugResult(result);
      setCandidateForShortlist({
        candidateId: result.candidate.candidateId,
        fullName: result.candidate.fullName,
        primarySkills: result.candidate.primarySkills,
        totalExperience: result.candidate.totalExperience,
        seniority: result.candidate.seniority,
        location: result.candidate.location,
        lastUpdated: new Date().toISOString(),
        lastScreenedAt: candidateScreening?.lastScreenedAt,
        notInterested: candidateScreening?.notInterested,
        notInterestedAt: candidateScreening?.notInterestedAt,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to run match check');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSelectedRequirement(null);
    setDebugResult(null);
    setError('');
    setCandidateForShortlist(null);
    setSuggestions([]);
  };

  return (
    <div className="card p-6 mb-4">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
        <Search className="w-4 h-4" />
        Check Requirement Match
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        Search for a requirement to see why this candidate does or doesn&apos;t match it.
      </p>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedRequirement(null); setDebugResult(null); }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Type a client name, skill, or job title..."
          className="input w-full pr-8"
        />
        {(query || selectedRequirement) && (
          <button onClick={handleClear} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
        {searching && (
          <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
        )}

        {showSuggestions && suggestions.length > 0 && !selectedRequirement && (
          <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
            {suggestions.map((r) => (
              <button
                key={r.requirementId}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  {r.clientName}{r.endClient ? ` \u2192 ${r.endClient}` : ''}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {r.jobTitle || 'No title'} &middot; {r.coreSkill || 'No core skill'} &middot; {r.mustHaveSkills.slice(0, 3).join(', ')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Analyzing match...
        </div>
      )}

      {error && (
        <div className="mt-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {debugResult && <MatchDebugPanel result={debugResult} />}

      {debugResult && selectedRequirement && candidateForShortlist && (
        <ShortlistAction
          requirementId={selectedRequirement.requirementId}
          candidate={candidateForShortlist}
          additionalFields={selectedRequirement.additionalFields}
          onCandidateUpdated={setCandidateForShortlist}
        />
      )}
    </div>
  );
}

// ─── Shortlist Action ─────────────────────────────────────────────────────────

function ShortlistAction({
  requirementId,
  candidate,
  onShortlisted,
  additionalFields,
  onCandidateUpdated,
}: {
  requirementId: string;
  candidate: CandidateNameSearchResult;
  onShortlisted?: () => void;
  additionalFields?: AdditionalFieldDefinition[];
  onCandidateUpdated: (updated: CandidateNameSearchResult) => void;
}) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [confirmNotInterested, setConfirmNotInterested] = useState(false);
  const [showScreeningModal, setShowScreeningModal] = useState(false);

  const screeningStatus = getScreeningStatus(candidate.lastScreenedAt, candidate.notInterested);
  const screeningExpired = isScreeningExpired(candidate.lastScreenedAt);

  const handleScreeningComplete = useCallback((_candidateId: string, updatedValues?: Partial<CandidateSearchResult>) => {
    setShowScreeningModal(false);
    onCandidateUpdated({
      ...candidate,
      lastScreenedAt: new Date().toISOString(),
      notInterested: updatedValues?.notInterested ?? candidate.notInterested,
      notInterestedAt: updatedValues?.notInterestedAt ?? candidate.notInterestedAt,
    });
  }, [candidate, onCandidateUpdated]);

  const handleShortlist = async () => {
    setLoading(true);
    setError('');
    try {
      await api.shortlistCandidate(requirementId, candidate.candidateId, notes || undefined);
      setSuccess(true);
      onShortlisted?.();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_ERROR' && err.message.includes('already shortlisted')) {
          setSuccess(true);
          onShortlisted?.();
          return;
        }
        setError(err.message);
      } else {
        setError('Failed to shortlist candidate. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2">
        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
        <span className="text-sm font-medium text-green-700 dark:text-green-300">
          {candidate.fullName} has been shortlisted successfully.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
      {/* Screening status */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600 dark:text-gray-400">Screening Status</span>
        <span className={`badge text-xs ${screeningStatus.className}`}>{screeningStatus.label}</span>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Screening expired */}
      {screeningExpired ? (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Screening is required before this candidate can be shortlisted.
            {candidate.lastScreenedAt
              ? ' The previous screening has expired (>15 days).'
              : ' This candidate has not been screened yet.'}
          </p>
          <button
            onClick={() => setShowScreeningModal(true)}
            className="inline-block mt-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            Screen Candidate &rarr;
          </button>
        </div>
      ) : (
        <>
          {/* Not interested warning */}
          {candidate.notInterested && !confirmNotInterested ? (
            <div className="space-y-2">
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  This candidate is marked as Not Interested.
                </p>
              </div>
              <button
                onClick={() => setConfirmNotInterested(true)}
                className="w-full btn btn-outline border-amber-500 text-amber-700 hover:bg-amber-50 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-900/20 text-sm"
              >
                Shortlist Anyway?
              </button>
            </div>
          ) : (
            <>
              {/* Notes */}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Shortlist notes (optional)..."
                className="input w-full text-sm"
                rows={2}
                maxLength={1000}
              />

              {/* Shortlist button */}
              <button
                onClick={handleShortlist}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Shortlisting...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Shortlist Candidate
                  </>
                )}
              </button>
            </>
          )}
        </>
      )}

      {showScreeningModal && (
        <ScreeningModal
          candidateId={candidate.candidateId}
          candidateName={candidate.fullName}
          onClose={() => setShowScreeningModal(false)}
          onScreeningComplete={handleScreeningComplete}
          isShortlistFlow={true}
          additionalFields={additionalFields}
        />
      )}
    </div>
  );
}

// ─── Shared Debug Result Panel ────────────────────────────────────────────────

function MatchDebugPanel({ result }: { result: MatchDebugResponse }) {
  const [expanded, setExpanded] = useState(false);
  const { filters, score, wouldBeExcluded, excludedBy, matchDetails } = result;

  const scoreColor = wouldBeExcluded
    ? 'text-red-600 dark:text-red-400'
    : score >= 60 ? 'text-green-600 dark:text-green-400'
    : score >= 40 ? 'text-amber-600 dark:text-amber-400'
    : 'text-gray-600 dark:text-gray-400';

  return (
    <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Verdict header */}
      <div className={`px-4 py-3 flex items-center justify-between ${
        wouldBeExcluded
          ? 'bg-red-50 dark:bg-red-900/20'
          : 'bg-green-50 dark:bg-green-900/20'
      }`}>
        <div className="flex items-center gap-2">
          {wouldBeExcluded
            ? <XCircle className="w-5 h-5 text-red-500" />
            : <CheckCircle className="w-5 h-5 text-green-500" />
          }
          <span className={`font-semibold ${wouldBeExcluded ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
            {wouldBeExcluded ? 'No Match' : 'Match'}
          </span>
          {wouldBeExcluded && excludedBy.length > 0 && (
            <span className="text-sm text-red-600 dark:text-red-400">
              &mdash; excluded by: {excludedBy.join(', ')}
            </span>
          )}
        </div>
        <span className={`text-lg font-bold ${scoreColor}`}>{score}/100</span>
      </div>

      {/* Filter results */}
      <div className="px-4 py-3 space-y-2 border-b border-gray-200 dark:border-gray-700">
        <FilterRow label="Core Skill" filter={filters.coreSkill} />
        <FilterRow label="Must-Have Skills (≥40%)" filter={filters.mustHaveRatio}
          extra={filters.mustHaveRatio.ratio != null ? `${Math.round(filters.mustHaveRatio.ratio * 100)}%` : undefined} />
        <FilterRow label="Engagement Model" filter={filters.engagementModel} />
        <FilterRow label="Budget Fit" filter={filters.budgetFit} />
      </div>

      {/* Expandable details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
      >
        <span>Scoring Breakdown &amp; Skill Details</span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Score breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Score Breakdown</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <ScoreItem label="Must-Have Skills" value={matchDetails.mustHaveMatched.length} max={result.requirement.normalizedMustHave.length} maxScore={40} />
              <ScoreItem label="Good-to-Have" value={matchDetails.goodToHaveMatched.length} max={result.requirement.normalizedGoodToHave.length} maxScore={22} />
              <ScoreItem label="Role Match" value={matchDetails.roleMatch || 'partial'} maxScore={8} />
              <ScoreItem label="Experience" value={matchDetails.experienceMatch} maxScore={8} />
              <ScoreItem label="Seniority" value={matchDetails.seniorityMatch ? 'match' : 'none'} maxScore={5} />
              <ScoreItem label="Location" value={matchDetails.locationMatch} maxScore={10} />
              <ScoreItem label="Availability" value={matchDetails.availabilityMatch} maxScore={7} />
            </div>
          </div>

          {/* Skill comparison */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Must-Have Skills</h4>
            <div className="flex flex-wrap gap-1.5">
              {matchDetails.mustHaveMatched.map((s) => (
                <span key={s} className="badge bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{s}</span>
              ))}
              {(matchDetails.mustHaveFuzzy || []).map((s) => (
                <span key={s} className="badge bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">{s} (fuzzy)</span>
              ))}
              {matchDetails.mustHaveRelated.map((s) => (
                <span key={s} className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">{s} (related)</span>
              ))}
              {matchDetails.mustHaveMissing.map((s) => (
                <span key={s} className="badge bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{s}</span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Good-to-Have Skills</h4>
            <div className="flex flex-wrap gap-1.5">
              {matchDetails.goodToHaveMatched.map((s) => (
                <span key={s} className="badge bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{s}</span>
              ))}
              {(matchDetails.goodToHaveFuzzy || []).map((s) => (
                <span key={s} className="badge bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">{s} (fuzzy)</span>
              ))}
              {matchDetails.goodToHaveRelated.map((s) => (
                <span key={s} className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">{s} (related)</span>
              ))}
            </div>
          </div>

          {/* Candidate vs Requirement summary */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Candidate Profile</h4>
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <p><span className="text-gray-500 dark:text-gray-400">Primary Skills:</span> {result.candidate.normalizedPrimary.join(', ') || 'None'}</p>
              <p><span className="text-gray-500 dark:text-gray-400">Experience:</span> {result.candidate.totalExperience} years &middot; {result.candidate.seniority}</p>
              <p><span className="text-gray-500 dark:text-gray-400">Location:</span> {result.candidate.location || 'Not specified'}</p>
              <p><span className="text-gray-500 dark:text-gray-400">Availability:</span> {result.candidate.availability}</p>
              <p><span className="text-gray-500 dark:text-gray-400">Engagement:</span> {result.candidate.engagementModel}</p>
              {result.candidate.expectedCtc != null && (
                <p><span className="text-gray-500 dark:text-gray-400">Expected CTC:</span> {result.candidate.expectedCtc} LPA</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

function FilterRow({ label, filter, extra }: { label: string; filter: MatchDebugFilterResult; extra?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {filter.passed
        ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${filter.passed ? 'text-gray-700 dark:text-gray-300' : 'text-red-700 dark:text-red-300'}`}>
          {label}
        </span>
        {extra && (
          <span className={`ml-1.5 text-xs ${filter.passed ? 'text-gray-500' : 'text-red-500'}`}>({extra})</span>
        )}
        {filter.detail && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">{filter.detail}</p>
        )}
      </div>
    </div>
  );
}

function ScoreItem({ label, value, max, maxScore }: { label: string; value: string | number | boolean; max?: number; maxScore: number }) {
  let display: string;
  let earned: number;

  if (typeof value === 'number' && max != null) {
    const ratio = max > 0 ? value / max : 0;
    earned = Math.round(ratio * maxScore);
    display = `${value}/${max}`;
  } else if (typeof value === 'string') {
    if (value === 'full' || value === 'match') { earned = maxScore; display = 'Full'; }
    else if (value === 'partial') { earned = Math.round(maxScore * 0.5); display = 'Partial'; }
    else { earned = 0; display = 'None'; }
  } else {
    earned = 0;
    display = String(value);
  }

  const pct = maxScore > 0 ? (earned / maxScore) * 100 : 0;
  const barColor = pct >= 75 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400';

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{earned}/{maxScore}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{display}</div>
    </div>
  );
}
