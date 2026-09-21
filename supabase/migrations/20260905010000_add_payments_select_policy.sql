-- ============================================================================
-- Migration: 20260905010000_add_payments_select_policy
--
-- Purpose: Add the missing "Users view own payments" SELECT policy on payments.
--
-- Root cause: The original schema (0001_supabase_schema.sql lines 573-579) and
-- migration 20260905000000 both assumed this policy existed on the live DB. It
-- did not. Without it, NO non-admin user (and no user querying via RLS) can
-- read payments — even the admin token returns 0 rows via the REST API.
-- Only the service-role client (which bypasses RLS) could read payments.
--
-- This policy grants authenticated users SELECT on their own payments (via
-- bookings ownership join) and admins SELECT on all payments.
-- ============================================================================

DROP POLICY IF EXISTS "Users view own payments" ON public.payments;

CREATE POLICY "Users view own payments" ON public.payments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.id = payments.booking_id
            AND (b.user_id = auth.uid() OR public.is_admin())
        )
    );
