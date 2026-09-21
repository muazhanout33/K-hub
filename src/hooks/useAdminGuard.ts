'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/useAuthStore';

/**
 * Client-side admin guard — redirects non-admin users to /.
 *
 * Usage: call at the top of any admin page component.
 *
 * Redirect flow:
 * 1. Zustand state hydrated from localStorage
 * 2. If no user after hydration → redirect to /auth/login
 * 3. If user present but role !== 'Admin' → redirect to /
 * 4. If user is admin → allow render
 */
export function useAdminGuard(redirectTo = '/') {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hydrated) return;

    if (!user) {
      router.replace('/auth/login');
      return;
    }

    if (user.role !== 'Admin') {
      router.replace(redirectTo);
    }
  }, [user, hydrated, router, redirectTo]);

  return {
    hydrated,
    user,
    /** true while redirect is in progress (not hydrated, not authenticated, or not admin) */
    isRedirecting: hydrated && (!user || user.role !== 'Admin'),
    isAdmin: user?.role === 'Admin',
  };
}
