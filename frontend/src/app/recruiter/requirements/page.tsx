'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/Header';
import { api, RequirementSummary } from '@/lib/api';
import { formatDate, formatEngagementModel, formatPayroll } from '@/lib/utils';

export default function RequirementsListPage() {
  const router = useRouter();
  const { status } = useSession();

  const [requirements, setRequirements] = useState<RequirementSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastKey, setLastKey] = useState<string | undefined>();

  // Filters
  const [clientNameFilter, setClientNameFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Redirect to sign-in if not authenticated
  if (status === 'unauthenticated') {
    router.push('/auth/signin?callbackUrl=' + encodeURIComponent('/recruiter/requirements'));
    return null;
  }

  const fetchRequirements = useCallback(async (reset = true) => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.listRequirements({
        clientName: clientNameFilter.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo ? dateTo + 'T23:59:59.999Z' : undefined,
        limit: 20,
        lastEvaluatedKey: reset ? undefined : lastKey,
      });

      if (reset) {
        setRequirements(response.requirements);
      } else {
        setRequirements((prev) => [...prev, ...response.requirements]);
      }
      setHasMore(response.pagination.hasMore);
      setLastKey(response.pagination.lastEvaluatedKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requirements');
    } finally {
      setLoading(false);
    }
  }, [clientNameFilter, dateFrom, dateTo, lastKey]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchRequirements(true);
    }
  // Only run on mount and auth change — filter changes handled by the search button
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleSearch = () => {
    fetchRequirements(true);
  };

  const handleLoadMore = () => {
    fetchRequirements(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header>
        <nav className="flex items-center space-x-4">
          <span className="text-sm text-primary-600 dark:text-primary-400 font-medium">
            Requirements
          </span>
        </nav>
      </Header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Requirements</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage your posted JD requirements</p>
          </div>
          <button
            onClick={() => router.push('/recruiter/requirements/new')}
            className="btn-primary self-start sm:self-auto"
          >
            Post New Requirement
          </button>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="label text-xs">Client Name</label>
              <input
                type="text"
                value={clientNameFilter}
                onChange={(e) => setClientNameFilter(e.target.value)}
                placeholder="Filter by client name..."
                className="input mt-1"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div>
              <label className="label text-xs">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input mt-1"
              />
            </div>
            <div>
              <label className="label text-xs">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input mt-1"
              />
            </div>
            <button onClick={handleSearch} className="btn-primary whitespace-nowrap">
              Search
            </button>
            {(clientNameFilter || dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setClientNameFilter('');
                  setDateFrom('');
                  setDateTo('');
                  setTimeout(() => fetchRequirements(true), 0);
                }}
                className="btn-secondary whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Requirements List */}
        <div className="space-y-4">
          {requirements.map((req) => (
            <div
              key={req.requirementId}
              className="card p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/recruiter/requirements/${req.requirementId}`)}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {req.jobTitle || 'Untitled Requirement'}
                    </h3>
                    {req.status === 'duplicate' && (
                      <span className="badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                        Duplicate
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{req.clientName}</span>
                    {req.endClient && <span>End Client: {req.endClient}</span>}
                    <span>{formatEngagementModel(req.engagementModel)}</span>
                    <span>Payroll: {formatPayroll(req.payroll)}</span>
                    {(req.budgetMinLpa != null || req.budgetMaxLpa != null) && (
                      <span>
                        Budget: {req.budgetMinLpa ?? '0'} - {req.budgetMaxLpa ?? '∞'} LPA
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {req.mustHaveSkills.slice(0, 6).map((skill) => (
                      <span key={skill} className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                        {skill}
                      </span>
                    ))}
                    {req.mustHaveSkills.length > 6 && (
                      <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                        +{req.mustHaveSkills.length - 6} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-sm text-gray-400 dark:text-gray-500 whitespace-nowrap self-start">
                  {formatDate(req.createdAt)}
                </div>
              </div>
            </div>
          ))}

          {!loading && requirements.length === 0 && (
            <div className="card p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No requirements found</h3>
              <p className="mt-2 text-gray-500 dark:text-gray-400">
                {clientNameFilter || dateFrom || dateTo
                  ? 'Try adjusting your filters'
                  : 'Post your first JD requirement to get started'}
              </p>
              {!clientNameFilter && !dateFrom && !dateTo && (
                <button
                  onClick={() => router.push('/recruiter/requirements/new')}
                  className="btn-primary mt-4"
                >
                  Post New Requirement
                </button>
              )}
            </div>
          )}

          {loading && (
            <div className="card p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading requirements...</p>
            </div>
          )}

          {hasMore && !loading && (
            <div className="text-center">
              <button onClick={handleLoadMore} className="btn-secondary">
                Load More
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
