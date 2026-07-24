'use client';

import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

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
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
