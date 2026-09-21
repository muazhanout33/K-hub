-- ============================================================================
-- Migration: 20260826000001_reconcile_service_role_grants
--
-- Purpose: Grant service_role full access to all 16 public domain tables.
--
-- Root cause: The base schema (docs/0001_supabase_schema.sql) declares
--   `GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role` (line 683),
--   but this statement was never applied as a migration to the live database.
--   Only incremental migrations were applied. As a result:
--   - 5 tables work via explicit GRANT (bookings, M4) or permissive RLS
--     (courts, events, faqs, testimonials have public SELECT policies)
--   - 11 tables return 403 (profiles, blocked_periods, payments, notifications,
--     event_registrations, sponsors, sponsorship_requests, advertising_spaces,
--     advertisement_requests, contact_submissions, system_settings)
--
-- Fix: Explicit GRANT SELECT, INSERT, UPDATE, DELETE on all 16 tables to
--   service_role. This matches the intended privilege model from the base
--   schema and enables emergency/admin operations, background jobs, and
--   test cleanup.
--
-- Scope: service_role ONLY. No changes to anon or authenticated roles.
--
-- Safety:
--   - No schema changes, no new tables, no RLS changes
--   - No function changes, no trigger changes
--   - No impact on anon/authenticated roles (they already have correct grants)
--   - service_role bypasses RLS (Supabase architecture) — these grants are
--     for table-level access, not policy-level access
--   - GRANT statements are idempotent in PostgreSQL
--   - Zero runtime impact — application uses anon key exclusively
-- ============================================================================

-- Grant full DML access to service_role on all 16 public domain tables.
-- Matching the explicit pattern from 20260823000003 for consistency.

-- 1. Profiles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

-- 2. Courts
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courts TO service_role;

-- 3. Blocked periods
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_periods TO service_role;

-- 4. Bookings (already granted by 20260823000003 — re-grant is idempotent)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO service_role;

-- 5. Payments
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO service_role;

-- 6. Notifications
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;

-- 7. Events
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO service_role;

-- 8. Event registrations
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_registrations TO service_role;

-- 9. Sponsors
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsors TO service_role;

-- 10. Sponsorship requests
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsorship_requests TO service_role;

-- 11. Advertising spaces
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advertising_spaces TO service_role;

-- 12. Advertisement requests
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advertisement_requests TO service_role;

-- 13. FAQs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faqs TO service_role;

-- 14. Testimonials
GRANT SELECT, INSERT, UPDATE, DELETE ON public.testimonials TO service_role;

-- 15. Contact submissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_submissions TO service_role;

-- 16. System settings
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO service_role;
