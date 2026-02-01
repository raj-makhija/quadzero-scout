'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { api, ParsedCriteria, SearchCriteria, CandidateSearchResult } from '@/lib/api';
import { formatSeniority, formatAvailability, getMatchScoreColor, getMatchScoreBgColor, SENIORITY_OPTIONS, AVAILABILITY_OPTIONS } from '@/lib/utils';

type ViewMode = 'input' | 'criteria' | 'results';

export default function RecruiterSearchPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('input');
  const [jobDescription, setJobDescription] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [parsedCriteria, setParsedCriteria] = useState<ParsedCriteria | null>(null);
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<CandidateSearchResult[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateSearchResult | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleParseJD = async () => {
    if (!jobDescription.trim()) {
      setError('Please enter a job description');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await api.parseJobDescription(jobDescription, jobTitle || undefined);

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
      });

      setViewMode('criteria');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse job description');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.searchCandidates(searchCriteria);

      setResults(response.candidates);
      setTotalMatches(response.totalMatches);
      setViewMode('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const openCandidateDrawer = (candidate: CandidateSearchResult) => {
    setSelectedCandidate(candidate);
    setDrawerOpen(true);
  };

  const handleDownloadResume = async (candidateId: string) => {
    try {
      const { downloadUrl } = await api.getResumeUrl(candidateId);
      window.open(downloadUrl, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get resume');
    }
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
            Job Description
          </button>
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
                <label className="label">Job Title (Optional)</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g., Senior Full Stack Developer"
                  className="input mt-1"
                />
              </div>

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

                {/* Availability */}
                <div>
                  <label className="label">Availability</label>
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
        {viewMode === 'results' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Search Results</h2>
                <p className="text-gray-600 dark:text-gray-400">{totalMatches} candidates found</p>
              </div>
              <button onClick={() => setViewMode('criteria')} className="btn-secondary self-start sm:self-auto">
                Modify Search
              </button>
            </div>

            <div className="space-y-4">
              {results.map((candidate) => (
                <div
                  key={candidate.candidateId}
                  className="card p-6 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => openCandidateDrawer(candidate)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{candidate.fullName}</h3>
                        <span className={`badge ${getMatchScoreBgColor(candidate.matchScore)} ${getMatchScoreColor(candidate.matchScore)}`}>
                          {candidate.matchScore}% Match
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                        <span>{candidate.totalExperience} years exp</span>
                        <span>{formatSeniority(candidate.seniority)}</span>
                        {candidate.location && <span>{candidate.location}</span>}
                        <span>{formatAvailability(candidate.availability)}</span>
                      </div>

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

                      {candidate.matchDetails.mustHaveMissing.length > 0 && (
                        <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                          Missing: {candidate.matchDetails.mustHaveMissing.join(', ')}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadResume(candidate.candidateId);
                      }}
                      className="btn-outline text-sm self-start whitespace-nowrap"
                    >
                      Download Resume
                    </button>
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
            </div>
          </div>
        )}
      </main>

      {/* Candidate Detail Drawer */}
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
                    <label className="text-sm text-gray-500 dark:text-gray-400">Availability</label>
                    <p className="font-medium">{formatAvailability(selectedCandidate.availability)}</p>
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
                  </div>
                </div>

                {/* Actions */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex space-x-3">
                  <button
                    onClick={() => handleDownloadResume(selectedCandidate.candidateId)}
                    className="btn-primary flex-1"
                  >
                    Download Resume
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
