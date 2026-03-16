'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, PendingRecruiter, PromptSummary } from '@/lib/api';
import { Users, FileText, Upload, Calculator, ClipboardList, ArrowRight } from 'lucide-react';

export default function AdminDashboardPage() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [promptCount, setPromptCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [recruitersResponse, promptsResponse] = await Promise.all([
          api.listPendingRecruiters(),
          api.listPrompts(),
        ]);
        setPendingCount(recruitersResponse.count);
        setPromptCount(promptsResponse.prompts.length);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Admin Dashboard
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Pending Recruiters Card */}
        <Link href="/admin/recruiters" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Users className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Pending Recruiters
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {loading ? (
                    <span className="animate-pulse">Loading...</span>
                  ) : pendingCount === 0 ? (
                    'No pending approvals'
                  ) : (
                    `${pendingCount} awaiting approval`
                  )}
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        {/* Prompts Card */}
        <Link href="/admin/prompts" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Prompts Management
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {loading ? (
                    <span className="animate-pulse">Loading...</span>
                  ) : (
                    `${promptCount} prompts configured`
                  )}
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        {/* Bulk Import Card */}
        <Link href="/admin/bulk-import" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Upload className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Bulk Import
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Import multiple resumes at once
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        {/* Pricing Configuration Card */}
        <Link href="/admin/pricing" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Calculator className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Pricing Configuration
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Configure billing rate parameters
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        {/* Audit Logs Card */}
        <Link href="/admin/audit-logs" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <ClipboardList className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Audit Logs
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Track all recruiter activity
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>
      </div>
    </div>
  );
}
