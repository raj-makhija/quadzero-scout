'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { Menu, X, LogOut, User } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { MobileNav } from './MobileNav';
import { cn } from '@/lib/utils';

interface HeaderProps {
  children?: React.ReactNode;
  className?: string;
  showNav?: boolean;
}

export function Header({ children, className, showNav = true }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session, status } = useSession();

  return (
    <>
      <header className={cn('bg-white dark:bg-gray-800 shadow-sm', className)}>
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link
              href="/"
              className="text-xl font-bold text-primary-600 dark:text-primary-400"
            >
              Quadzero Scout
            </Link>

            {/* Custom children (e.g., step indicators) */}
            {children && (
              <div className="hidden md:flex items-center">{children}</div>
            )}

            {/* Desktop Navigation */}
            {showNav && (
              <nav className="hidden md:flex items-center space-x-4">
                <ThemeToggle />

                {status === 'loading' ? (
                  <div className="h-10 w-20 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-md" />
                ) : session ? (
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {session.user?.name || session.user?.email}
                    </span>
                    <button
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="btn-secondary text-sm"
                    >
                      <LogOut className="h-4 w-4 mr-1" />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <>
                    <Link href="/auth/signin" className="btn-secondary text-sm">
                      Sign In
                    </Link>
                    <Link href="/auth/signup" className="btn-primary text-sm">
                      Get Started
                    </Link>
                  </>
                )}
              </nav>
            )}

            {/* Mobile Menu Button */}
            <div className="flex items-center space-x-2 md:hidden">
              <ThemeToggle />
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Open menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Mobile step indicators */}
          {children && (
            <div className="md:hidden mt-3 flex justify-center">{children}</div>
          )}
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <MobileNav
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        session={session}
      />
    </>
  );
}
