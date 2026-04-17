'use client';

import Link from 'next/link';
import { Mail } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const VENDOR_CONTACT_EMAIL = 'vendors@quadzero.com';

export function VendorHeader() {
  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link
            href="/vendor/requirements"
            className="text-xl font-bold text-primary-600 dark:text-primary-400"
          >
            Quadzero Scout
          </Link>

          <div className="flex items-center gap-4">
            <a
              href={`mailto:${VENDOR_CONTACT_EMAIL}`}
              className="hidden sm:flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <Mail className="w-4 h-4" />
              {VENDOR_CONTACT_EMAIL}
            </a>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
