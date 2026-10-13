import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from './AdminShell';

/**
 * Server-side admin guard for the entire /admin route group.
 *
 * Security boundary (Phase 2 A1): role is read from the profiles table via
 * the RLS-protected server client — never from client/localStorage state.
 * `useAdminGuard` remains as a UX-only layer inside client pages.
 *
 * Fails closed: any error while resolving the profile is treated as
 * "not an admin".
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile as { role?: string } | null)?.role;

  if (error || role !== 'Admin') {
    redirect('/');
  }

  return <AdminShell>{children}</AdminShell>;
}
