-- Migration: Fix signup role escalation (Phase 7 Finding-01)
-- Problem: handle_new_user() trusts raw_user_meta_data->>'role' for initial
--          role assignment. A malicious client calling signUp() with
--          data: { role: 'Admin' } would receive Admin role.
-- Fix: Hardcode 'User' as the only possible signup role.
--      Auth metadata role is completely ignored.
-- Blast radius: LOW — only affects the COALESCE line in handle_new_user().
--   No data migration required. Existing profiles are unchanged.
-- Rollback: See rollback section at bottom.

-- 1. Replace handle_new_user() with version that ignores metadata role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        phone_number,
        avatar_url,
        role
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.id::TEXT),
        COALESCE(NEW.email, NEW.id::TEXT),
        NEW.raw_user_meta_data->>'phone_number',
        NEW.raw_user_meta_data->>'avatar_url',
        'User'::user_role_enum
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- ROLLBACK (run only if this migration needs to be reverted):
--
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     INSERT INTO public.profiles (
--         id, full_name, email, phone_number, avatar_url, role
--     )
--     VALUES (
--         NEW.id,
--         COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.id::TEXT),
--         COALESCE(NEW.email, NEW.id::TEXT),
--         NEW.raw_user_meta_data->>'phone_number',
--         NEW.raw_user_meta_data->>'avatar_url',
--         COALESCE((NEW.raw_user_meta_data->>'role')::user_role_enum, 'User'::user_role_enum)
--     )
--     ON CONFLICT (id) DO UPDATE SET
--         email = EXCLUDED.email,
--         updated_at = NOW();
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- ============================================================================
