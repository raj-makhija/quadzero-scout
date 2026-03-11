'use client';

import Link from 'next/link';
import { Upload, Search, FileText, ArrowRight, UserSearch } from 'lucide-react';

interface RecruiterHomeProps {
  userName?: string | null;
}

export function RecruiterHome({ userName }: RecruiterHomeProps) {
  const firstName = userName?.split(' ')[0] || 'there';

  return (
    <div className="text-center">
      <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 sm:text-4xl">
        Welcome back, {firstName}
      </h1>
      <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
        What would you like to do today?
      </p>

      <div className="mt-10 max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Upload Resume Card */}
        <Link
          href="/candidate/upload"
          className="card p-8 text-left hover:shadow-md transition-shadow group"
        >
          <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
            <Upload className="w-6 h-6 text-primary-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Upload a Resume
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Add a candidate profile with AI-powered extraction
          </p>
        </Link>

        {/* Search by JD Card */}
        <Link
          href="/recruiter/search"
          className="card p-8 text-left hover:shadow-md transition-shadow group"
        >
          <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
            <Search className="w-6 h-6 text-primary-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Search by JD
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Paste a job description to find matching candidates
          </p>
        </Link>

        {/* Locate Profile Card */}
        <Link
          href="/recruiter/locate"
          className="card p-8 text-left hover:shadow-md transition-shadow group"
        >
          <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
            <UserSearch className="w-6 h-6 text-primary-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Locate Profile
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Find a specific candidate by name
          </p>
        </Link>
      </div>

      <div className="mt-8">
        <Link
          href="/recruiter/requirements"
          className="inline-flex items-center text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
        >
          <FileText className="w-4 h-4 mr-1.5" />
          View My Requirements
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </div>
    </div>
  );
}
