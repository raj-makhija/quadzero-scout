'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Search, MapPin, Briefcase, Clock, Mail } from 'lucide-react';
import { api, PublicRequirementSummary } from '@/lib/api';

const VENDOR_CONTACT_EMAIL = 'vendors@quadzero.com';
const PAGE_SIZE = 20;

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  return `${diffMonths} months ago`;
}

function formatExperience(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}-${max} yrs`;
  if (min != null) return `${min}+ yrs`;
  if (max != null) return `Up to ${max} yrs`;
  return '';
}

export default function VendorRequirementsPage() {
  const [requirements, setRequirements] = useState<PublicRequirementSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  // Client-side filters
  const [skillSearch, setSkillSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  const fetchRequirements = useCallback(async (newOffset: number, append: boolean) => {
    try {
      if (append) setLoadingMore(true); else setLoading(true);

      const result = await api.listPublicRequirements(PAGE_SIZE, newOffset);
      const fetched = result.requirements;

      setRequirements(prev => append ? [...prev, ...fetched] : fetched);
      setHasMore(result.pagination.hasMore);
      setTotal(result.pagination.total);
      setOffset(newOffset + fetched.length);
    } catch {
      setError('Failed to load requirements. Please try again later.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchRequirements(0, false);
  }, [fetchRequirements]);

  const filtered = useMemo(() => {
    let items = requirements;

    if (skillSearch.trim()) {
      const term = skillSearch.trim().toLowerCase();
      items = items.filter(r =>
        r.mustHaveSkills.some(s => s.toLowerCase().includes(term)) ||
        r.goodToHaveSkills.some(s => s.toLowerCase().includes(term)) ||
        (r.coreSkill && r.coreSkill.toLowerCase().includes(term)) ||
        (r.jobTitle && r.jobTitle.toLowerCase().includes(term))
      );
    }

    if (locationFilter.trim()) {
      const term = locationFilter.trim().toLowerCase();
      items = items.filter(r =>
        r.location && r.location.toLowerCase().includes(term)
      );
    }

    return items;
  }, [requirements, skillSearch, locationFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Open Positions
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Browse our current openings. To submit candidate profiles, email us at{' '}
          <a
            href={`mailto:${VENDOR_CONTACT_EMAIL}`}
            className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
          >
            {VENDOR_CONTACT_EMAIL}
          </a>
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by skill or job title..."
            value={skillSearch}
            onChange={e => setSkillSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div className="relative sm:w-64">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Filter by location..."
            value={locationFilter}
            onChange={e => setLocationFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {filtered.length} of {total} position{total !== 1 ? 's' : ''}
          {(skillSearch || locationFilter) ? ' (filtered)' : ''}
        </p>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
              <div className="h-5 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
              <div className="flex gap-2 mb-3">
                <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="h-6 w-14 bg-gray-200 dark:bg-gray-700 rounded-full" />
              </div>
              <div className="h-4 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="text-center py-12">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => fetchRequirements(0, false)}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-12">
          <Briefcase className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            {skillSearch || locationFilter
              ? 'No positions match your filters. Try adjusting your search.'
              : 'No open positions at the moment. Check back soon!'}
          </p>
        </div>
      )}

      {/* Requirements Grid */}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(req => (
            <Link
              key={req.requirementId}
              href={`/vendor/requirements/${req.requirementId}`}
              className="block bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 transition-all"
            >
              {/* Job Title */}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2">
                {req.jobTitle || 'Untitled Position'}
              </h3>

              {/* Core Skill */}
              {req.coreSkill && (
                <span className="inline-block px-2.5 py-0.5 text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full mb-3">
                  {req.coreSkill}
                </span>
              )}

              {/* Must-Have Skills */}
              {req.mustHaveSkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {req.mustHaveSkills.slice(0, 5).map(skill => (
                    <span
                      key={skill}
                      className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                    >
                      {skill}
                    </span>
                  ))}
                  {req.mustHaveSkills.length > 5 && (
                    <span className="px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                      +{req.mustHaveSkills.length - 5} more
                    </span>
                  )}
                </div>
              )}

              {/* Meta info */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 mt-auto">
                {formatExperience(req.minExperience, req.maxExperience) && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5" />
                    {formatExperience(req.minExperience, req.maxExperience)}
                  </span>
                )}
                {req.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {req.location}
                    {req.remote && ' (Remote)'}
                  </span>
                )}
                {!req.location && req.remote && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    Remote
                  </span>
                )}
              </div>

              {/* Seniority */}
              {req.seniority.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {req.seniority.map(s => (
                    <span
                      key={s}
                      className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded capitalize"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(req.createdAt)}
                </span>
                <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                  View Details &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Load More */}
      {!loading && hasMore && (
        <div className="mt-8 text-center">
          <button
            onClick={() => fetchRequirements(offset, true)}
            disabled={loadingMore}
            className="px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {/* Footer CTA */}
      <div className="mt-12 p-6 bg-primary-50 dark:bg-primary-900/20 rounded-lg text-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Have a matching candidate?
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Send us their profile and we&apos;ll get back to you.
        </p>
        <a
          href={`mailto:${VENDOR_CONTACT_EMAIL}`}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          <Mail className="w-4 h-4" />
          Email us at {VENDOR_CONTACT_EMAIL}
        </a>
      </div>
    </div>
  );
}
