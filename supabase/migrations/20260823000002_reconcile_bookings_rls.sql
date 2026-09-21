-- Migration: Reconcile bookings RLS with Phase 8 intended authorization model
-- Problem: Live database bookings policies differ from the repository schema:
--   - INSERT: Two duplicate policies, neither has admin bypass
--   - SELECT: No admin bypass (admins cannot see other users' bookings via RLS)
--   - UPDATE: No admin bypass, no status transition restriction, no immutable-field enforcement
--             (admins cannot expire other users' bookings via RLS; users can freely change
--              court_id, total_price, booking_range, and transition to any status)
-- Fix: Align live policies with the intended Phase 8 authorization model from
--      docs/0001_supabase_schema.sql and add a BEFORE UPDATE trigger for real
--      immutable-field enforcement (the WITH CHECK subquery approach is a no-op
--      because PostgreSQL evaluates it after the UPDATE, so subqueries return
--      the NEW values, making the comparison always TRUE).
-- Blast radius: MEDIUM — changes INSERT/SELECT/UPDATE authorization for bookings.
--   All existing application code (createBookingAction, cancelBookingAction,
--   confirmBookingStatusAction, expireStaleBookingsAction) is compatible.
-- Rollback: See rollback section at bottom.

-- ==============================================================================
-- 1. CONSOLIDATE INSERT POLICIES
-- ==============================================================================

-- Drop all three possible INSERT policy names (live + repo)
DROP POLICY IF EXISTS "Authenticated users can create their own bookings"
    ON public.bookings;
DROP POLICY IF EXISTS "Users can insert own bookings"
    ON public.bookings;
DROP POLICY IF EXISTS "Users create own bookings"
    ON public.bookings;

-- Create single intended INSERT policy with admin bypass
CREATE POLICY "Users create own bookings" ON public.bookings
    FOR INSERT
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- ==============================================================================
-- 2. RECONCILE SELECT POLICY (add admin bypass)
-- ==============================================================================

DROP POLICY IF EXISTS "Users view own bookings"
    ON public.bookings;

CREATE POLICY "Users view own bookings" ON public.bookings
    FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

-- ==============================================================================
-- 3. RECONCILE UPDATE POLICY (admin bypass + status restriction + immutable fields)
-- ==============================================================================

-- The WITH CHECK subqueries for immutable fields are a defense-in-depth measure.
-- They do NOT provide real enforcement (PostgreSQL evaluates them after the UPDATE,
-- so subqueries read the NEW values). Real enforcement is via the BEFORE UPDATE
-- trigger added in Section 4 below.
DROP POLICY IF EXISTS "Users update own bookings"
    ON public.bookings;

CREATE POLICY "Users update own bookings" ON public.bookings
    FOR UPDATE
    USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (
        public.is_admin()
        OR (
            auth.uid() = user_id
            AND status IN ('Cancelled', 'Confirmed')
            AND user_id      = (SELECT user_id      FROM public.bookings WHERE id = bookings.id)
            AND court_id     = (SELECT court_id     FROM public.bookings WHERE id = bookings.id)
            AND total_price  = (SELECT total_price  FROM public.bookings WHERE id = bookings.id)
            AND booking_range= (SELECT booking_range FROM public.bookings WHERE id = bookings.id)
        )
    );

-- ==============================================================================
-- 4. BEFORE UPDATE TRIGGER — real immutable-field enforcement
-- ==============================================================================

-- This trigger prevents changes to user_id, court_id, total_price, and booking_range
-- regardless of RLS policy evaluation order. It allows changes to status, cancelled_at,
-- cancellation_reason, updated_at, and all other mutable columns.
CREATE OR REPLACE FUNCTION public.enforce_booking_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Booking user_id is immutable';
    END IF;
    IF NEW.court_id IS DISTINCT FROM OLD.court_id THEN
        RAISE EXCEPTION 'Booking court_id is immutable';
    END IF;
    IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
        RAISE EXCEPTION 'Booking total_price is immutable';
    END IF;
    IF NEW.booking_range IS DISTINCT FROM OLD.booking_range THEN
        RAISE EXCEPTION 'Booking booking_range is immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_immutable_fields ON public.bookings;
CREATE TRIGGER trg_booking_immutable_fields
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_booking_immutable_fields();

-- ==============================================================================
-- ROLLBACK (run only if this migration needs to be reverted):
--
-- DROP TRIGGER IF EXISTS trg_booking_immutable_fields ON public.bookings;
-- DROP FUNCTION IF EXISTS public.enforce_booking_immutable_fields();
--
-- DROP POLICY IF EXISTS "Users update own bookings" ON public.bookings;
-- CREATE POLICY "Users update own bookings" ON public.bookings
--     FOR UPDATE
--     USING (user_id = auth.uid())
--     WITH CHECK (user_id = auth.uid());
--
-- DROP POLICY IF EXISTS "Users view own bookings" ON public.bookings;
-- CREATE POLICY "Users view own bookings" ON public.bookings
--     FOR SELECT USING (user_id = auth.uid());
--
-- DROP POLICY IF EXISTS "Users create own bookings" ON public.bookings;
-- DROP POLICY IF EXISTS "Users can insert own bookings" ON public.bookings;
-- DROP POLICY IF EXISTS "Authenticated users can create their own bookings" ON public.bookings;
-- CREATE POLICY "Authenticated users can create their own bookings" ON public.bookings
--     FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users can insert own bookings" ON public.bookings
--     FOR INSERT WITH CHECK (auth.uid() = user_id);
-- ==============================================================================
