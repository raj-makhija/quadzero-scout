'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: 'There is a problem with the server configuration. Please try signing in directly.',
  AccessDenied: 'Access denied. You do not have permission to sign in.',
  Verification: 'The verification link may have expired or already been used.',
  Default: 'An authentication error occurred. Please try again.',
};

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-gray-900" />}>
      <AuthErrorContent />
    </Suspense>
  );
}

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Default';
  const message = ERROR_MESSAGES[error] || ERROR_MESSAGES.Default;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex justify-center">
          <span className="text-3xl font-bold text-primary-600 dark:text-primary-400">Quadzero Scout</span>
        </Link>

        <div className="mt-8 card py-8 px-4 sm:px-10 text-center">
          <svg className="mx-auto w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
            Authentication Error
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{message}</p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/auth/signin" className="btn-primary">
              Try Sign In
            </Link>
            <Link href="/" className="btn-secondary">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
