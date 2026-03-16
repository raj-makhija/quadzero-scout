'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
const WARNING_BEFORE_EXPIRY_S = 300; // Warn 5 minutes before expiry
const CACHE_KEY = 'session_timeout_seconds';

export function SessionTimeoutGuard() {
  const { data: session, status } = useSession();
  const timeoutRef = useRef<number | null>(null);
  const warningShownRef = useRef(false);

  const getSessionTimeout = useCallback(async (): Promise<number> => {
    // Check sessionStorage cache first
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Cache for 5 minutes
      if (Date.now() - parsed.fetchedAt < 5 * 60 * 1000) {
        return parsed.value;
      }
    }

    try {
      const data = await api.getSessionTimeout();
      const value = data.sessionTimeoutSeconds;
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ value, fetchedAt: Date.now() }));
      return value;
    } catch {
      return 86400; // Default to 24 hours on error
    }
  }, []);

  const checkSessionExpiry = useCallback(async () => {
    if (status !== 'authenticated' || !session) return;

    const iat = (session as { iat?: number }).iat;
    if (!iat) return;

    const timeoutSeconds = await getSessionTimeout();
    const elapsed = Math.floor(Date.now() / 1000) - iat;
    const remaining = timeoutSeconds - elapsed;

    if (remaining <= 0) {
      signOut({ callbackUrl: '/auth/signin?reason=session_expired' });
      return;
    }

    // Show warning when approaching expiry
    if (remaining <= WARNING_BEFORE_EXPIRY_S && !warningShownRef.current) {
      warningShownRef.current = true;
      const minutes = Math.ceil(remaining / 60);
      // Dispatch a custom event that the toast system can pick up,
      // or use a simple browser notification
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('session-expiry-warning', {
            detail: { minutesRemaining: minutes },
          })
        );
      }
    }
  }, [session, status, getSessionTimeout]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    // Check immediately on mount
    checkSessionExpiry();

    // Set up periodic check
    const interval = setInterval(checkSessionExpiry, CHECK_INTERVAL_MS);

    // Check on tab visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSessionExpiry();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [status, checkSessionExpiry]);

  // Reset warning flag when session changes (e.g., new login)
  useEffect(() => {
    warningShownRef.current = false;
    // Clear cached timeout on session change so it's re-fetched
    sessionStorage.removeItem(CACHE_KEY);
  }, [session?.user]);

  return null; // This component renders nothing
}
