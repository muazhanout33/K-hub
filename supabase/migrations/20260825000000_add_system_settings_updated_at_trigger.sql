-- ============================================================================
-- Migration: 20260825000000_add_system_settings_updated_at_trigger
--
-- Purpose: Add missing updated_at trigger on system_settings table.
--
-- Root cause: The base schema (docs/0001_supabase_schema.sql) defines updated_at
--   on system_settings and creates handle_updated_at(), but applies the trigger
--   to only 7 of 8 eligible tables — system_settings was missed.
--   As a result, UPDATEs to system_settings never advance updated_at.
--
-- Fix: Apply tr_system_settings_updated_at BEFORE UPDATE trigger.
--
-- Blast radius: LOW — adds a trigger that was always intended but missing.
--   No data migration required. Existing rows are unaffected.
--
-- Safety:
--   - Idempotent: DROP IF EXISTS + CREATE TRIGGER
--   - Does not modify handle_updated_at() function
--   - Does not touch RLS, policies, grants, or other triggers
-- ============================================================================

-- 1. Ensure handle_updated_at() exists (idempotent — no-op if already present)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Apply trigger to system_settings
DROP TRIGGER IF EXISTS tr_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER tr_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS tr_system_settings_updated_at ON public.system_settings;
-- ============================================================================
