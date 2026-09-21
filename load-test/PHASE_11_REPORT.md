# Phase 11 — `updated_at` Audit Final Report

**Date:** 2026-08-25
**Auditor:** AI (Claude)
**Scope:** Automatic `updated_at` maintenance across all Supabase/PostgreSQL tables

---

## A. Objective

Audit and correctly implement automatic `updated_at` maintenance across every Supabase table that carries an `updated_at` column. Guarantee:
- INSERT → `updated_at = creation timestamp` (DEFAULT NOW())
- UPDATE → `updated_at = current timestamp` (BEFORE UPDATE trigger)
- DB is authoritative source; app code must NOT manually set `updated_at`

---

## B. Files Examined

| File | Purpose |
|------|---------|
| `docs/0001_supabase_schema.sql` (651 lines) | Authoritative schema — table DDL, functions, triggers |
| `supabase/migrations/20260823000000_tighten_blocked_periods_rls.sql` | RLS migration — no updated_at changes |
| `supabase/migrations/20260823000001_fix_signup_role_escalation.sql` | Auth fix — replaces handle_new_user(), no updated_at changes |
| `supabase/migrations/20260823000002_reconcile_bookings_rls.sql` | Bookings RLS + immutable fields trigger — no updated_at changes |
| `supabase/migrations/20260823000003_fix_service_role_bookings_grants.sql` | Grants fix — no updated_at changes |
| `src/lib/mappers.ts` (411 lines) | App↔DB mappers — verified all omit updated_at |
| `src/services/payment.service.ts` | Client-side store updates only — no DB writes of updated_at |
| `src/services/sponsorship.service.ts` | Client-side store updates only |
| `src/services/advertisement.service.ts` | Client-side store updates only |
| `src/features/booking/useBookingStore.ts` | Optimistic UI updates only |
| `src/types/database.types.ts` | TypeScript type definitions |
| `src/db/schema.ts` | Drizzle ORM schema |

---

## C. Tables with `updated_at` Column

| # | Table | Column | Default | Trigger |
|---|-------|--------|---------|---------|
| 1 | `profiles` | `TIMESTAMPTZ NOT NULL` | `DEFAULT NOW()` | `tr_profiles_updated_at` ✅ |
| 2 | `courts` | `TIMESTAMPTZ NOT NULL` | `DEFAULT NOW()` | `tr_courts_updated_at` ✅ |
| 3 | `bookings` | `TIMESTAMPTZ NOT NULL` | `DEFAULT NOW()` | `tr_bookings_updated_at` ✅ |
| 4 | `payments` | `TIMESTAMPTZ NOT NULL` | `DEFAULT NOW()` | `tr_payments_updated_at` ✅ |
| 5 | `events` | `TIMESTAMPTZ NOT NULL` | `DEFAULT NOW()` | `tr_events_updated_at` ✅ |
| 6 | `sponsorship_requests` | `TIMESTAMPTZ NOT NULL` | `DEFAULT NOW()` | `tr_sponsorship_requests_updated_at` ✅ |
| 7 | `advertisement_requests` | `TIMESTAMPTZ NOT NULL` | `DEFAULT NOW()` | `tr_advertisement_requests_updated_at` ✅ |
| 8 | `system_settings` | `TIMESTAMPTZ NOT NULL` | `DEFAULT NOW()` | **NONE** ❌ |

---

## D. Tables WITHOUT `updated_at` Column (Correct by Design)

| Table | Timestamp Column(s) | Why No `updated_at` Needed |
|-------|---------------------|-----------------------------|
| `blocked_periods` | `created_at` only | Immutable once created (range cannot be meaningfully edited) |
| `notifications` | `created_at` only | Immutable — read/deleted, never mutated |
| `event_registrations` | `registered_at` only | Immutable — register/delete only |
| `sponsors` | `created_at` only | Admin-managed, immutable after creation |
| `advertising_spaces` | `created_at` only | Admin-managed, immutable after creation |
| `faqs` | `created_at` only | CMS content — admin CRUD, no update tracking needed |
| `testimonials` | `created_at` only | CMS content — admin CRUD, no update tracking needed |
| `contact_submissions` | `created_at` only | Write-only — never updated after submission |

---

## E. `handle_updated_at()` Function Analysis

**Location:** `docs/0001_supabase_schema.sql:360-366`

```sql
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Assessment:** CORRECT. Sets `NEW.updated_at = NOW()` on every BEFORE UPDATE row. No issues.

**Superseded by subsequent migrations?** No — no subsequent migration replaces this function.

---

## F. Trigger Application Analysis

**Base schema applies triggers to 7 tables:**

| Trigger Name | Table |
|-------------|-------|
| `tr_profiles_updated_at` | `profiles` |
| `tr_courts_updated_at` | `courts` |
| `tr_bookings_updated_at` | `bookings` |
| `tr_payments_updated_at` | `payments` |
| `tr_events_updated_at` | `events` |
| `tr_sponsorship_requests_updated_at` | `sponsorship_requests` |
| `tr_advertisement_requests_updated_at` | `advertisement_requests` |

**Missing trigger:** `system_settings` — has `updated_at` column (line 314) but no trigger is created in the base schema or any subsequent migration.

---

## G. App Code Analysis

### G1. Mappers (DB → App)
All mappers correctly read `updated_at` from DB row and map to `updatedAt` in app type. No issues.

### G2. Mappers (App → DB)
All app-to-DB mappers correctly **omit** `updated_at` from their return types:

| Mapper | Omit Pattern |
|--------|-------------|
| `mapCourtToDbCourt` | `Omit<DbCourt, 'created_at' \| 'updated_at' \| 'deleted_at'>` |
| `mapBookingToDbBooking` | `Omit<DbBooking, 'created_at' \| 'updated_at' \| 'cancelled_at' \| 'cancellation_reason'>` |
| `mapPaymentToDbPayment` | `Omit<DbPayment, 'created_at' \| 'updated_at'>` |

This means the app never sends `updated_at` to Supabase — the DB trigger is the sole authority. ✅

### G3. Client-Side Store Updates
Zustand stores update `updatedAt` locally for optimistic UI rendering (e.g., `useBookingStore.ts` lines 307, 341, 375). These are in-memory only and do NOT write to the database. The actual DB `updated_at` is handled by the trigger. ✅

### G4. Server Actions
No server action (in `src/server-actions/`) sets `updated_at` manually. All DB writes go through mappers that omit `updated_at`. ✅

### G5. `handle_new_user()` (signup trigger)
Migration `20260823000001` replaces `handle_new_user()` to hardcode role = 'User'. The `ON CONFLICT ... DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()` correctly sets `updated_at` on conflict. This is acceptable — it's an INSERT trigger that also handles upserts. ✅

---

## H. Findings

### Finding-01: Missing `updated_at` trigger on `system_settings`

| Attribute | Value |
|-----------|-------|
| Severity | **MEDIUM** |
| Table | `system_settings` |
| Impact | UPDATEs to system_settings never advance `updated_at` — it stays at creation time forever |
| Root Cause | Base schema DDL (line 314) defines `updated_at` column but the trigger block (lines 369-388) only covers 7 tables, skipping `system_settings` |
| Evidence | `docs/0001_supabase_schema.sql` lines 310-315 (column) vs lines 369-388 (triggers — `system_settings` absent) |

### Finding-02: No other gaps found

All 7 other tables with `updated_at` have correct BEFORE UPDATE triggers. All app code correctly defers to the DB trigger. No manual `updated_at` writes found in server actions, services, or mappers.

---

## I. Fix Applied

**File:** `supabase/migrations/20260825000000_add_system_settings_updated_at_trigger.sql`

```sql
-- Idempotent trigger creation for system_settings
DROP TRIGGER IF EXISTS tr_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER tr_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
```

**Safety:**
- Idempotent (DROP IF EXISTS before CREATE)
- Does not modify `handle_updated_at()` function
- Does not touch RLS, policies, grants, or other triggers
- No data migration required
- Blast radius: LOW

---

## J. Verification Checklist

| Check | Status |
|-------|--------|
| All tables with `updated_at` column have BEFORE UPDATE trigger | ✅ (8/8 after fix) |
| `handle_updated_at()` correctly sets `NEW.updated_at = NOW()` | ✅ |
| App code does NOT manually set `updated_at` in DB writes | ✅ |
| App-to-DB mappers omit `updated_at` | ✅ |
| INSERT default (`DEFAULT NOW()`) correct on all tables | ✅ |
| No conflicting triggers or functions | ✅ |
| Migration is idempotent | ✅ |
| No RLS/auth/booking logic touched | ✅ |
| No frontend/UI changes | ✅ |

---

## K. Verdict

### **PASS WITH GAP**

The platform's `updated_at` maintenance is **functionally correct** for 7 of 8 tables. The sole gap — a missing trigger on `system_settings` — has been identified and a fix migration provided. After applying `20260825000000_add_system_settings_updated_at_trigger.sql`, all 8 tables will have correct automatic `updated_at` behavior.

**Remaining action required:** Apply the migration to the live Supabase database (manual step — cannot be automated without DB access).

---

## Summary Table

| Table | `updated_at` Column | DEFAULT NOW() | BEFORE UPDATE Trigger | Status |
|-------|---------------------|---------------|----------------------|--------|
| profiles | ✅ | ✅ | ✅ `tr_profiles_updated_at` | PASS |
| courts | ✅ | ✅ | ✅ `tr_courts_updated_at` | PASS |
| bookings | ✅ | ✅ | ✅ `tr_bookings_updated_at` | PASS |
| payments | ✅ | ✅ | ✅ `tr_payments_updated_at` | PASS |
| events | ✅ | ✅ | ✅ `tr_events_updated_at` | PASS |
| sponsorship_requests | ✅ | ✅ | ✅ `tr_sponsorship_requests_updated_at` | PASS |
| advertisement_requests | ✅ | ✅ | ✅ `tr_advertisement_requests_updated_at` | PASS |
| system_settings | ✅ | ✅ | ❌ → ✅ (migration fix) | **FIX APPLIED** |

**Phase 11 COMPLETE. Do NOT start Phase 12.**
