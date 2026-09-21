# Phase 21 — Seed Data Audit & Consistency Report

**Date:** 2026-08-28
**Status:** COMPLETE
**Auditor:** opencode (automated)
**Environment:** `D:\k-hub-booking-platform`

---

## Executive Summary

Seed data for the K-Hub Sports Club Booking Platform comes from **5 distinct sources** across the codebase. Audit identified **4 findings** — 2 MEDIUM, 1 LOW, 1 informational — all remediable via manual SQL. No automated fix applied (live DB).

---

## 1. Data Source Inventory

| # | Source | Type | Table(s) Affected | Keys |
|---|--------|------|-------------------|------|
| 1 | `scripts/seed-courts.mjs` | Seed script | `courts` | Deterministic UUIDs |
| 2 | `scripts/seed-static-data.mjs` | Seed script | `events`, `faqs`, `testimonials` | `randomUUID()` per run |
| 3 | `src/lib/mock-data.ts` | Client mock | None (UI display) | N/A |
| 4 | `src/lib/mock-users.ts` | Client mock auth | None (UI display) | N/A |
| 5 | `docs/0001_supabase_schema.sql` | Schema DDL | All tables (DDL only) | N/A |

### Non-source items
| Item | Reason excluded |
|------|----------------|
| `scripts/apply-grants.sql` | Empty file (0 bytes) |
| `docs/0002_grant_static_data.sql` | Redundant copy of Phase 20.2 GRANTs (not seed) |
| Migration files (7) | Schema-only DDL, no data INSERTs |
| `test-double-booking.ts` | Test script, not seed — cleans up after itself |

---

## 2. Classification

| Source | Classification | Schema Compatible | Notes |
|--------|---------------|-------------------|-------|
| `seed-courts.mjs` | Production seed (upsert) | ✅ Yes | Deterministic UUIDs, correct upsert |
| `seed-static-data.mjs` | Production seed (BUGGY) | ⚠️ Schema OK, but `randomUUID()` causes duplicates | Each run creates new rows |
| `mock-data.ts` | Development fixture (UI) | ✅ N/A | No DB interaction |
| `mock-users.ts` | Development fixture (auth) | ✅ N/A | No DB interaction |
| `0001_supabase_schema.sql` | Schema definition | ✅ Yes | Authoritative DDL |

---

## 3. Live Row Counts

| Table | Count | Expected |
|-------|-------|----------|
| `profiles` | 22 | Auth users (real data) |
| `courts` | 6 | 6 seed courts ✅ |
| `blocked_periods` | 0 | — |
| `bookings` | 39 | Includes 14 test bookings ⚠️ |
| `payments` | 0 | — |
| `notifications` | 31 | Real app-generated |
| `events` | 6 | 3 unique × 2 (duplicate) ⚠️ |
| `event_registrations` | 0 | — |
| `sponsors` | 0 | — |
| `sponsorship_requests` | 0 | — |
| `advertising_spaces` | 0 | — |
| `advertisement_requests` | 0 | — |
| `faqs` | 10 | 5 unique × 2 (duplicate) ⚠️ |
| `testimonials` | 6 | 3 unique × 2 (duplicate) ⚠️ |
| `contact_submissions` | 0 | — |
| `system_settings` | 0 | — |

---

## 4. Findings

### Finding 1 — Duplicate Static Data (MEDIUM)

**Root cause:** `seed-static-data.mjs` uses `randomUUID()` for primary keys. Each execution creates entirely new rows. Seed was run **2×**, producing exact duplicates.

**Affected tables:**
- `events`: 6 rows → 3 unique (all duplicated by title)
- `faqs`: 10 rows → 5 unique (all duplicated by question)
- `testimonials`: 6 rows → 3 unique (all duplicated by name)

**Impact:** Duplicate static content visible to end users. No functional breakage, but UI shows repeated entries.

**Remediation SQL:**
```sql
-- Delete duplicate events (keep lowest-id of each title)
DELETE FROM public.events
WHERE id NOT IN (
  SELECT MIN(id) FROM public.events GROUP BY title
);

-- Delete duplicate FAQs (keep lowest-id of each question)
DELETE FROM public.faqs
WHERE id NOT IN (
  SELECT MIN(id) FROM public.faqs GROUP BY question
);

-- Delete duplicate testimonials (keep lowest-id of each name)
DELETE FROM public.testimonials
WHERE id NOT IN (
  SELECT MIN(id) FROM public.testimonials GROUP BY name
);
```

---

### Finding 2 — Test Booking Pollution (MEDIUM)

**Root cause:** Phase 9 test scripts (`phase9-*.ts`, `test-double-booking.ts`) inserted bookings into the live DB. `test-double-booking.ts` has cleanup (`LIKE 'KH-TEST-%'`) but other scripts do not.

**Affected data:**
- 14 bookings with `booking_number LIKE 'KH-TEST-%'`
- 11 bookings with 'test' in `user_name` (emails: `@khub-test.com`, `@test.com`)

**Impact:** Test data visible to real users in booking lists. No security risk (no real user data exposed), but unprofessional UI.

**Remediation SQL:**
```sql
-- Remove test bookings by number prefix
DELETE FROM public.bookings
WHERE booking_number LIKE 'KH-TEST-%';

-- Remove test bookings by email domain
DELETE FROM public.bookings
WHERE user_email LIKE '%@khub-test.com'
   OR user_email LIKE '%@test.com';
```

**Cleanup notifications for deleted test bookings:**
```sql
-- Remove notifications with no matching booking (orphaned by test cleanup)
DELETE FROM public.notifications
WHERE booking_id IS NOT NULL
  AND booking_id NOT IN (SELECT id FROM public.bookings);
```

---

### Finding 3 — No `supabase/seed.sql` (LOW)

**Root cause:** No `supabase/seed.sql` file exists. Seed scripts are standalone Node.js files not wired into any standard `npm run seed` script or `package.json`.

**Impact:** New developers must discover and manually run `scripts/seed-courts.mjs` and `scripts/seed-static-data.mjs`. No single-command seed workflow.

**Remediation:** None required for correctness. Recommended improvement for developer experience.

---

### Finding 4 — Test Passwords in Script Source (LOW / Informational)

**Root cause:** Multiple Phase 9 test scripts contain hardcoded test passwords (`'DefA123!'`, `'XUA123!'`, `'Admin123!'`, etc.). These are used for `admin.auth.admin.createUser()` — they create test users in Supabase Auth, not hardcoded accounts.

**Files affected:**
- `scripts/phase9-definitive-test.ts` — 4 hardcoded passwords
- `scripts/phase9-rls-diagnostic.ts` — 4 hardcoded passwords
- `scripts/phase9-pre-fix-diag.ts` — 5 hardcoded passwords
- `scripts/phase9-post-migration-verify.ts` — 6 hardcoded passwords
- `scripts/phase4a-runtime-verify.ts` — `'password123'` in test

**`src/lib/mock-users.ts`:** Contains `'password123'` and `'admin456'` — but these are **mock-only** (in-memory auth store, no DB interaction). Low risk, clearly labeled as mock.

**Impact:** Test passwords in source code are not a security risk (they're for test scripts, not production accounts), but they could be confused for real credentials.

**Remediation:** None required for security. Recommended: add `// TEST ONLY` comments to mock-users.ts, or remove test scripts from production repository.

---

## 5. Verification

After applying the remediation SQL (Finding 1 + 2), expected row counts:

| Table | Before | After | Change |
|-------|--------|-------|--------|
| `events` | 6 | 3 | -3 duplicates |
| `faqs` | 10 | 5 | -5 duplicates |
| `testimonials` | 6 | 3 | -3 duplicates |
| `bookings` | 39 | ~14 | -25 test rows |
| `notifications` | 31 | ~0-31 | Depends on orphaned refs |

**To verify:** Re-run `load-test/phase21-row-counts-sr.mjs` after applying the SQL.

---

## 6. Recommendations

| # | Priority | Recommendation |
|---|----------|----------------|
| 1 | HIGH | Apply dedup SQL to remove duplicate static data (Finding 1) |
| 2 | HIGH | Apply cleanup SQL to remove test bookings (Finding 2) |
| 3 | MEDIUM | Fix `seed-static-data.mjs` to use `ON CONFLICT` upsert (not `randomUUID()`) |
| 4 | LOW | Add `npm run seed` script to `package.json` for discoverability |
| 5 | LOW | Remove or archive Phase 9 test scripts if no longer needed |
| 6 | INFO | `mock-users.ts` is safe — isolated to in-memory auth, no DB |

---

## 7. Migration History

No migrations contain data INSERTs. All 7 migration files are pure DDL (table creation, constraints, policies, functions, triggers, grants).

---

## 8. Schema Compatibility

All seed scripts reference columns that exist in the current schema:

| Script | Table | Columns Referenced | Schema Match |
|--------|-------|--------------------|--------------|
| `seed-courts.mjs` | `courts` | id, name, sport_type, description, price_per_hour, image_url, status | ✅ |
| `seed-static-data.mjs` | `events` | id, title, description, event_date, location, image_url | ✅ |
| `seed-static-data.mjs` | `faqs` | id, question, answer, category, display_order | ✅ |
| `seed-static-data.mjs` | `testimonials` | id, name, role, content, rating | ✅ |

---

## Appendix: Files Read

| File | Lines | Purpose |
|------|-------|---------|
| `scripts/seed-courts.mjs` | 202 | Court seed script |
| `scripts/seed-static-data.mjs` | 141 | Static data seed script |
| `scripts/apply-grants.sql` | 0 | Empty file |
| `docs/0001_supabase_schema.sql` | 703 | Authoritative base schema |
| `docs/0002_grant_static_data.sql` | ~20 | Redundant GRANT SQL |
| `src/lib/mock-data.ts` | ~150 | Client-side mock data |
| `src/lib/mock-users.ts` | ~50 | Mock users (in-memory) |
| `scripts/test-double-booking.ts` | 533 | Test script (with cleanup) |
| `scripts/phase9-*.ts` (5 files) | ~2000 | Phase 9 test scripts |
| `scripts/phase4a-runtime-verify.ts` | ~120 | Phase 4 test script |

---

*Report generated by opencode — Phase 21 Seed Data Audit*
