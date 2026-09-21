'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/useAuthStore';

/**
 * Client-side auth guard — redirects unauthenticated users to /auth/login.
 *
 * Usage: call at the top of any protected page component.
 *
 * Redirect flow:
 * 1. Zustand state hydrated from localStorage
 * 2. If no user after hydration → redirect to /auth/login
 * 3. If user present → allow render
 *
 * This does NOT use Next.js middleware, so Static pages stay Static.
 */
export function useAuthGuard(redirectTo = '/auth/login') {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Wait for hydration before making redirect decisions
    if (!hydrated) return;

    if (!user) {
      router.replace(redirectTo);
    }
  }, [user, hydrated, router, redirectTo]);

  return {
    /** true once Zustand has hydrated from localStorage */
    hydrated,
    /** the authenticated user, or null */
    user,
    /** true while redirect is in progress */
    isRedirecting: hydrated && !user,
  };
}
