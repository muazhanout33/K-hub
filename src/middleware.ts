import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const AUTH_REQUIRED_PATHS = new Set([
  '/bookings',
  '/profile',
  '/notifications',
  '/admin',
]);

const AUTH_REQUIRED_PREFIXES = ['/api/bookings'];

function needsSessionRefresh(pathname: string): boolean {
  if (AUTH_REQUIRED_PATHS.has(pathname)) return true;
  return AUTH_REQUIRED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

export async function middleware(request: NextRequest) {
  if (!needsSessionRefresh(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (.png, .jpg, .svg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
