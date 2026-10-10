-- ==============================================================================
-- Migration: 20261009000001_make_bookings_user_id_nullable
-- Description: Manual/walk-in bookings (Admin Dashboard) must reference no
--              customer account. bookings.user_id drops NOT NULL so an admin
--              can insert a booking for a walk-in customer with only the
--              denormalized contact snapshot (user_name/user_email/user_phone).
--
-- Design (C1/C2 audit, docs/c1c2-manual-booking-audit.md — approved):
--   * Existing customer → user_id = profiles.id (FK still enforced).
--   * Walk-in customer  → user_id = NULL; contact fields carry the snapshot.
--   * RLS unchanged: all three booking policies are NULL-safe
--     (auth.uid() = NULL → NULL → denied/invisible for non-admins;
--      is_admin() still grants full access).
--   * prevent_double_booking and the immutable-fields trigger are
--     user_id-independent and remain untouched.
--   * ON DELETE RESTRICT continues to protect profiles that own bookings;
--     NULL rows have no FK and are unaffected.
--
-- Safety: single ALTER COLUMN; no rewrite, no backfill (existing rows keep
-- NOT NULL semantics implicitly). Reversible with SET NOT NULL while no
-- NULL rows exist. NOT applied to production by this file's creation.
-- ==============================================================================

ALTER TABLE public.bookings ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN public.bookings.user_id IS
    'Owning customer account (profiles.id). NULL = walk-in/manual booking created by an admin; customer identity lives in user_name/user_email/user_phone.';
