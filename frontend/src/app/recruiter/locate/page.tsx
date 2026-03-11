'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, ArrowLeft, Loader2, User } from 'lucide-react';
import { Header } from '@/components/Header';
import { api, ApiError } from '@/lib/api';
import type { CandidateNameSearchResult } from '@/lib/api';
import { formatDate, formatSeniority } from '@/lib/utils';
import { getScreeningStatus } from '@/components/screening-modal';

export default function LocateProfilePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CandidateNameSearchResult[] | null>(null);
  const [suggestions, setSuggestions] = useState<CandidateNameSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Typeahead
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await api.searchCandidatesByName(query.trim(), 10);
        setSuggestions(res.candidates);
        setShowSuggestions(res.candidates.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setShowSuggestions(false);
    setSearching(true);
    setErrorMessage('');
    try {
      const res = await api.searchCandidatesByName(q);
      setResults(res.candidates);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Search failed. Please try again.');
      }
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') runSearch();
    if (e.key === 'Escape') setShowSuggestions(false);
  };

  const handleSuggestionClick = (candidate: CandidateNameSearchResult) => {
    setShowSuggestions(false);
    router.push(`/recruiter/locate/${candidate.candidateId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Locate Profile</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">Search for a candidate by name</p>

        {/* Search bar */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Type a name to search..."
                className="input pl-9 w-full"
                autoComplete="off"
              />
              {loadingSuggestions && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
              )}
            </div>
            <button
              onClick={runSearch}
              disabled={searching || query.trim().length < 2}
              className="btn-primary flex items-center gap-2 px-5"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>

          {/* Typeahead dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.candidateId}
                  onMouseDown={() => handleSuggestionClick(s)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.fullName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {s.totalExperience} yrs &middot; {formatSeniority(s.seniority)}
                      {s.location && ` · ${s.location}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {query.trim().length > 0 && query.trim().length < 2 && (
          <p className="mt-2 text-sm text-gray-400">Enter at least 2 characters to search</p>
        )}

        {/* Error */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Results */}
        {results !== null && (
          <div className="mt-6">
            {results.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No candidates found</p>
                <p className="text-sm mt-1">Try a different name or partial name</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  {results.length} candidate{results.length !== 1 ? 's' : ''} found
                </p>
                <div className="space-y-3">
                  {results.map((c) => (
                    <CandidateCard key={c.candidateId} candidate={c} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: CandidateNameSearchResult }) {
  const screeningStatus = getScreeningStatus(candidate.lastScreenedAt);

  return (
    <Link
      href={`/recruiter/locate/${candidate.candidateId}`}
      className="card p-5 flex items-start gap-4 hover:shadow-md transition-shadow"
    >
      <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
        <User className="w-5 h-5 text-primary-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{candidate.fullName}</span>
          <span className={`badge text-xs ${screeningStatus.className}`}>{screeningStatus.label}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-500 dark:text-gray-400 mb-2">
          <span>{candidate.totalExperience} yrs exp</span>
          <span>{formatSeniority(candidate.seniority)}</span>
          {candidate.location && <span>{candidate.location}</span>}
          <span>Updated {formatDate(candidate.lastUpdated)}</span>
        </div>
        {candidate.primarySkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {candidate.primarySkills.slice(0, 5).map((skill) => (
              <span
                key={skill}
                className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs"
              >
                {skill}
              </span>
            ))}
            {candidate.primarySkills.length > 5 && (
              <span className="text-xs text-gray-400 dark:text-gray-500 self-center">
                +{candidate.primarySkills.length - 5} more
              </span>
            )}
          </div>
        )}
      </div>
      <div className="text-gray-400 dark:text-gray-500 self-center ml-2">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
