import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

/**
 * Browser-side Supabase client.
 * Call this inside Client Components / hooks only — never in Server Components or Actions.
 * Uses the anon key; RLS is always enforced.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
