'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Upload, Search, User, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
}

function NavItem({ href, icon, label }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center justify-center flex-1 py-2 transition-colors',
        isActive
          ? 'text-primary-600 dark:text-primary-400'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      )}
    >
      <div className={cn(
        'p-1 rounded-lg transition-colors',
        isActive && 'bg-primary-100 dark:bg-primary-900/30'
      )}>
        {icon}
      </div>
      <span className="text-xs mt-1 font-medium">{label}</span>
    </Link>
  );
}

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        <NavItem
          href="/"
          icon={<Home className="h-5 w-5" />}
          label="Home"
        />
        <NavItem
          href="/candidate/upload"
          icon={<Upload className="h-5 w-5" />}
          label="Upload"
        />
        <NavItem
          href="/recruiter/requirements"
          icon={<FileText className="h-5 w-5" />}
          label="Requirements"
        />
        <NavItem
          href="/recruiter/search"
          icon={<Search className="h-5 w-5" />}
          label="Search"
        />
        <NavItem
          href="/candidate/profile"
          icon={<User className="h-5 w-5" />}
          label="Profile"
        />
      </div>
    </nav>
  );
}
