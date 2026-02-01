'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, CandidateProfile } from '@/lib/api';
import { formatSeniority, formatAvailability, formatDate } from '@/lib/utils';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { ProfileCardSkeleton } from '@/components/skeletons';
import { NoProfileFound, ErrorState } from '@/components/EmptyState';
import { ProfileCompleteness } from '@/components/ProfileCompleteness';

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const candidateId = sessionStorage.getItem('candidateId');

      if (!candidateId) {
        router.push('/candidate/upload');
        return;
      }

      try {
        const data = await api.getProfile(candidateId);
        setProfile(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [router]);

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Availability</p>
              </div>
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

      <BottomNav />
    </div>
  );
}
