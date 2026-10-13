'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

/**
 * Renders the public site chrome (Navbar + Footer) on every route EXCEPT the
 * admin experience (`/admin` and `/admin/*`), which provides its own shell.
 *
 * `usePathname()` is resolved per-route during SSR/prerender, so the server
 * HTML and the first client render always agree (no hydration mismatch).
 * The `?? '/'` fallback errs toward rendering the public chrome, preserving
 * public-site behavior if the pathname is ever unavailable.
 */
export function PublicChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

  return (
    <>
      {!isAdminRoute && <Navbar />}
      {children}
      {!isAdminRoute && <Footer />}
    </>
  );
}
