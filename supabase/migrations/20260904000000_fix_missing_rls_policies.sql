-- ============================================================================
-- Migration: 20260904000000_fix_missing_rls_policies
--
-- Purpose: Fix 5 confirmed RLS/authorization defects discovered by live DB probes.
--
-- Root cause: The base schema (docs/0001_supabase_schema.sql) was NEVER fully
--   applied as a migration. Only incremental fixes were applied. As a result:
--   - F1: Profiles UPDATE policy missing → users cannot update own profile
--   - F2: Profiles admin ALL policy missing → admins cannot update any profile
--   - F3: Events ALL policy missing + missing GRANT UPDATE/INSERT → admin cannot
--         INSERT or UPDATE events
--   - F4: Blocked periods SELECT policy may be missing (low priority — table unused)
--   - F5: Notifications admin ALL policy missing → admin cannot INSERT notifications
--         + user self-injection policy exists (security risk — users can create
--         notifications for themselves)
--
-- Evidence:
--   - User A PATCH own profile → 200 OK with [] (RLS silent block, 0 rows)
--   - Admin PATCH User A profile → 200 OK with [] (RLS silent block, 0 rows)
--   - Admin INSERT event → 403 "permission denied for table events"
--   - Admin PATCH events → 403 "permission denied for table events"
--   - Admin INSERT notification → 403 "new row violates RLS policy"
--   - User A INSERT own notification → 201 OK (self-injection)
--   - Admin DELETE notification → 403 "permission denied for table notifications"
--   - User A DELETE own notification → 403 "permission denied for table notifications"
--
-- Rogue policy discovered on live DB (NOT in base schema):
--   "Users can insert own notifications" — allows users to INSERT notifications
--   for themselves (user_id = auth.uid()). This is a security risk: users can
--   create fake notifications. Must be dropped.
--
-- Safety:
--   - All statements are idempotent (DROP IF EXISTS + CREATE)
--   - No existing security is weakened
--   - Only adds missing policies and grants
--   - RLS remains enabled on all tables
--   - Rogue policy is explicitly dropped
--
-- Rollback:
--   DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
--   DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
--   DROP POLICY IF EXISTS "Admins manage events" ON public.events;
--   DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;
--   REVOKE UPDATE, INSERT ON public.events FROM authenticated;
--   REVOKE UPDATE, INSERT, DELETE ON public.profiles FROM authenticated;
--   REVOKE INSERT, DELETE ON public.notifications FROM authenticated;
-- ============================================================================

-- ==========================================================================
-- PART 1: Missing GRANTs for authenticated role
-- ==========================================================================
-- The base schema declares GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES
-- TO anon, authenticated (line 693). This was never applied. Only service_role
-- grants were applied via migration 20260826000001. The authenticated role is
-- missing UPDATE/INSERT/DELETE on most tables, causing 403 at table level.

-- Events: Admin needs INSERT + UPDATE (RLS restricts to is_admin())
-- anon needs SELECT for public "Public view events" policy
GRANT SELECT ON public.events TO anon;
GRANT UPDATE, INSERT ON public.events TO authenticated;

-- Profiles: Users need UPDATE (own profile), Admins need ALL (INSERT/UPDATE/DELETE)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- Notifications: Admin needs INSERT/UPDATE/DELETE (RLS restricts to is_admin())
-- Users need UPDATE (mark read) and DELETE (own) — RLS restricts to own rows
GRANT INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

-- Blocked periods: Admin needs SELECT/INSERT/UPDATE/DELETE (RLS restricts to is_admin())
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_periods TO authenticated;

-- ==========================================================================
-- PART 2: Rogue policy cleanup
-- ==========================================================================
-- The live DB has a policy "Users can insert own notifications" that is NOT in
-- the base schema. It allows users to INSERT notifications for themselves
-- (user_id = auth.uid()). This is a security risk: users can create fake
-- notifications that appear to be from the system.
-- The base schema explicitly documents (line 585): "FOR ALL was overly
-- permissive — users could INSERT arbitrary notifications". No user INSERT
-- policy should exist on notifications.

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;

-- ==========================================================================
-- PART 3: Missing RLS Policies
-- ==========================================================================

-- A. PROFILES — Users update own profile
-- Security: USING ensures user can only update own row.
-- WITH CHECK prevents role escalation: new role must match current DB role
-- via get_my_role() (SECURITY DEFINER, breaks RLS recursion).
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        id = auth.uid()
        AND role = public.get_my_role()
    );

-- B. PROFILES — Admins manage profiles (full CRUD)
-- Security: is_admin() checks profiles.role = 'Admin' via SECURITY DEFINER.
DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles" ON public.profiles
    FOR ALL USING (public.is_admin());

-- C. EVENTS — Admins manage events (INSERT, UPDATE, DELETE)
-- Security: is_admin() checks profiles.role = 'Admin' via SECURITY DEFINER.
-- Public SELECT policy already exists ("Public view events" FOR SELECT USING true).
DROP POLICY IF EXISTS "Admins manage events" ON public.events;
CREATE POLICY "Admins manage events" ON public.events
    FOR ALL USING (public.is_admin());

-- D. NOTIFICATIONS — Admins manage notifications (INSERT, UPDATE, DELETE)
-- Security: is_admin() checks profiles.role = 'Admin' via SECURITY DEFINER.
-- Rogue user INSERT policy dropped in Part 2 above.
DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;
CREATE POLICY "Admins manage notifications" ON public.notifications
    FOR ALL USING (public.is_admin());

-- D2. NOTIFICATIONS — Users mark own notifications read (UPDATE)
-- Security: USING ensures user can only update own rows.
-- WITH CHECK ensures only is_read can change; all other columns must remain
-- unchanged (user_id, title, message, type, related_booking_id are immutable).
-- This matches the base schema (lines 601-612).
DROP POLICY IF EXISTS "Users mark notifications read" ON public.notifications;
CREATE POLICY "Users mark notifications read" ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND user_id          = (SELECT user_id          FROM public.notifications WHERE id = notifications.id)
        AND title            = (SELECT title            FROM public.notifications WHERE id = notifications.id)
        AND message          = (SELECT message          FROM public.notifications WHERE id = notifications.id)
        AND type             = (SELECT type             FROM public.notifications WHERE id = notifications.id)
        AND related_booking_id IS NOT DISTINCT FROM
            (SELECT related_booking_id FROM public.notifications WHERE id = notifications.id)
    );

-- D3. NOTIFICATIONS — Users delete own notifications (DELETE)
-- Security: USING ensures user can only delete own rows.
-- This matches the base schema (lines 614-615).
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications
    FOR DELETE USING (auth.uid() = user_id);

-- E. BLOCKED PERIODS — Admin-only SELECT (recreate idempotently)
-- The migration 20260823000000 created "Admin read blocked periods" with
-- FOR SELECT TO authenticated USING (is_admin()). This should already exist.
-- Re-create idempotently to ensure correctness.
-- Base schema (lines 537-538): admin-only SELECT, no user SELECT.
DROP POLICY IF EXISTS "Admin read blocked periods" ON public.blocked_periods;
CREATE POLICY "Admin read blocked periods" ON public.blocked_periods
    FOR SELECT TO authenticated USING (public.is_admin());

-- E2. BLOCKED PERIODS — Admins manage blocked periods (INSERT, UPDATE, DELETE)
-- Base schema (lines 540-541): admin-only ALL. No user write access.
DROP POLICY IF EXISTS "Admins manage blocked periods" ON public.blocked_periods;
CREATE POLICY "Admins manage blocked periods" ON public.blocked_periods
    FOR ALL USING (public.is_admin());

-- ==========================================================================
-- PART 4: Verification queries (run after applying)
-- ==========================================================================
-- Uncomment to verify:
--
-- -- Check policies exist
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- AND tablename IN ('profiles', 'events', 'notifications', 'blocked_periods')
-- ORDER BY tablename, policyname;
--
-- -- Check grants exist
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
-- AND table_name IN ('profiles', 'events', 'notifications', 'blocked_periods')
-- AND grantee IN ('authenticated', 'anon')
-- ORDER BY table_name, grantee, privilege_type;
--
-- -- Verify rogue policy is gone
-- SELECT polname FROM pg_policies
-- WHERE tablename = 'notifications' AND polname = 'Users can insert own notifications';
-- -- Should return 0 rows
