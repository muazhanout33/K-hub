-- ============================================================================
-- Migration: 20260903000000_add_missing_select_policies
--
-- Purpose: Add missing SELECT policies on courts and profiles tables.
--
-- Root cause: The base schema (docs/0001_supabase_schema.sql) defines SELECT
--   policies for courts and profiles, but these policies were never applied
--   to the live database via migrations. Only incremental fix migrations
--   (blocked_periods, bookings, service_role grants) were applied.
--
-- Evidence:
--   - Anon reads courts → 0 rows (should see non-deleted courts)
--   - Admin reads courts → 0 rows (should see all courts via is_admin())
--   - User A reads own profile → 403 (should succeed via auth.uid() = id)
--   - Admin reads profiles → 403 (should succeed via is_admin())
--   - is_admin() function EXISTS and returns correct values
--   - get_my_role() function EXISTS and returns correct values
--   - RLS IS enabled on both tables (INSERT blocked for anon)
--
-- Fix: Apply the intended SELECT policies from the base schema.
--   - Courts: public can read non-deleted courts
--   - Profiles: users can read own profile, admins can read all
--
-- Blast radius: LOW — adds missing policies only. No existing policies changed.
--
-- Safety:
--   - Uses DROP POLICY IF EXISTS before CREATE POLICY (idempotent)
--   - No schema changes, no data changes, no function changes
--   - Preserves intended security model from base schema
--   - No broad RLS refactoring
-- ==============================================================================

-- ============================================================================
-- 1. COURTS SELECT POLICY
-- ============================================================================

-- The intended policy: anon/authenticated can read non-deleted courts,
-- admins can read all courts (including deleted ones).
DROP POLICY IF EXISTS "Public read courts" ON public.courts;
CREATE POLICY "Public read courts" ON public.courts
    FOR SELECT
    USING (deleted_at IS NULL OR public.is_admin());

-- ============================================================================
-- 2. PROFILES SELECT POLICY
-- ============================================================================

-- The intended policy: users can read their own profile,
-- admins can read all profiles.
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
    FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

-- ============================================================================
-- ROLLBACK:
--   DROP POLICY IF EXISTS "Public read courts" ON public.courts;
--   DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
-- ============================================================================
