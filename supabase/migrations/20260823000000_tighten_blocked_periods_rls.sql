-- Migration: Tighten blocked_periods SELECT policy
-- Problem: "Public read blocked periods" uses USING(true), exposing internal admin
--          data (court IDs, dates, times, reasons) to anonymous visitors.
-- Fix: Replace with admin-only SELECT policy.
-- Blast radius: LOW — blocked_periods Supabase table is not used by the active
--   booking flow (which uses localStorage via useBlockedPeriodStore).
--   No existing feature reads from this Supabase table.
-- Rollback: See rollback section at bottom.

-- 1. Remove the public SELECT policy
DROP POLICY IF EXISTS "Public read blocked periods"
ON public.blocked_periods;

-- 2. Create admin-only SELECT policy
CREATE POLICY "Admin read blocked periods"
ON public.blocked_periods
FOR SELECT
TO authenticated
USING (public.is_admin());

-- ============================================================================
-- ROLLBACK (run only if this migration needs to be reverted):
--
-- DROP POLICY IF EXISTS "Admin read blocked periods" ON public.blocked_periods;
-- CREATE POLICY "Public read blocked periods" ON public.blocked_periods
--     FOR SELECT USING (true);
-- ============================================================================
