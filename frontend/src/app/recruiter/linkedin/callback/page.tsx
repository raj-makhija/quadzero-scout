'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

export default function LinkedInCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError('LinkedIn authorization was denied.');
      return;
    }

    if (!code || !state) {
      setError('Invalid callback — missing code or state.');
      return;
    }

    api
      .exchangeLinkedInCode(code, state)
      .then(() => {
        const returnTo = sessionStorage.getItem('linkedin_return_to') || '/recruiter/requirements';
        sessionStorage.removeItem('linkedin_return_to');
        router.replace(returnTo);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'LinkedIn connection failed. Please try again.');
      });
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.replace('/recruiter/requirements')}
            className="btn-primary"
          >
            Back to Requirements
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-gray-600 dark:text-gray-400">Connecting LinkedIn…</p>
      </div>
    </div>
  );
}
