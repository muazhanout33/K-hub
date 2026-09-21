-- ============================================================================
-- Migration: 20260903000001_grant_profiles_select_to_anon_authenticated
--
-- Purpose: Grant SELECT on profiles table to anon and authenticated roles.
--
-- Root cause: The base schema (docs/0001_supabase_schema.sql, line 693) declares
--   `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;`
--   but this statement was never applied as a migration to the live database.
--   Only incremental migrations were applied. As a result:
--   - profiles RLS SELECT policies exist (created by 20260903000000)
--   - But PostgreSQL denies access at the table level before RLS is evaluated
--   - Error: "permission denied for table profiles"
--
-- Fix: Explicit GRANT SELECT on profiles to anon and authenticated.
--
-- Scope: profiles table ONLY (smallest safe fix for Phase 22.14.1).
--
-- Safety:
--   - No schema changes, no RLS changes
--   - GRANT statements are idempotent in PostgreSQL
--   - Profiles already has RLS policies for row-level security
--   - This is the minimal table-level permission needed
-- ============================================================================

-- Grant SELECT on profiles to anon (for public read access via RLS)
GRANT SELECT ON public.profiles TO anon;

-- Grant SELECT on profiles to authenticated (for authenticated read access via RLS)
GRANT SELECT ON public.profiles TO authenticated;
