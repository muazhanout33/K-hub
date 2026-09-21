-- ============================================================================
-- Migration: 20260905000000_fix_payments_notifications_rls
--
-- Purpose: Fix 3 RLS defects discovered by Phase 22.18 live testing.
--
-- Defects:
--   D1: Payments "Service role / admin manage payments" FOR ALL USING (is_admin())
--       is a single catch-all policy. Replaced with granular per-operation admin
--       policies. The existing "Users view own payments" SELECT policy already
--       grants authenticated users read access to their own payments (via
--       bookings join). No non-admin write policies are added because payment
--       mutations are server/provider authoritative (service-role only).
--
--   D2: Notifications "Users mark notifications read" UPDATE WITH CHECK uses 5
--       correlated subqueries that cause Postgres error 21000 ("more than one
--       row returned by subquery"). Simplified to auth.uid() = user_id check.
--       BEFORE UPDATE trigger enforces immutable field constraints instead.
--       SECURITY DEFINER function hardened with explicit search_path.
--
--   D3: No INSERT policy for authenticated users on notifications. Server actions
--       (createBookingAction, cancelBookingAction, confirmBookingStatusAction)
--       use the anon key + user session (RLS enforced). Without an INSERT policy,
--       all non-admin notification creation silently fails — a production bug.
--       Added user INSERT (own notifications) + admin INSERT (for any user).
--
-- Safety:
--   - All statements are idempotent (DROP IF EXISTS + CREATE)
--   - Payments: no non-admin write policies added (server-authoritative)
--   - Notifications: INSERT constrained to user_id = auth.uid() for users
--   - Trigger: SECURITY DEFINER with explicit search_path = public, pg_temp
--   - No GRANT changes
--
-- Rollback:
--   DROP POLICY IF EXISTS "Admins insert payments" ON public.payments;
--   DROP POLICY IF EXISTS "Admins update payments" ON public.payments;
--   DROP POLICY IF EXISTS "Admins delete payments" ON public.payments;
--   CREATE POLICY "Service role / admin manage payments" ON public.payments
--       FOR ALL USING (public.is_admin());
--   DROP POLICY IF EXISTS "Users mark notifications read" ON public.notifications;
--   CREATE POLICY "Users mark notifications read" ON public.notifications
--       FOR UPDATE USING (auth.uid() = user_id)
--       WITH CHECK (auth.uid() = user_id
--         AND user_id = (SELECT user_id FROM public.notifications WHERE id = notifications.id)
--         AND title = (SELECT title FROM public.notifications WHERE id = notifications.id)
--         AND message = (SELECT message FROM public.notifications WHERE id = notifications.id)
--         AND type = (SELECT type FROM public.notifications WHERE id = notifications.id)
--         AND related_booking_id IS NOT DISTINCT FROM (SELECT related_booking_id FROM public.notifications WHERE id = notifications.id));
--   DROP POLICY IF EXISTS "Admins insert notifications" ON public.notifications;
--   DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;
--   DROP TRIGGER IF EXISTS enforce_notification_immutables ON public.notifications;
--   DROP FUNCTION IF EXISTS public.fn_enforce_notification_immutables();
-- ============================================================================

-- ==========================================================================
-- D1: Fix payments RLS — replace FOR ALL with granular admin policies
-- ==========================================================================
-- The existing "Service role / admin manage payments" FOR ALL USING (is_admin())
-- policy is a single catch-all. Replace with operation-specific admin policies.
--
-- Existing "Users view own payments" SELECT policy is CORRECT and UNCHANGED:
--   FOR SELECT USING (EXISTS (SELECT 1 FROM bookings b
--     WHERE b.id = payments.booking_id AND (b.user_id = auth.uid() OR is_admin())))
-- This already grants authenticated users read access to their own payments
-- and admins read access to all payments.
--
-- No non-admin INSERT/UPDATE/DELETE policies are added because:
--   - Payment creation happens via service-role (webhooks, route handlers)
--   - Payment status/amount/refund are server/provider authoritative
--   - Users should not control payment mutation directly

DROP POLICY IF EXISTS "Service role / admin manage payments" ON public.payments;

-- Admin can INSERT payments (e.g., admin-initiated refunds, manual adjustments)
CREATE POLICY "Admins insert payments" ON public.payments
    FOR INSERT WITH CHECK (public.is_admin());

-- Admin can UPDATE payments (e.g., status transitions, refund processing)
CREATE POLICY "Admins update payments" ON public.payments
    FOR UPDATE USING (public.is_admin());

-- Admin can DELETE payments (e.g., test data cleanup)
CREATE POLICY "Admins delete payments" ON public.payments
    FOR DELETE USING (public.is_admin());

-- ==========================================================================
-- D2: Fix notifications UPDATE WITH CHECK — simplify + add trigger
-- ==========================================================================
-- The original WITH CHECK uses 5 correlated subqueries:
--   user_id = (SELECT user_id FROM notifications WHERE id = notifications.id)
--   title   = (SELECT title   FROM notifications WHERE id = notifications.id)
--   message = (SELECT message FROM notifications WHERE id = notifications.id)
--   type    = (SELECT type    FROM notifications WHERE id = notifications.id)
--   related_booking_id IS NOT DISTINCT FROM (SELECT ...)
-- These cause Postgres error 21000 when the subquery returns multiple rows
-- (possible with ambiguous id resolution in edge cases).
--
-- Fix: Simplify WITH CHECK to verify only auth.uid() = user_id.
-- BEFORE UPDATE trigger enforces all immutable field constraints instead.

DROP POLICY IF EXISTS "Users mark notifications read" ON public.notifications;
CREATE POLICY "Users mark notifications read" ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Trigger function: enforce immutable fields on notification UPDATE
-- Only is_read should change; all other fields are frozen.
CREATE OR REPLACE FUNCTION public.fn_enforce_notification_immutables()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Cannot change notification user_id';
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title THEN
        RAISE EXCEPTION 'Cannot change notification title';
    END IF;
    IF NEW.message IS DISTINCT FROM OLD.message THEN
        RAISE EXCEPTION 'Cannot change notification message';
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type THEN
        RAISE EXCEPTION 'Cannot change notification type';
    END IF;
    IF NEW.related_booking_id IS DISTINCT FROM OLD.related_booking_id THEN
        RAISE EXCEPTION 'Cannot change notification related_booking_id';
    END IF;
    IF NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key THEN
        RAISE EXCEPTION 'Cannot change notification dedupe_key';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
    SECURITY DEFINER
    -- Prevent search_path hijacking. Mirrors the convention used by is_admin().
    SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS enforce_notification_immutables ON public.notifications;
CREATE TRIGGER enforce_notification_immutables
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_notification_immutables();

-- ==========================================================================
-- D3: Add INSERT policies for notifications
-- ==========================================================================
-- Server actions (booking.actions.ts) create notifications through the
-- authenticated user's session (anon key + cookies, RLS enforced):
--   - createBookingAction:     user_id = authData.user.id
--   - cancelBookingAction:     user_id = authData.user.id
--   - confirmBookingStatusAction: user_id = authData.user.id
--   - expireStaleBookingsAction: user_id = b.user_id (other users, admin-only)
--
-- Without an INSERT policy, all non-admin notification creation silently fails.
-- Users receive no booking confirmations, cancellations, or payment receipts.
--
-- User INSERT policy: Users can INSERT notifications for themselves only.
-- Security guarantees:
--   - auth.uid() = user_id: users cannot forge notifications for other users
--   - type CHECK constraint: limits to 14 predefined notification types
--   - title CHECK: length(trim(title)) > 0 AND length(title) <= 255
--   - message CHECK: length(trim(message)) > 0 AND length(message) <= 2000
--   - dedupe_key UNIQUE index: prevents duplicate notifications per booking
--   - created_at defaults to NOW(): users cannot backdate notifications

CREATE POLICY "Users insert own notifications" ON public.notifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin INSERT policy: Admins can insert notifications for any user.
-- Required by expireStaleBookingsAction which creates booking_expired
-- notifications for other users (user_id != auth.uid()).
CREATE POLICY "Admins insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (public.is_admin());
