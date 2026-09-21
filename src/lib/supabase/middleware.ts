import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js middleware that refreshes the Supabase session on every request.
 *
 * Supabase Auth uses two tokens: access_token (short-lived JWT) and refresh_token.
 * Without this middleware, expired access_tokens cause authenticated server queries
 * to silently return null, breaking protected pages.
 *
 * This middleware:
 * 1. Creates a server Supabase client.
 * 2. Calls getUser() to refresh the session if needed.
 * 3. Forwards refreshed cookies to the response so the browser stays in sync.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set({ name, value, ...options })
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              supabaseResponse.headers.set(key, value)
            );
          }
        },
      },
    }
  );

  // IMPORTANT: Do NOT add any logic between createServerClient and getUser().
  // Any accidental early return would leave sessions un-refreshed.
  const { data } = await supabase.auth.getUser();

  // Attach authenticated user info to request headers so downstream route
  // handlers can skip a redundant createClient() + getUser() call.
  if (data.user) {
    request.headers.set('x-supabase-user-id', data.user.id);
    request.headers.set('x-supabase-user-email', data.user.email ?? '');
  }

  return supabaseResponse;
}
