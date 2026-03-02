'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { api, ApiError, CandidateProfile, MatchedRequirement, RequirementDetail } from '@/lib/api';
import {
  formatSeniority,
  formatAvailability,
  formatCandidateEngagement,
  formatDate,
  formatEngagementModel,
  formatPayroll,
  getMatchScoreColor,
  getMatchScoreBgColor,
} from '@/lib/utils';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { ProfileCardSkeleton } from '@/components/skeletons';
import { NoProfileFound, ErrorState } from '@/components/EmptyState';
import { ProfileCompleteness } from '@/components/ProfileCompleteness';
import { ScreeningModal } from '@/components/screening-modal';

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const isAuthenticated = authStatus === 'authenticated';

  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Matching requirements state
  const [matches, setMatches] = useState<MatchedRequirement[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<RequirementDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Shortlist loading state (per requirement ID)
  const [shortlistLoading, setShortlistLoading] = useState<Record<string, boolean>>({});

  // Screening modal state
  const [screeningCandidateId, setScreeningCandidateId] = useState<string | null>(null);
  const [pendingShortlistRequirementId, setPendingShortlistRequirementId] = useState<string | null>(null);
  const [shortlistError, setShortlistError] = useState<string | null>(null);

  const candidateId = typeof window !== 'undefined' ? sessionStorage.getItem('candidateId') : null;

  useEffect(() => {
    const fetchProfile = async () => {
      const storedCandidateId = sessionStorage.getItem('candidateId');

      if (!storedCandidateId) {
        router.push('/candidate/upload');
        return;
      }

      try {
        const data = await api.getProfile(storedCandidateId);
        setProfile(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [router]);

  // Fetch matching requirements once profile loads and user is authenticated
  useEffect(() => {
    if (!isAuthenticated || !candidateId || !profile) return;

    const fetchMatches = async () => {
      setMatchesLoading(true);
      setMatchesError(null);
      try {
        const data = await api.matchRequirements(candidateId);
        setMatches(data.matches);
      } catch (err) {
        setMatchesError(err instanceof Error ? err.message : 'Failed to load matching requirements');
      } finally {
        setMatchesLoading(false);
      }
    };

    fetchMatches();
  }, [isAuthenticated, candidateId, profile]);

  const handleViewJd = useCallback(async (requirementId: string) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setSelectedRequirement(null);
    try {
      const detail = await api.getRequirement(requirementId);
      setSelectedRequirement(detail);
    } catch {
      // If fetching fails, close the drawer
      setDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const handleShortlistToggle = useCallback(async (requirementId: string, isCurrentlyShortlisted: boolean) => {
    if (!candidateId) return;

    setShortlistError(null);
    setShortlistLoading((prev) => ({ ...prev, [requirementId]: true }));

    // Optimistic update
    setMatches((prev) =>
      prev.map((m) =>
        m.requirementId === requirementId ? { ...m, isShortlisted: !isCurrentlyShortlisted } : m
      )
    );

    try {
      if (isCurrentlyShortlisted) {
        await api.removeShortlist(requirementId, candidateId);
      } else {
        await api.shortlistCandidate(requirementId, candidateId);
      }
    } catch (err) {
      // Revert optimistic update
      setMatches((prev) =>
        prev.map((m) =>
          m.requirementId === requirementId ? { ...m, isShortlisted: isCurrentlyShortlisted } : m
        )
      );

      // If screening is required, open screening modal and queue the shortlist
      if (err instanceof ApiError && err.code === 'SCREENING_REQUIRED') {
        setPendingShortlistRequirementId(requirementId);
        setScreeningCandidateId(candidateId);
      } else {
        setShortlistError(err instanceof Error ? err.message : 'Failed to shortlist candidate');
      }
    } finally {
      setShortlistLoading((prev) => ({ ...prev, [requirementId]: false }));
    }
  }, [candidateId]);

  const handleScreeningComplete = useCallback(async (_candidateId: string) => {
    setScreeningCandidateId(null);
    const reqId = pendingShortlistRequirementId;
    setPendingShortlistRequirementId(null);

    // After screening, automatically retry the shortlist
    if (reqId && candidateId) {
      handleShortlistToggle(reqId, false);
    }
  }, [pendingShortlistRequirementId, candidateId, handleShortlistToggle]);

  if (loading) {
    return <ProfileCardSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <NoProfileFound />
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 md:pb-0">
      <Header>
        <span className="text-sm text-gray-500 dark:text-gray-400">Step 3 of 3: Profile Complete</span>
      </Header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Success Banner */}
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Your profile has been saved successfully!
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Recruiters can now discover your profile when searching for candidates.
          </p>
        </div>

        {/* Profile Completeness */}
        <ProfileCompleteness profile={profile} className="mb-6" />

        {/* Profile Card */}
        <div className="card overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-8 text-white">
            <h1 className="text-2xl font-bold">{profile.fullName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-primary-100">
              {profile.email && (
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {profile.email}
                </span>
              )}
              {profile.location && (
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {profile.location}
                </span>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{profile.totalExperience}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Years Experience</p>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatSeniority(profile.seniority)}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Seniority Level</p>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatAvailability(profile.availability || 'negotiable')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Notice Period</p>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCandidateEngagement(profile.engagementModel || 'either')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Engagement Model</p>
              </div>
              {profile.currentCtc != null && (
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{profile.currentCtc} LPA</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Current CTC</p>
                </div>
              )}
              {profile.expectedCtc != null && (
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{profile.expectedCtc} LPA</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Expected CTC</p>
                </div>
              )}
            </div>

            {/* Primary Skills */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Primary Skills</h2>
              <div className="flex flex-wrap gap-2">
                {profile.primarySkills.map((skill) => (
                  <span key={skill} className="badge-primary">
                    {skill}
                    {profile.primarySkillYears[skill] && (
                      <span className="ml-1 text-primary-600 dark:text-primary-300">
                        ({profile.primarySkillYears[skill]}y)
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* Secondary Skills */}
            {profile.secondarySkills && profile.secondarySkills.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Secondary Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.secondarySkills.map((skill) => (
                    <span key={skill} className="badge-secondary">{skill}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            {profile.summary && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Summary</h2>
                <p className="text-gray-600 dark:text-gray-400">{profile.summary}</p>
              </div>
            )}

            {/* Industries & Roles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {profile.industries && profile.industries.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Industries</h2>
                  <ul className="space-y-1">
                    {profile.industries.map((industry) => (
                      <li key={industry} className="text-gray-600 dark:text-gray-400 flex items-center">
                        <svg className="w-4 h-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {industry}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.roles && profile.roles.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Roles</h2>
                  <ul className="space-y-1">
                    {profile.roles.map((role) => (
                      <li key={role} className="text-gray-600 dark:text-gray-400 flex items-center">
                        <svg className="w-4 h-4 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {role}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
              <p>Profile ID: {profile.candidateId}</p>
              {profile.lastUpdated && <p>Last updated: {formatDate(profile.lastUpdated)}</p>}
            </div>
          </div>
        </div>

        {/* Matching Requirements Section (authenticated users only) */}
        {isAuthenticated && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Matching Requirements
            </h2>

            {shortlistError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
                <p className="text-sm text-red-600 dark:text-red-400">{shortlistError}</p>
                <button onClick={() => setShortlistError(null)} className="text-red-400 hover:text-red-600 ml-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {matchesLoading && (
              <div className="card p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto" />
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  Scanning open requirements for matches...
                </p>
              </div>
            )}

            {matchesError && (
              <div className="card p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{matchesError}</p>
              </div>
            )}

            {!matchesLoading && !matchesError && matches.length === 0 && (
              <div className="card p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No matching requirements found</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  There are no open requirements that match this candidate&apos;s skills right now.
                </p>
              </div>
            )}

            {!matchesLoading && matches.length > 0 && (
              <div className="space-y-4">
                {matches.map((match) => (
                  <div key={match.requirementId} className="card p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Title row with score badge */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {match.jobTitle || 'Untitled Requirement'}
                          </h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold ${getMatchScoreBgColor(match.matchScore)} ${getMatchScoreColor(match.matchScore)}`}>
                            {match.matchScore}%
                          </span>
                          {/* Budget Fit Badge */}
                          {match.budgetMaxLpa != null && profile.expectedCtc != null ? (
                            match.matchDetails.budgetFit ? (
                              <span className="badge bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">
                                Within Budget
                              </span>
                            ) : (
                              <span className="badge bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs">
                                Over Budget
                              </span>
                            )
                          ) : (
                            <span className="badge bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 text-xs">
                              Budget N/A
                            </span>
                          )}
                        </div>

                        {/* Client info row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{match.clientName}</span>
                          {match.endClient && <span>End Client: {match.endClient}</span>}
                          <span>{formatEngagementModel(match.engagementModel)}</span>
                          <span>Payroll: {formatPayroll(match.payroll)}</span>
                          {(match.budgetMinLpa != null || match.budgetMaxLpa != null) && (
                            <span>
                              Budget: {match.budgetMinLpa ?? '0'} - {match.budgetMaxLpa ?? '∞'} LPA
                            </span>
                          )}
                        </div>

                        {/* Skill match details */}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {match.matchDetails.mustHaveMatched.map((skill) => (
                            <span key={skill} className="badge bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">
                              {skill}
                            </span>
                          ))}
                          {match.matchDetails.mustHaveRelated?.map((skill) => (
                            <span key={`related-${skill}`} className="badge bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs">
                              ~{skill}
                            </span>
                          ))}
                          {match.matchDetails.mustHaveMissing.map((skill) => (
                            <span key={skill} className="badge bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs line-through">
                              {skill}
                            </span>
                          ))}
                          {match.matchDetails.goodToHaveMatched.map((skill) => (
                            <span key={skill} className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs">
                              {skill}
                            </span>
                          ))}
                          {match.matchDetails.goodToHaveRelated?.map((skill) => (
                            <span key={`gtr-${skill}`} className="badge bg-blue-50 text-blue-500 dark:bg-blue-900/15 dark:text-blue-400 text-xs">
                              ~{skill}
                            </span>
                          ))}
                        </div>

                        {/* Match indicators */}
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span className={match.matchDetails.experienceMatch ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                            {match.matchDetails.experienceMatch ? 'Exp match' : 'Exp mismatch'}
                          </span>
                          <span className={match.matchDetails.seniorityMatch ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                            {match.matchDetails.seniorityMatch ? 'Seniority match' : 'Seniority mismatch'}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex sm:flex-col gap-2 shrink-0">
                        <button
                          onClick={() => handleViewJd(match.requirementId)}
                          className="btn-secondary text-sm"
                        >
                          View JD
                        </button>
                        <button
                          onClick={() => handleShortlistToggle(match.requirementId, match.isShortlisted)}
                          disabled={shortlistLoading[match.requirementId]}
                          className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
                            match.isShortlisted
                              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 border border-primary-300 dark:border-primary-700'
                              : 'btn-primary'
                          }`}
                        >
                          {shortlistLoading[match.requirementId]
                            ? '...'
                            : match.isShortlisted
                            ? 'Shortlisted'
                            : 'Shortlist'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-4">
          <Link href="/candidate/upload" className="btn-secondary">
            Upload New Resume
          </Link>
          <Link href="/" className="btn-primary">
            Back to Home
          </Link>
        </div>
      </main>

      {/* Requirement Detail Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {drawerLoading ? 'Loading...' : selectedRequirement?.jobTitle || 'Requirement Details'}
                </h2>
                <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {drawerLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
                </div>
              )}

              {!drawerLoading && selectedRequirement && (
                <div className="space-y-6">
                  {/* Client Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400">Client</label>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{selectedRequirement.clientName}</p>
                    </div>
                    {selectedRequirement.endClient && (
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400">End Client</label>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{selectedRequirement.endClient}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400">Engagement</label>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{formatEngagementModel(selectedRequirement.engagementModel)}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400">Payroll</label>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{formatPayroll(selectedRequirement.payroll)}</p>
                    </div>
                    {(selectedRequirement.budgetMinLpa != null || selectedRequirement.budgetMaxLpa != null) && (
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400">Budget Range</label>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {selectedRequirement.budgetMinLpa ?? '0'} - {selectedRequirement.budgetMaxLpa ?? '∞'} LPA
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400">Posted</label>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(selectedRequirement.createdAt)}</p>
                    </div>
                  </div>

                  {/* Parsed Criteria */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Criteria</h3>

                    {selectedRequirement.parsedCriteria.mustHaveSkills.length > 0 && (
                      <div className="mb-3">
                        <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Must-Have Skills</label>
                        <div className="flex flex-wrap gap-1">
                          {selectedRequirement.parsedCriteria.mustHaveSkills.map((skill) => (
                            <span key={skill} className="badge bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-xs">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedRequirement.parsedCriteria.goodToHaveSkills.length > 0 && (
                      <div className="mb-3">
                        <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Good-to-Have Skills</label>
                        <div className="flex flex-wrap gap-1">
                          {selectedRequirement.parsedCriteria.goodToHaveSkills.map((skill) => (
                            <span key={skill} className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {(selectedRequirement.parsedCriteria.minExperience != null || selectedRequirement.parsedCriteria.maxExperience != null) && (
                        <div>
                          <label className="text-gray-500 dark:text-gray-400">Experience</label>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {selectedRequirement.parsedCriteria.minExperience ?? 0} - {selectedRequirement.parsedCriteria.maxExperience ?? '∞'} years
                          </p>
                        </div>
                      )}
                      {selectedRequirement.parsedCriteria.seniority.length > 0 && (
                        <div>
                          <label className="text-gray-500 dark:text-gray-400">Seniority</label>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {selectedRequirement.parsedCriteria.seniority.map(formatSeniority).join(', ')}
                          </p>
                        </div>
                      )}
                      {selectedRequirement.parsedCriteria.location && (
                        <div>
                          <label className="text-gray-500 dark:text-gray-400">Location</label>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{selectedRequirement.parsedCriteria.location}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Full JD Text */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Job Description</h3>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                      {selectedRequirement.jdText}
                    </div>
                  </div>

                  {/* Drawer footer with shortlist button */}
                  {candidateId && (() => {
                    const match = matches.find((m) => m.requirementId === selectedRequirement.requirementId);
                    if (!match) return null;
                    return (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <button
                          onClick={() => handleShortlistToggle(match.requirementId, match.isShortlisted)}
                          disabled={shortlistLoading[match.requirementId]}
                          className={`w-full py-3 rounded-lg font-medium transition-colors ${
                            match.isShortlisted
                              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 border border-primary-300 dark:border-primary-700'
                              : 'btn-primary'
                          }`}
                        >
                          {shortlistLoading[match.requirementId]
                            ? 'Updating...'
                            : match.isShortlisted
                            ? 'Shortlisted — Click to Remove'
                            : 'Shortlist Candidate'}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Screening Modal */}
      {screeningCandidateId && (
        <ScreeningModal
          candidateId={screeningCandidateId}
          candidateName={profile?.fullName || 'Candidate'}
          onClose={() => {
            setScreeningCandidateId(null);
            setPendingShortlistRequirementId(null);
          }}
          onScreeningComplete={handleScreeningComplete}
        />
      )}

      <BottomNav />
    </div>
  );
}
