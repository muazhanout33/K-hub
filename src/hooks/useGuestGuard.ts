'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/useAuthStore';

/**
 * Validates an untrusted `next` redirect value as a safe INTERNAL path.
 *
 * Accepts only root-relative paths (e.g. `/admin`, `/book?x=1#y`).
 * Rejects, returning null:
 * - absolute URLs (`https://…`, `javascript:…`) and values without a leading `/`
 * - protocol-relative paths (`//host`, `/\host`, encoded variants)
 * - any backslash, control characters, or whitespace
 * - absolute-URL lookalikes such as `/https://…` (contains `://`)
 * - malformed percent-encoding (decodeURIComponent throws)
 * - empty values or values longer than 512 chars
 */
export function sanitizeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > 512) return null;
  if (raw.charCodeAt(0) !== 47 /* '/' */) return null;
  if (raw.includes('\\')) return null;
  if (/\s/.test(raw)) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.length === 0 || decoded.length > 512) return null;
  if (decoded.charCodeAt(0) !== 47 /* '/' */) return null;
  if (decoded.startsWith('//')) return null;
  if (decoded.includes('\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return null;
  if (decoded.includes('://')) return null;

  return raw;
}

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
 * `redirectTo` is passed through sanitizeNextPath() so a tampered `next`
 * parameter can never cause an off-origin or malformed navigation; invalid
 * values fall back to `/`.
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
      router.replace(sanitizeNextPath(redirectTo) ?? '/');
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
