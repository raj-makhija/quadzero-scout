'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Users, FileText, LayoutDashboard, Upload, ClipboardList, Settings, BarChart3 } from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/auth/signin?callbackUrl=/admin');
      return;
    }

    const userRole = (session.user as { role?: string })?.role;
    if (userRole !== 'admin') {
      router.push('/');
    }
  }, [session, status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const userRole = (session?.user as { role?: string })?.role;
  if (!session || userRole !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full md:w-64 flex-shrink-0">
            <nav className="card p-4 space-y-1">
              <Link
                href="/admin"
                className="flex items-center px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                <LayoutDashboard className="w-5 h-5 mr-3" />
                Dashboard
              </Link>
              <Link
                href="/admin/recruiters"
                className="flex items-center px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                <Users className="w-5 h-5 mr-3" />
                Recruiters
              </Link>
              <Link
                href="/admin/prompts"
                className="flex items-center px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                <FileText className="w-5 h-5 mr-3" />
                Prompts
              </Link>
              <Link
                href="/admin/bulk-import"
                className="flex items-center px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                <Upload className="w-5 h-5 mr-3" />
                Bulk Import
              </Link>
              <Link
                href="/admin/audit-logs"
                className="flex items-center px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                <ClipboardList className="w-5 h-5 mr-3" />
                Audit Logs
              </Link>
              <Link
                href="/admin/activity"
                className="flex items-center px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                <BarChart3 className="w-5 h-5 mr-3" />
                Activity
              </Link>
              <Link
                href="/admin/settings"
                className="flex items-center px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                <Settings className="w-5 h-5 mr-3" />
                Settings
              </Link>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
