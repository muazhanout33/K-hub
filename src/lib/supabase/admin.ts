import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

/**
 * Server-only Supabase admin client using the service role key.
 *
 * MUST NEVER be called on the client side.
 * Used exclusively by server actions and route handlers for:
 * 1. Sanitized public court availability queries (stripping all PII)
 * 2. Automated hold expiration of stale 'Reserved' bookings
 * 3. Atomic conflict-free double-booking guarantees
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient must only be called on the server.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
