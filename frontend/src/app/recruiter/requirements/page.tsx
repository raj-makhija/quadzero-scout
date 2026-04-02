'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Bell } from 'lucide-react';
import { Header } from '@/components/Header';
import { api, RequirementSummary } from '@/lib/api';
import { formatDate, formatEngagementModel, formatPayroll, generateJobTitle } from '@/lib/utils';

export default function RequirementsListPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [requirements, setRequirements] = useState<RequirementSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);

  // Filters
  const [searchFilter, setSearchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Redirect to sign-in if not authenticated
  if (status === 'unauthenticated') {
    router.push('/auth/signin?callbackUrl=' + encodeURIComponent('/recruiter/requirements'));
    return null;
  }

  const fetchRequirements = useCallback(async (reset = true) => {
    try {
      setLoading(true);
      setError(null);

      const offset = reset ? 0 : currentOffset;

      const response = await api.listRequirements({
        search: searchFilter.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo ? dateTo + 'T23:59:59.999Z' : undefined,
        status: statusFilter || undefined,
        limit: 20,
        offset,
      });

      if (reset) {
        setRequirements(response.requirements);
      } else {
        setRequirements((prev) => [...prev, ...response.requirements]);
      }
      setHasMore(response.pagination.hasMore);
      setCurrentOffset(response.pagination.offset + response.pagination.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requirements');
    } finally {
      setLoading(false);
    }
  }, [searchFilter, dateFrom, dateTo, statusFilter, currentOffset]);

  const sortedRequirements = useMemo(() => {
    const active: RequirementSummary[] = [];
    const inactive: RequirementSummary[] = [];
    for (const req of requirements) {
      if (req.status === 'closed_on_hold' || req.status === 'duplicate') {
        inactive.push(req);
      } else {
        active.push(req);
      }
    }
    return [...active, ...inactive];
  }, [requirements]);

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
            <p className="text-gray-600 dark:text-gray-400">All open JD requirements across the team</p>
          </div>
          <button
            onClick={() => router.push('/recruiter/search')}
            className="btn-primary self-start sm:self-auto"
          >
            Post New Requirement
          </button>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="label text-xs">Search</label>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search by client, end client, skill, contact..."
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
            <div>
              <label className="label text-xs">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input mt-1"
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="closed_on_hold">Closed / On-hold</option>
              </select>
            </div>
            <button onClick={handleSearch} className="btn-primary whitespace-nowrap">
              Search
            </button>
            {(searchFilter || dateFrom || dateTo || statusFilter) && (
              <button
                onClick={() => {
                  setSearchFilter('');
                  setDateFrom('');
                  setDateTo('');
                  setStatusFilter('');
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
          {sortedRequirements.map((req, idx) => {
            const isInactive = req.status === 'closed_on_hold' || req.status === 'duplicate';
            const prevReq = idx > 0 ? sortedRequirements[idx - 1] : null;
            const prevInactive = prevReq ? (prevReq.status === 'closed_on_hold' || prevReq.status === 'duplicate') : false;
            const showDivider = isInactive && !prevInactive;
            return (
            <>
            {showDivider && (
              <div key="inactive-divider" className="flex items-center gap-3 pt-2 pb-1">
                <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Closed / On-hold</span>
                <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
              </div>
            )}
            <div
              key={req.requirementId}
              className={`card p-5 hover:shadow-md transition-shadow cursor-pointer ${isInactive ? 'bg-amber-50/60 dark:bg-gray-800/80 opacity-60 border-dashed border-amber-300/50 dark:border-gray-500/50' : ''}`}
              onClick={() => router.push(`/recruiter/requirements/${req.requirementId}`)}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {generateJobTitle(req.clientName, req.endClient, req.coreSkill, req.contactPersonName)}
                    </h3>
                    {req.status === 'duplicate' && (
                      <span className="badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                        Duplicate
                      </span>
                    )}
                    {req.status === 'closed_on_hold' && (
                      <span className="badge bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 text-xs">
                        Closed / On-hold
                      </span>
                    )}
                    {req.requestCount != null && req.requestCount > 1 && (
                      <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">
                        Received {req.requestCount}x
                      </span>
                    )}
                    {req.demandScore != null && req.demandScore >= 50 && (
                      <span className="badge bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 text-xs">
                        High Demand
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

                  {req.roles && req.roles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {req.roles.slice(0, 3).map((role) => (
                        <span key={role} className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs">
                          {role}
                        </span>
                      ))}
                      {req.roles.length > 3 && (
                        <span className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs">
                          +{req.roles.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 self-start">
                  <button
                    title={req.notifyRecruiterIds?.includes((session?.user as { id?: string })?.id ?? '') ? 'Turn off notifications' : 'Get notified of new matches'}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const currentUserId = (session?.user as { id?: string })?.id ?? '';
                      const isNotified = req.notifyRecruiterIds?.includes(currentUserId) ?? false;
                      try {
                        const result = await api.toggleRequirementNotify(req.requirementId, !isNotified);
                        setRequirements(prev =>
                          prev.map(r =>
                            r.requirementId === req.requirementId
                              ? { ...r, notifyRecruiterIds: result.notifyRecruiterIds }
                              : r
                          )
                        );
                      } catch {
                        // silent fail — no toast needed for toggle
                      }
                    }}
                    className="p-1.5 rounded-full transition-colors text-gray-400 hover:text-primary-500 dark:hover:text-primary-400"
                  >
                    <Bell
                      size={16}
                      className={req.notifyRecruiterIds?.includes((session?.user as { id?: string })?.id ?? '') ? 'fill-primary-500 text-primary-500 dark:fill-primary-400 dark:text-primary-400' : ''}
                    />
                  </button>
                  <span className="text-sm text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {formatDate(req.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            </>
            );
          })}

          {!loading && requirements.length === 0 && (
            <div className="card p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No requirements found</h3>
              <p className="mt-2 text-gray-500 dark:text-gray-400">
                {searchFilter || dateFrom || dateTo || statusFilter
                  ? 'Try adjusting your filters'
                  : 'Post your first JD requirement to get started'}
              </p>
              {!searchFilter && !dateFrom && !dateTo && !statusFilter && (
                <button
                  onClick={() => router.push('/recruiter/search')}
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
