'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/Header';
import { RecruiterHome } from '@/components/RecruiterHome';

export default function Home() {
  const { data: session, status } = useSession();
  const userRole = (session?.user as { role?: string })?.role;

  // Debug: fetch raw session from the API to diagnose role issues
  const [debugSession, setDebugSession] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/auth/session')
        .then((r) => r.json())
        .then((data) => {
          console.log('[HomePage] raw /api/auth/session:', JSON.stringify(data, null, 2));
          console.log('[HomePage] useSession role:', userRole, '| raw role:', data?.user?.role);
          setDebugSession(data);
        })
        .catch(() => {});
    }
  }, [status, userRole]);

  // Show recruiter home for any authenticated non-candidate user.
  // This covers role='recruiter', role='admin', and even role=undefined
  // (e.g. Google sign-in where role was not captured).
  const showRecruiterHome =
    status === 'authenticated' && userRole !== 'candidate';

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <Header />

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-24">
          {status === 'loading' ? (
            /* Loading skeleton to prevent content flash */
            <div className="text-center">
              <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded-lg mx-auto animate-pulse" />
              <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mx-auto mt-4 animate-pulse" />
              <div className="mt-10 max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              </div>
            </div>
          ) : showRecruiterHome ? (
            <RecruiterHome userName={session?.user?.name} />
          ) : (
            <div className="text-center">
              <h1 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 sm:text-5xl md:text-6xl">
                <span className="block">AI-Powered</span>
                <span className="block text-primary-600">Talent Matching</span>
              </h1>
              <p className="mt-6 max-w-2xl mx-auto text-lg sm:text-xl text-gray-500 dark:text-gray-400">
                Connect IT professionals with recruiters through intelligent resume parsing
                and smart candidate matching. Find the perfect fit faster.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4">
                <Link href="/candidate/upload" className="btn-primary text-lg px-8 py-3 w-full sm:w-auto">
                  I&apos;m a Candidate
                </Link>
                <Link href="/recruiter/search" className="btn-outline text-lg px-8 py-3 w-full sm:w-auto">
                  I&apos;m a Recruiter
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Features Section */}
      <div className="py-24 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">How It Works</h2>
            <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
              Our AI-powered platform streamlines the talent matching process
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Candidate Flow */}
            <div className="card p-8">
              <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">For Candidates</h3>
              <ul className="space-y-3 text-gray-600 dark:text-gray-400">
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-green-600 dark:text-green-400 text-sm font-medium">1</span>
                  </span>
                  <span>Upload your resume (PDF or DOCX)</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-green-600 dark:text-green-400 text-sm font-medium">2</span>
                  </span>
                  <span>AI extracts your skills and experience automatically</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-green-600 dark:text-green-400 text-sm font-medium">3</span>
                  </span>
                  <span>Review and edit your profile</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-green-600 dark:text-green-400 text-sm font-medium">4</span>
                  </span>
                  <span>Get discovered by recruiters</span>
                </li>
              </ul>
              <Link href="/candidate/upload" className="mt-6 inline-block btn-primary">
                Upload Resume
              </Link>
            </div>

            {/* Recruiter Flow */}
            <div className="card p-8">
              <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">For Recruiters</h3>
              <ul className="space-y-3 text-gray-600 dark:text-gray-400">
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">1</span>
                  </span>
                  <span>Paste your job description</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">2</span>
                  </span>
                  <span>AI extracts requirements automatically</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">3</span>
                  </span>
                  <span>Search and filter candidates</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">4</span>
                  </span>
                  <span>View ranked results with match scores</span>
                </li>
              </ul>
              <Link href="/recruiter/search" className="mt-6 inline-block btn-primary">
                Start Searching
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <span className="text-xl font-bold">Quadzero Scout</span>
              <p className="text-gray-400 dark:text-gray-500 mt-2">AI-Powered Talent Matching Platform</p>
            </div>
            <div className="flex space-x-6">
              <Link href="/privacy" className="text-gray-400 dark:text-gray-500 hover:text-white">Privacy</Link>
              <Link href="/terms" className="text-gray-400 dark:text-gray-500 hover:text-white">Terms</Link>
              <Link href="/contact" className="text-gray-400 dark:text-gray-500 hover:text-white">Contact</Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 dark:border-gray-700 text-center text-gray-400 dark:text-gray-500">
            <p>&copy; {new Date().getFullYear()} Quadzero Scout. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
