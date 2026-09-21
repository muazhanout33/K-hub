import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';

/**
 * Server-side Supabase client.
 * Call this inside Server Components, Server Actions, and Route Handlers.
 * Reads and writes auth session cookies using Next.js `cookies()`.
 * Uses the anon key — RLS is always enforced.
 *
 * Never call this in Client Components — use `src/lib/supabase/client.ts` there.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component — cookie mutations
            // from Server Components are ignored; only middleware can mutate them.
          }
        },
      },
    }
  );
}
