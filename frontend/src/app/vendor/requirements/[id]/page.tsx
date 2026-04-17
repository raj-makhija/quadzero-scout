'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Briefcase, Clock, Mail, CheckCircle2, Star } from 'lucide-react';
import { api, PublicRequirementSummary } from '@/lib/api';

const VENDOR_CONTACT_EMAIL = 'vendors@quadzero.com';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatExperience(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min} - ${max} years`;
  if (min != null) return `${min}+ years`;
  if (max != null) return `Up to ${max} years`;
  return 'Not specified';
}

export default function VendorRequirementDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [requirement, setRequirement] = useState<PublicRequirementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getPublicRequirement(id)
      .then(data => setRequirement(data.requirement))
      .catch(() => setError('Requirement not found or no longer active.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
          <div className="h-8 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
          <div className="h-5 w-1/4 bg-gray-200 dark:bg-gray-700 rounded mb-8" />
          <div className="space-y-4">
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !requirement) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/vendor/requirements"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to all positions
        </Link>
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            {error || 'Requirement not found.'}
          </p>
          <Link
            href="/vendor/requirements"
            className="mt-4 inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            View all positions
          </Link>
        </div>
      </div>
    );
  }

  const mailtoSubject = encodeURIComponent(
    `Candidate Submission - ${requirement.jobTitle || 'Position'} [${requirement.requirementId}]`
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        href="/vendor/requirements"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to all positions
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {requirement.jobTitle || 'Untitled Position'}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Posted {formatDate(requirement.createdAt)}
          </span>
          {requirement.createdAt !== requirement.lastUpdated && (
            <span>Updated {formatDate(requirement.lastUpdated)}</span>
          )}
          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
            ID: {requirement.requirementId.slice(0, 8)}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-6">
        {/* Core Skill */}
        {requirement.coreSkill && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Primary Technology
            </h2>
            <span className="inline-block px-3 py-1 text-sm font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
              {requirement.coreSkill}
            </span>
          </div>
        )}

        {/* Must-Have Skills */}
        {requirement.mustHaveSkills.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Must-Have Skills
            </h2>
            <div className="flex flex-wrap gap-2">
              {requirement.mustHaveSkills.map(skill => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-full"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Good-to-Have Skills */}
        {requirement.goodToHaveSkills.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Good-to-Have Skills
            </h2>
            <div className="flex flex-wrap gap-2">
              {requirement.goodToHaveSkills.map(skill => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full"
                >
                  <Star className="w-3.5 h-3.5" />
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Details Grid */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
            Position Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Experience */}
            <div>
              <dt className="text-xs text-gray-400 dark:text-gray-500 mb-1">Experience</dt>
              <dd className="flex items-center gap-1.5 text-sm text-gray-900 dark:text-white">
                <Briefcase className="w-4 h-4 text-gray-400" />
                {formatExperience(requirement.minExperience, requirement.maxExperience)}
              </dd>
            </div>

            {/* Location */}
            <div>
              <dt className="text-xs text-gray-400 dark:text-gray-500 mb-1">Location</dt>
              <dd className="flex items-center gap-1.5 text-sm text-gray-900 dark:text-white">
                <MapPin className="w-4 h-4 text-gray-400" />
                {requirement.location || 'Not specified'}
                {requirement.remote && ' (Remote OK)'}
              </dd>
            </div>

            {/* Seniority */}
            {requirement.seniority.length > 0 && (
              <div>
                <dt className="text-xs text-gray-400 dark:text-gray-500 mb-1">Seniority Level</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {requirement.seniority.map(s => (
                    <span
                      key={s}
                      className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded capitalize"
                    >
                      {s}
                    </span>
                  ))}
                </dd>
              </div>
            )}

            {/* Availability */}
            {requirement.availability.length > 0 && (
              <div>
                <dt className="text-xs text-gray-400 dark:text-gray-500 mb-1">Availability</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {requirement.availability.map(a => (
                    <span
                      key={a}
                      className="px-2 py-0.5 text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded capitalize"
                    >
                      {a.replace(/_/g, ' ')}
                    </span>
                  ))}
                </dd>
              </div>
            )}

            {/* Roles */}
            {requirement.roles.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-400 dark:text-gray-500 mb-1">Roles</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {requirement.roles.map(role => (
                    <span
                      key={role}
                      className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                    >
                      {role}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </div>
        </div>

        {/* Additional Fields */}
        {requirement.additionalFields && requirement.additionalFields.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Required Candidate Information
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              Please include the following details when submitting a candidate:
            </p>
            <ul className="space-y-1.5">
              {requirement.additionalFields.map(field => (
                <li
                  key={field.key}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
                  {field.label}
                  {field.required && (
                    <span className="text-xs text-red-500 dark:text-red-400">*required</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA */}
        <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-6 text-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Have a candidate for this position?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
            Send us their profile with the position reference ID.
          </p>
          <a
            href={`mailto:${VENDOR_CONTACT_EMAIL}?subject=${mailtoSubject}`}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            <Mail className="w-4 h-4" />
            Submit via {VENDOR_CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </div>
  );
}
