-- ==============================================================================
-- Local-dev seed (synthetic data ONLY — never production data).
-- Runs after migrations on `supabase db reset` / first init.
-- Minimum required for manual-booking validation: courts (bookings FK target).
-- Auth users/profiles are created via the local GoTrue API + profile trigger,
-- not via SQL.
-- ==============================================================================

INSERT INTO public.courts (
    id, name, sport_type, surface, is_indoor, capacity,
    price_per_hour, image_url, status,
    working_hours_open, working_hours_close, slot_duration_minutes
) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Local Test Court A', 'Football', 'Grass',   true,  10, 500.00, 'https://example.invalid/court-a.png', 'Available', '00:00:00', '23:59:59', 60),
    ('00000000-0000-0000-0000-000000000002', 'Local Test Court B', 'Tennis',   'Hard',    false,  4, 300.00, 'https://example.invalid/court-b.png', 'Available', '00:00:00', '23:59:59', 60)
ON CONFLICT (id) DO NOTHING;
