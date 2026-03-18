'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, ArrowLeft, Loader2, User, ChevronDown, ChevronUp, X, Filter, Plus, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Header } from '@/components/Header';
import { api, ApiError } from '@/lib/api';
import type { CandidateNameSearchResult, RecentProfileSummary, CandidateSearchResult, SearchCriteria } from '@/lib/api';
import { formatDate, formatSeniority, formatAvailability, formatCandidateEngagement, SENIORITY_OPTIONS, AVAILABILITY_OPTIONS, CANDIDATE_ENGAGEMENT_OPTIONS } from '@/lib/utils';
import { getScreeningStatus } from '@/components/screening-modal';

// Unified type for displaying profiles from different sources
type ProfileListItem = {
  candidateId: string;
  fullName: string;
  primarySkills: string[];
  totalExperience: number;
  seniority: string;
  location?: string;
  lastUpdated: string;
  lastScreenedAt?: string;
  roles?: string[];
};

const SCREENING_STATUS_OPTIONS = [
  { value: 'screened', label: 'Screened' },
  { value: 'expired', label: 'Expired' },
  { value: 'not_screened', label: 'Not Screened' },
];

function getScreeningStatusValue(lastScreenedAt?: string): string {
  if (!lastScreenedAt) return 'not_screened';
  const daysSince = (Date.now() - new Date(lastScreenedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 15 ? 'expired' : 'screened';
}

function mapRecentToListItem(p: RecentProfileSummary): ProfileListItem {
  return {
    candidateId: p.candidateId,
    fullName: p.fullName,
    primarySkills: p.primarySkills,
    totalExperience: p.totalExperience,
    seniority: p.seniority,
    location: p.location,
    lastUpdated: p.lastUpdated,
    lastScreenedAt: p.lastScreenedAt,
    roles: p.roles,
  };
}

function mapSearchResultToListItem(c: CandidateSearchResult): ProfileListItem {
  return {
    candidateId: c.candidateId,
    fullName: c.fullName,
    primarySkills: c.primarySkills,
    totalExperience: c.totalExperience,
    seniority: c.seniority,
    location: c.location,
    lastUpdated: c.lastUpdated,
    lastScreenedAt: c.lastScreenedAt,
    roles: c.roles,
  };
}

interface FilterState {
  minExperience?: number;
  maxExperience?: number;
  seniority: string[];
  skills: string[];
  location: string;
  availability: string[];
  engagementModel?: 'contract' | 'full_time' | 'either';
  screeningStatus: string[];
}

const EMPTY_FILTERS: FilterState = {
  seniority: [],
  skills: [],
  location: '',
  availability: [],
  screeningStatus: [],
};

function countActiveFilters(f: FilterState): number {
  let count = 0;
  if (f.minExperience != null) count++;
  if (f.maxExperience != null) count++;
  if (f.seniority.length > 0) count++;
  if (f.skills.length > 0) count++;
  if (f.location.trim()) count++;
  if (f.availability.length > 0) count++;
  if (f.engagementModel) count++;
  if (f.screeningStatus.length > 0) count++;
  return count;
}

function hasActiveFilters(f: FilterState): boolean {
  return countActiveFilters(f) > 0;
}

function getDateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildExportRows(profiles: ProfileListItem[]): string[][] {
  const headers = ['Name', 'Location', 'Experience (yrs)', 'Seniority', 'Primary Skills', 'Roles', 'Last Updated'];
  const rows = profiles.map(p => [
    p.fullName,
    p.location || '',
    String(p.totalExperience),
    formatSeniority(p.seniority),
    p.primarySkills.join(', '),
    (p.roles || []).join(', '),
    formatDate(p.lastUpdated),
  ]);
  return [headers, ...rows];
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function exportCsv(profiles: ProfileListItem[]) {
  const rows = buildExportRows(profiles);
  const csv = rows.map(row => row.map(escapeCsvField).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bench-report-${getDateStamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(profiles: ProfileListItem[]) {
  const rows = buildExportRows(profiles);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Auto-size columns
  ws['!cols'] = rows[0].map((_, i) => ({
    wch: Math.max(...rows.map(r => (r[i] || '').length), 10),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bench Report');
  XLSX.writeFile(wb, `bench-report-${getDateStamp()}.xlsx`);
}

export default function LocateProfilePage() {
  const router = useRouter();

  // Name search state
  const [query, setQuery] = useState('');
  const [nameResults, setNameResults] = useState<CandidateNameSearchResult[] | null>(null);
  const [suggestions, setSuggestions] = useState<CandidateNameSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Recent profiles state (default mode)
  const [recentProfiles, setRecentProfiles] = useState<ProfileListItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [recentPagination, setRecentPagination] = useState<{ hasMore: boolean; lastKey?: string }>({ hasMore: false });
  const [loadingMoreRecent, setLoadingMoreRecent] = useState(false);

  // Filter state
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ ...EMPTY_FILTERS });
  const [skillInput, setSkillInput] = useState('');

  // Filtered results state
  const [mode, setMode] = useState<'recent' | 'filtered' | 'nameSearch'>('recent');
  const [filteredResults, setFilteredResults] = useState<ProfileListItem[]>([]);
  const [loadingFiltered, setLoadingFiltered] = useState(false);
  const [filterPagination, setFilterPagination] = useState<{ hasMore: boolean; lastKey?: string }>({ hasMore: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const [errorMessage, setErrorMessage] = useState('');

  // Load recent profiles on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listRecentProfiles(50);
        if (!cancelled) {
          setRecentProfiles(res.profiles.map(mapRecentToListItem));
          setRecentPagination({
            hasMore: res.pagination?.hasMore ?? false,
            lastKey: res.pagination?.lastEvaluatedKey,
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load recent profiles:', err);
        }
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Close export menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const runNameSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setShowSuggestions(false);
    setSearching(true);
    setErrorMessage('');
    setMode('nameSearch');
    try {
      const res = await api.searchCandidatesByName(q);
      setNameResults(res.candidates);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Search failed. Please try again.');
      }
      setNameResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') runNameSearch();
    if (e.key === 'Escape') setShowSuggestions(false);
  };

  const handleSuggestionClick = (candidate: CandidateNameSearchResult) => {
    setShowSuggestions(false);
    router.push(`/recruiter/locate/${candidate.candidateId}`);
  };

  // Filter helpers
  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleArrayFilter = (key: 'seniority' | 'availability' | 'screeningStatus', value: string) => {
    setFilters(prev => {
      const current = prev[key];
      return {
        ...prev,
        [key]: current.includes(value) ? current.filter(v => v !== value) : [...current, value],
      };
    });
  };

  const addSkill = () => {
    const trimmed = skillInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!filters.skills.includes(trimmed)) {
      updateFilter('skills', [...filters.skills, trimmed]);
    }
    setSkillInput('');
  };

  const removeSkill = (skill: string) => {
    updateFilter('skills', filters.skills.filter(s => s !== skill));
  };

  const applyFilters = useCallback(async (existingResults?: ProfileListItem[], lastKey?: string) => {
    const isLoadMore = !!existingResults;
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoadingFiltered(true);
    }
    setErrorMessage('');
    setMode('filtered');
    setNameResults(null);

    try {
      const criteria: SearchCriteria = {};
      if (filters.skills.length > 0) criteria.mustHaveSkills = filters.skills;
      if (filters.minExperience != null) criteria.minExperience = filters.minExperience;
      if (filters.maxExperience != null) criteria.maxExperience = filters.maxExperience;
      if (filters.seniority.length > 0) criteria.seniority = filters.seniority;
      if (filters.availability.length > 0) criteria.availability = filters.availability;
      if (filters.location.trim()) criteria.location = filters.location.trim();
      if (filters.engagementModel) criteria.engagementModel = filters.engagementModel;

      const pagination = lastKey ? { limit: 20, lastEvaluatedKey: lastKey } : { limit: 20 };
      const res = await api.searchCandidates(criteria, pagination, 'lastUpdated');

      // Client-side hard filters (backend treats these as soft scoring factors)
      let candidates = res.candidates;
      if (filters.minExperience != null) {
        candidates = candidates.filter(c => c.totalExperience >= filters.minExperience!);
      }
      if (filters.maxExperience != null) {
        candidates = candidates.filter(c => c.totalExperience <= filters.maxExperience!);
      }
      if (filters.seniority.length > 0) {
        candidates = candidates.filter(c => filters.seniority.includes(c.seniority));
      }
      if (filters.availability.length > 0) {
        candidates = candidates.filter(c => filters.availability.includes(c.availability));
      }
      if (filters.location.trim()) {
        const searchLocs = filters.location.split(/[,;]/).map(l => l.trim().toLowerCase()).filter(Boolean);
        candidates = candidates.filter(c => {
          if (!c.location) return false;
          const candidateLoc = c.location.toLowerCase();
          return searchLocs.some(loc => candidateLoc.includes(loc));
        });
      }

      let items = candidates.map(mapSearchResultToListItem);

      // Client-side screening status filter
      if (filters.screeningStatus.length > 0) {
        items = items.filter(item => filters.screeningStatus.includes(getScreeningStatusValue(item.lastScreenedAt)));
      }

      if (isLoadMore && existingResults) {
        setFilteredResults([...existingResults, ...items]);
      } else {
        setFilteredResults(items);
      }
      setFilterPagination({
        hasMore: res.pagination.hasMore,
        lastKey: res.pagination.lastEvaluatedKey,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Filter search failed. Please try again.');
      }
      if (!isLoadMore) setFilteredResults([]);
    } finally {
      setLoadingFiltered(false);
      setLoadingMore(false);
    }
  }, [filters]);

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setMode('recent');
    setFilteredResults([]);
    setFilterPagination({ hasMore: false });
    setNameResults(null);
    setQuery('');
    setErrorMessage('');
  };

  const loadMoreRecent = useCallback(async () => {
    if (!recentPagination.lastKey || loadingMoreRecent) return;
    setLoadingMoreRecent(true);
    try {
      const res = await api.listRecentProfiles(50, recentPagination.lastKey);
      setRecentProfiles(prev => [...prev, ...res.profiles.map(mapRecentToListItem)]);
      setRecentPagination({
        hasMore: res.pagination?.hasMore ?? false,
        lastKey: res.pagination?.lastEvaluatedKey,
      });
    } catch (err) {
      console.error('Failed to load more profiles:', err);
    } finally {
      setLoadingMoreRecent(false);
    }
  }, [recentPagination.lastKey, loadingMoreRecent]);

  const clearNameSearch = () => {
    setQuery('');
    setNameResults(null);
    setMode(hasActiveFilters(filters) ? 'filtered' : 'recent');
  };

  const activeFilterCount = countActiveFilters(filters);

  // Determine which profiles to show
  const displayProfiles = mode === 'nameSearch' ? null : mode === 'filtered' ? filteredResults : recentProfiles;
  const isLoading = mode === 'recent' ? loadingRecent : loadingFiltered;

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
        <p className="text-gray-500 dark:text-gray-400 mb-6">Search for a candidate by name or use filters to browse profiles</p>

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
              onClick={runNameSearch}
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

        {/* Filter toggle */}
        <div className="mt-4">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-primary-600 rounded-full">
                {activeFilterCount}
              </span>
            )}
            {filtersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Filter panel */}
          {filtersExpanded && (
            <div className="mt-3 card p-5 space-y-5">
              {/* Experience */}
              <div>
                <label className="label">Experience (Years)</label>
                <div className="mt-2 flex items-center space-x-2">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={filters.minExperience ?? ''}
                    onChange={(e) => updateFilter('minExperience', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Min"
                    className="input w-24"
                  />
                  <span className="text-gray-500 dark:text-gray-400">to</span>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={filters.maxExperience ?? ''}
                    onChange={(e) => updateFilter('maxExperience', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Max"
                    className="input w-24"
                  />
                </div>
              </div>

              {/* Seniority */}
              <div>
                <label className="label">Seniority Level</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SENIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => toggleArrayFilter('seniority', opt.value)}
                      className={`badge cursor-pointer ${
                        filters.seniority.includes(opt.value)
                          ? 'bg-primary-100 text-primary-800 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600'
                          : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="label">Skills</label>
                {filters.skills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {filters.skills.map((skill) => (
                      <span key={skill} className="badge-primary flex items-center">
                        {skill}
                        <button onClick={() => removeSkill(skill)} className="ml-1">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                    placeholder="Add a skill and press Enter"
                    className="input flex-1"
                  />
                  <button
                    onClick={addSkill}
                    disabled={!skillInput.trim()}
                    className="btn-secondary px-3 py-2 disabled:opacity-50"
                    type="button"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="label">Location</label>
                <input
                  type="text"
                  value={filters.location}
                  onChange={(e) => updateFilter('location', e.target.value)}
                  placeholder="e.g., Bangalore, Mumbai"
                  className="input mt-2 w-full"
                />
                <p className="mt-1 text-xs text-gray-400">Separate multiple locations with commas</p>
              </div>

              {/* Availability */}
              <div>
                <label className="label">Availability / Notice Period</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {AVAILABILITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => toggleArrayFilter('availability', opt.value)}
                      className={`badge cursor-pointer ${
                        filters.availability.includes(opt.value)
                          ? 'bg-primary-100 text-primary-800 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600'
                          : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Engagement Model */}
              <div>
                <label className="label">Engagement Model</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CANDIDATE_ENGAGEMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateFilter('engagementModel', filters.engagementModel === opt.value ? undefined : opt.value as FilterState['engagementModel'])}
                      className={`badge cursor-pointer ${
                        filters.engagementModel === opt.value
                          ? 'bg-primary-100 text-primary-800 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600'
                          : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Screening Status */}
              <div>
                <label className="label">Screening Status</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SCREENING_STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => toggleArrayFilter('screeningStatus', opt.value)}
                      className={`badge cursor-pointer ${
                        filters.screeningStatus.includes(opt.value)
                          ? 'bg-primary-100 text-primary-800 border border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-600'
                          : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter actions */}
              <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => applyFilters()}
                  disabled={loadingFiltered}
                  className="btn-primary flex items-center gap-2 px-5"
                >
                  {loadingFiltered ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
                  Apply Filters
                </button>
                <button
                  onClick={clearFilters}
                  className="btn-secondary px-4"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active filters summary (when panel is collapsed) */}
        {!filtersExpanded && activeFilterCount > 0 && mode === 'filtered' && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Showing filtered results ({activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active)</span>
            <button onClick={clearFilters} className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline">
              Clear
            </button>
          </div>
        )}

        {/* Error */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Name search results */}
        {mode === 'nameSearch' && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {nameResults === null ? '' : `${nameResults.length} candidate${nameResults.length !== 1 ? 's' : ''} found for "${query}"`}
              </p>
              <button onClick={clearNameSearch} className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 underline">
                Clear search
              </button>
            </div>
            {nameResults !== null && nameResults.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No candidates found</p>
                <p className="text-sm mt-1">Try a different name or partial name</p>
              </div>
            ) : (
              <div className="space-y-3">
                {nameResults?.map((c) => (
                  <CandidateCard key={c.candidateId} candidate={c} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Profile listing (recent or filtered) */}
        {mode !== 'nameSearch' && (
          <div className="mt-6">
            {/* Header with export */}
            {!isLoading && displayProfiles && displayProfiles.length > 0 && (
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {mode === 'recent'
                    ? `Recently updated profiles (${displayProfiles.length})`
                    : `${displayProfiles.length} candidate${displayProfiles.length !== 1 ? 's' : ''} match your filters`}
                </p>
                <div className="relative" ref={exportMenuRef}>
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="btn-secondary flex items-center gap-1.5 text-sm px-3 py-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Export
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                      <button
                        onClick={() => { exportCsv(displayProfiles); setShowExportMenu(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
                      >
                        Export as CSV
                      </button>
                      <button
                        onClick={() => { exportExcel(displayProfiles); setShowExportMenu(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-b-lg"
                      >
                        Export as Excel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Loading skeleton */}
            {isLoading && (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="card p-5 animate-pulse">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                        <div className="flex gap-2">
                          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-14" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && displayProfiles && displayProfiles.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
                {mode === 'filtered' ? (
                  <>
                    <p className="font-medium">No candidates match your filters</p>
                    <p className="text-sm mt-1">Try broadening your search criteria</p>
                    <button onClick={clearFilters} className="mt-3 btn-secondary text-sm px-4">
                      Clear Filters
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-medium">No profiles yet</p>
                    <p className="text-sm mt-1">Candidate profiles will appear here once created</p>
                  </>
                )}
              </div>
            )}

            {/* Profile cards */}
            {!isLoading && displayProfiles && displayProfiles.length > 0 && (
              <div className="space-y-3">
                {displayProfiles.map((p) => (
                  <CandidateCard key={p.candidateId} candidate={p} />
                ))}
              </div>
            )}

            {/* Load more (recent mode) */}
            {mode === 'recent' && recentPagination.hasMore && !isLoading && (
              <div className="mt-4 text-center">
                <button
                  onClick={loadMoreRecent}
                  disabled={loadingMoreRecent}
                  className="btn-secondary px-6"
                >
                  {loadingMoreRecent ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}

            {/* Load more (filtered mode) */}
            {mode === 'filtered' && filterPagination.hasMore && !isLoading && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => applyFilters(filteredResults, filterPagination.lastKey)}
                  disabled={loadingMore}
                  className="btn-secondary px-6"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: ProfileListItem }) {
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
