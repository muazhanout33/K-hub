-- ============================================================
-- Phase 21.1 — SAFE Cleanup SQL (v2 — Natural-Key Deduplication)
-- Generated: 2026-08-28
--
-- DRY-RUN VERIFIED (read-only, no DB modifications):
--   events:        6 rows, 2 per title   → delete 3, keep 3
--   faqs:         10 rows, 2 per question → delete 5, keep 5
--   testimonials:  6 rows, 2 per name     → delete 3, keep 3
--   bookings:     39 rows (32 test + 7 real) → delete 32, keep 7
--
-- PREREQUISITE: Run Sections 1-3 BEFORE seed script.
--   The seed's natural-key algorithm SKIPS items with >1 duplicate.
--   After deduplication (1 row per natural key), seed will UPDATE them.
--
-- RULES:
--   - No DELETE ALL statements
--   - SELECT verification before every DELETE
--   - Targets ONLY proven duplicate/test rows
--   - Does NOT touch auth.users
--   - Does NOT modify RLS/schema/migrations
--   - Does NOT auto-execute
--
-- HOW TO RUN:
--   1. Run each SECTION's SELECT first — verify the rows
--   2. If the preview looks correct, run the DELETE in that section
--   3. Run: node scripts/seed-static-data.mjs
--   4. Run the VERIFY section at the end
-- ============================================================


-- ============================================================
-- SECTION 1: DELETE DUPLICATE EVENTS
--
-- Strategy: Keep one row per title (the oldest by created_at).
-- Delete the rest. This preserves exactly 3 events.
--
-- Current state: 6 rows (3 titles x 2 copies each)
-- Target state: 3 rows (1 per title)
-- ============================================================

-- PREVIEW: rows to KEEP (1 per title, oldest created_at)
SELECT id, title, event_date, created_at
FROM public.events
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY title ORDER BY created_at ASC) AS rn
    FROM public.events
  ) ranked WHERE rn = 1
)
ORDER BY title;

-- PREVIEW: rows to DELETE (duplicates)
SELECT id, title, event_date, created_at
FROM public.events
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY title ORDER BY created_at ASC) AS rn
    FROM public.events
  ) ranked WHERE rn = 1
)
ORDER BY title, created_at;

-- EXECUTE: delete duplicates (keep oldest per title)
DELETE FROM public.events
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY title ORDER BY created_at ASC) AS rn
    FROM public.events
  ) ranked WHERE rn = 1
);

-- VERIFY
SELECT id, title, event_date, created_at FROM public.events ORDER BY title;
-- Expected: 3 rows, one per title


-- ============================================================
-- SECTION 2: DELETE DUPLICATE FAQs
--
-- Strategy: Keep one row per question (the oldest by created_at).
-- Delete the rest. This preserves exactly 5 FAQs.
--
-- Current state: 10 rows (5 questions x 2 copies each)
-- Target state: 5 rows (1 per question)
-- ============================================================

-- PREVIEW: rows to KEEP
SELECT id, question, category, display_order, created_at
FROM public.faqs
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY question ORDER BY created_at ASC) AS rn
    FROM public.faqs
  ) ranked WHERE rn = 1
)
ORDER BY display_order;

-- PREVIEW: rows to DELETE
SELECT id, question, category, display_order, created_at
FROM public.faqs
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY question ORDER BY created_at ASC) AS rn
    FROM public.faqs
  ) ranked WHERE rn = 1
)
ORDER BY question;

-- EXECUTE: delete duplicates
DELETE FROM public.faqs
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY question ORDER BY created_at ASC) AS rn
    FROM public.faqs
  ) ranked WHERE rn = 1
);

-- VERIFY
SELECT id, question, category, display_order FROM public.faqs ORDER BY display_order;
-- Expected: 5 rows, one per question


-- ============================================================
-- SECTION 3: DELETE DUPLICATE TESTIMONIALS
--
-- Strategy: Keep one row per name (the oldest by created_at).
-- Delete the rest. This preserves exactly 3 testimonials.
--
-- Current state: 6 rows (3 names x 2 copies each)
-- Target state: 3 rows (1 per name)
-- ============================================================

-- PREVIEW: rows to KEEP
SELECT id, name, role, rating, created_at
FROM public.testimonials
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) AS rn
    FROM public.testimonials
  ) ranked WHERE rn = 1
)
ORDER BY name;

-- PREVIEW: rows to DELETE
SELECT id, name, role, rating, created_at
FROM public.testimonials
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) AS rn
    FROM public.testimonials
  ) ranked WHERE rn = 1
)
ORDER BY name;

-- EXECUTE: delete duplicates
DELETE FROM public.testimonials
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) AS rn
    FROM public.testimonials
  ) ranked WHERE rn = 1
);

-- VERIFY
SELECT id, name, role, rating FROM public.testimonials ORDER BY name;
-- Expected: 3 rows, one per name


-- ============================================================
-- SECTION 4: DELETE TEST BOOKINGS — @khub-test.com
--
-- 14 rows. All have KH-TEST- booking numbers and @khub-test.com
-- emails. No notifications or payments reference these.
--
-- LEGITIMATE DATA: None. Real user is muazagency@gmail.com.
-- ============================================================

-- PREVIEW: rows to DELETE
SELECT id, booking_number, user_email, user_name, status
FROM public.bookings
WHERE user_email LIKE '%@khub-test.com'
ORDER BY user_name;

-- EXECUTE
DELETE FROM public.bookings
WHERE user_email LIKE '%@khub-test.com';

-- VERIFY
SELECT COUNT(*) AS remaining FROM public.bookings;
-- Expected: 25 (39 - 14)


-- ============================================================
-- SECTION 5: DELETE TEST BOOKINGS — @test.com
--
-- 18 rows. All have test-pattern booking numbers and @test.com
-- emails. No notifications or payments reference these.
--
-- LEGITIMATE DATA: None. Real user is muazagency@gmail.com.
-- ============================================================

-- PREVIEW: rows to DELETE
SELECT id, booking_number, user_email, user_name, status
FROM public.bookings
WHERE user_email LIKE '%@test.com'
ORDER BY user_name;

-- EXECUTE
DELETE FROM public.bookings
WHERE user_email LIKE '%@test.com';

-- VERIFY
SELECT id, booking_number, user_email, user_name, status
FROM public.bookings
ORDER BY created_at;
-- Expected: 7 rows — all muazagency@gmail.com bookings preserved


-- ============================================================
-- SECTION 6: DELETE ORPHANED NOTIFICATIONS
--
-- After Sections 4+5, notifications referencing deleted booking
-- IDs become orphaned. The NOT EXISTS subquery correctly
-- identifies only truly orphaned rows.
--
-- SAFETY: If a notification's booking still exists, it is
-- preserved regardless of whether the booking is test or real.
-- ============================================================

-- PREVIEW: orphaned notifications
SELECT n.id, n.booking_id, n.title, n.type
FROM public.notifications n
WHERE n.booking_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = n.booking_id
  );

-- EXECUTE
DELETE FROM public.notifications n
WHERE n.booking_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = n.booking_id
  );

-- VERIFY
SELECT COUNT(*) AS remaining FROM public.notifications;


-- ============================================================
-- SECTION 7: FINAL VERIFICATION
-- Run after all sections above AND after:
--   node scripts/seed-static-data.mjs
-- ============================================================

-- Uncomment and run AFTER seed script:
-- SELECT 'events' AS tbl, COUNT(*) AS cnt FROM public.events
-- UNION ALL SELECT 'faqs', COUNT(*) FROM public.faqs
-- UNION ALL SELECT 'testimonials', COUNT(*) FROM public.testimonials
-- UNION ALL SELECT 'bookings', COUNT(*) FROM public.bookings
-- UNION ALL SELECT 'notifications', COUNT(*) FROM public.notifications
-- ORDER BY tbl;
--
-- Expected:
--   events:            3 (deduplicated, then updated by seed)
--   faqs:              5 (deduplicated, then updated by seed)
--   testimonials:      3 (deduplicated, then updated by seed)
--   bookings:          7 (39 - 14 @khub-test.com - 18 @test.com)
--   notifications:    variable (orphaned ones removed)
--
-- NOTE: Row counts stay the same after seed script runs.
-- The seed UPDATES existing rows, never INSERTs new ones.
