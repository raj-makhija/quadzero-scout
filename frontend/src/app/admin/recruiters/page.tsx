'use client';

import { useState, useEffect } from 'react';
import { api, PendingRecruiter } from '@/lib/api';
import { Check, X, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function RecruitersPage() {
  const [recruiters, setRecruiters] = useState<PendingRecruiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const loadRecruiters = async () => {
    try {
      setLoading(true);
      const response = await api.listPendingRecruiters();
      setRecruiters(response.recruiters);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load recruiters',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecruiters();
  }, []);

  const handleAction = async (userId: string, action: 'approve' | 'reject') => {
    try {
      setActionLoading(userId);
      await api.approveRejectUser(userId, action);

      toast({
        title: action === 'approve' ? 'Approved' : 'Rejected',
        description: `Recruiter has been ${action === 'approve' ? 'approved' : 'rejected'} successfully.`,
        variant: 'success',
      });

      // Remove from list
      setRecruiters(recruiters.filter((r) => r.id !== userId));
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : `Failed to ${action} recruiter`,
        variant: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Pending Recruiters
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Review and approve recruiter registrations
          </p>
        </div>
        <button
          onClick={loadRecruiters}
          disabled={loading}
          className="btn-secondary"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="card p-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : recruiters.length === 0 ? (
        <div className="card p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
            No pending approvals
          </h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            All recruiter registrations have been processed.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Registered
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {recruiters.map((recruiter) => (
                <tr key={recruiter.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {recruiter.email}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(recruiter.createdAt)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleAction(recruiter.id, 'approve')}
                        disabled={actionLoading === recruiter.id}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(recruiter.id, 'reject')}
                        disabled={actionLoading === recruiter.id}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
