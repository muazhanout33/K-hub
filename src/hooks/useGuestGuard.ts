'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/useAuthStore';

/**
 * Client-side guest guard — redirects authenticated users away from guest-only pages.
 *
 * Usage: call at the top of /auth/login, /auth/register, etc.
 *
 * Redirect flow:
 * 1. Zustand state hydrated from localStorage
 * 2. If user present after hydration → redirect to redirectTo (default: '/')
 * 3. If no user → allow render (guest can access)
 *
 * This does NOT use Next.js middleware, so Static pages stay Static.
 */
export function useGuestGuard(redirectTo = '/') {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Wait for hydration before making redirect decisions
    if (!hydrated) return;

    if (user) {
      router.replace(redirectTo);
    }
  }, [user, hydrated, router, redirectTo]);

  return {
    /** true once Zustand has hydrated from localStorage */
    hydrated,
    /** the authenticated user, or null */
    user,
    /** true while redirect is in progress */
    isRedirecting: hydrated && !!user,
  };
}
