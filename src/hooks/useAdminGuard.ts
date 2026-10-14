'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { sanitizeNextPath } from './useGuestGuard';

/**
 * Client-side admin guard — redirects non-admin users to /.
 *
 * Usage: call at the top of any admin page component.
 *
 * Redirect flow:
 * 1. Zustand state hydrated from localStorage
 * 2. If no user after hydration → redirect to /auth/login (carrying ?next=<current path>)
 * 3. If user present but role !== 'Admin' → redirect to /
 * 4. If user is admin → allow render
 *
 * The `next` value is sanitized via sanitizeNextPath() before being placed in
 * the URL; the server-side admin layout guard remains the security boundary.
 */
export function useAdminGuard(redirectTo = '/') {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hydrated) return;

    if (!user) {
      const next = sanitizeNextPath(pathname);
      router.replace(
        next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login'
      );
      return;
    }

    if (user.role !== 'Admin') {
      router.replace(redirectTo);
    }
  }, [user, hydrated, router, redirectTo, pathname]);

  return {
    hydrated,
    user,
    /** true while redirect is in progress (not hydrated, not authenticated, or not admin) */
    isRedirecting: hydrated && (!user || user.role !== 'Admin'),
    isAdmin: user?.role === 'Admin',
  };
}
