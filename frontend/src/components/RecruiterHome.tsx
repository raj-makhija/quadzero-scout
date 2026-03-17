'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Upload,
  Search,
  UserSearch,
  FileText,
  Users,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { RequirementSummary, RecentProfileSummary } from '@/lib/api';
import { formatRelativeTime, formatSeniority } from '@/lib/utils';

interface RecruiterHomeProps {
  userName?: string | null;
}

export function RecruiterHome({ userName }: RecruiterHomeProps) {
  const firstName = userName?.split(' ')[0] || 'there';

  const [requirements, setRequirements] = useState<RequirementSummary[]>([]);
  const [profiles, setProfiles] = useState<RecentProfileSummary[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [errorReqs, setErrorReqs] = useState<string | null>(null);
  const [errorProfiles, setErrorProfiles] = useState<string | null>(null);

  useEffect(() => {
    const fetchRequirements = async () => {
      try {
        const data = await api.listRecentRequirements(10, 'active');
        setRequirements(data.requirements);
      } catch {
        setErrorReqs('Failed to load requirements');
      } finally {
        setLoadingReqs(false);
      }
    };

    const fetchProfiles = async () => {
      try {
        const data = await api.listRecentProfiles(10);
        setProfiles(data.profiles);
      } catch {
        setErrorProfiles('Failed to load profiles');
      } finally {
        setLoadingProfiles(false);
      }
    };

    fetchRequirements();
    fetchProfiles();
  }, []);

  return (
    <div>
      {/* Welcome */}
      <div className="text-center">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 sm:text-4xl">
          Welcome back, {firstName}
        </h1>
        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
          What would you like to do today?
        </p>
      </div>

      {/* Quick Action Cards */}
      <div className="mt-10 max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Link
          href="/candidate/upload"
          className="card p-8 text-left hover:shadow-md transition-shadow group"
        >
          <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
            <Upload className="w-6 h-6 text-primary-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Upload a Resume
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Add a candidate profile with AI-powered extraction
          </p>
        </Link>

        <Link
          href="/recruiter/search"
          className="card p-8 text-left hover:shadow-md transition-shadow group"
        >
          <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
            <Search className="w-6 h-6 text-primary-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Search by JD
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Paste a job description to find matching candidates
          </p>
        </Link>

        <Link
          href="/recruiter/locate"
          className="card p-8 text-left hover:shadow-md transition-shadow group"
        >
          <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
            <UserSearch className="w-6 h-6 text-primary-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Locate Profile
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Find a specific candidate by name
          </p>
        </Link>
      </div>

      {/* Latest Requirements & Profiles */}
      <div className="mt-12 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Latest Requirements */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-600" />
              Latest Requirements
            </h2>
            <Link
              href="/recruiter/requirements"
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
            >
              View All
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="card divide-y divide-gray-100 dark:divide-gray-700">
            {loadingReqs ? (
              <SkeletonList count={5} />
            ) : errorReqs ? (
              <div className="p-4 text-sm text-red-600 dark:text-red-400">
                {errorReqs}
              </div>
            ) : requirements.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No requirements yet
              </div>
            ) : (
              requirements.map((req) => (
                <Link
                  key={req.requirementId}
                  href={`/recruiter/requirements/${req.requirementId}`}
                  className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            req.status === 'active'
                              ? 'bg-green-500'
                              : 'bg-gray-400'
                          }`}
                        />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {req.jobTitle || 'Untitled'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                        {req.clientName}
                        {req.endClient ? ` / ${req.endClient}` : ''}
                      </p>
                      {req.mustHaveSkills.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {req.mustHaveSkills.slice(0, 3).map((skill) => (
                            <span
                              key={skill}
                              className="inline-block px-1.5 py-0.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded"
                            >
                              {skill}
                            </span>
                          ))}
                          {req.mustHaveSkills.length > 3 && (
                            <span className="text-xs text-gray-400">
                              +{req.mustHaveSkills.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      {req.roles && req.roles.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {req.roles.slice(0, 2).map((role) => (
                            <span
                              key={role}
                              className="inline-block px-1.5 py-0.5 text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded"
                            >
                              {role}
                            </span>
                          ))}
                          {req.roles.length > 2 && (
                            <span className="text-xs text-gray-400">
                              +{req.roles.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
                      {formatRelativeTime(req.createdAt)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Latest Profiles */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary-600" />
              Latest Profiles
            </h2>
            <Link
              href="/recruiter/locate"
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
            >
              View All
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="card divide-y divide-gray-100 dark:divide-gray-700">
            {loadingProfiles ? (
              <SkeletonList count={5} />
            ) : errorProfiles ? (
              <div className="p-4 text-sm text-red-600 dark:text-red-400">
                {errorProfiles}
              </div>
            ) : profiles.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No profiles yet
              </div>
            ) : (
              profiles.map((profile) => (
                <Link
                  key={profile.candidateId}
                  href={`/recruiter/locate/${profile.candidateId}`}
                  className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate block">
                        {profile.fullName}
                      </span>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatSeniority(profile.seniority)} ·{' '}
                        {profile.totalExperience} yrs
                        {profile.location ? ` · ${profile.location}` : ''}
                      </p>
                      {profile.primarySkills.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {profile.primarySkills.slice(0, 3).map((skill) => (
                            <span
                              key={skill}
                              className="inline-block px-1.5 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded"
                            >
                              {skill}
                            </span>
                          ))}
                          {profile.primarySkills.length > 3 && (
                            <span className="text-xs text-gray-400">
                              +{profile.primarySkills.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
                      {formatRelativeTime(profile.lastUpdated)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 animate-pulse">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              <div className="flex gap-1">
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-12" />
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-14" />
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-10" />
              </div>
            </div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          </div>
        </div>
      ))}
    </>
  );
}
