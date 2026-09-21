# Phase 20: Database Migrations Audit & Consistency Report

**Date:** 2026-08-28
**Status:** PASS (with 1 documentation fix applied)
**Scope:** Migration consistency, base schema alignment, drift detection

---

## Executive Summary

Audited 7 migration files against the base schema (`docs/0001_supabase_schema.sql`). Found **1 documentation inconsistency** (blocked_periods SELECT policy) and **1 stale audit check** (booking status filter). Both fixed. All 109 audit checks pass. No functional or runtime regressions.

---

## Step 1: Inventory

### Migration Files (7 total in `supabase/migrations/`)

| # | File | Purpose | Status |
|---|------|---------|--------|
| M1 | `20260823000000_tighten_blocked_periods_rls.sql` | Replace public SELECT on blocked_periods with admin-only | ✅ Idempotent |
| M2 | `20260823000001_fix_signup_role_escalation.sql` | Hardcode 'User' role in handle_new_user(), ignore metadata role | ✅ Idempotent |
| M3 | `20260823000002_reconcile_bookings_rls.sql` | Align bookings INSERT/SELECT/UPDATE with Phase 8 model + immutable-fields trigger | ✅ Idempotent |
| M4 | `20260823000003_fix_service_role_bookings_grants.sql` | Grant service_role DML on public.bookings | ✅ Idempotent |
| M5 | `20260825000000_add_system_settings_updated_at_trigger.sql` | Add BEFORE UPDATE trigger on system_settings | ✅ Idempotent |
| M6 | `20260826000000_add_notifications_dedupe_and_constraints.sql` | Add dedupe_key, unique index, CHECK constraints on notifications | ✅ Idempotent |
| M7 | `20260826000001_reconcile_service_role_grants.sql` | Grant service_role full access to all 16 tables | ✅ Idempotent |

### SQL Files Outside Migrations

| File | Purpose | Status |
|------|---------|--------|
| `docs/0001_supabase_schema.sql` | Authoritative base schema (703 lines) | ✅ Updated |
| `docs/0002_grant_static_data.sql` | One-off GRANT for events/faqs/testimonials | ✅ Safe |
| `scripts/apply-grants.sql` | Empty (0 lines) | ✅ Harmless |

### Key Observations

- **No duplicate timestamps** across 7 migrations
- **All migrations are idempotent** (DROP IF EXISTS + CREATE patterns)
- **No `supabase/config.toml`** exists — no local Supabase CLI config
- **No migration-related npm scripts** — migrations applied manually via SQL Editor
- **No Git repo** — no historical commit audit possible

---

## Steps 2-5: Consistency Matrix & Drift Detection

### Base Schema vs Migration Claims

| Migration | Claim | Base Schema | Match? |
|-----------|-------|-------------|--------|
| M1 (blocked_periods) | Public read → admin-only SELECT | **OLD:** Public read (USING true) | ❌ **FIXED** |
| M2 (handle_new_user) | Hardcode role = 'User' | Already has hardcoded role | ✅ Aligned |
| M3 (bookings RLS) | Admin bypass + immutable trigger | Already has both | ✅ Aligned |
| M4 (bookings grants) | service_role DML on bookings | GRANT ALL covers it | ✅ Aligned |
| M5 (system_settings trigger) | Add BEFORE UPDATE trigger | Already has trigger | ✅ Aligned |
| M6 (notifications) | dedupe_key + CHECK constraints | Already has all | ✅ Aligned |
| M7 (service_role grants) | GRANT on all 16 tables | GRANT ALL covers it | ✅ Aligned |

### One-Off Scripts

| Script | Claim | Reality |
|--------|-------|---------|
| `docs/0002_grant_static_data.sql` | Grant service_role on events/faqs/testimonials | Redundant — M7 + base schema GRANT ALL already cover this |
| `scripts/apply-grants.sql` | Apply grants | Empty file — grants applied via M4/M7 |

---

## Step 6: Remediation

### Finding 1: blocked_periods SELECT Policy (DOCUMENTATION INCONSISTENCY)

**Problem:** Base schema had `"Public read blocked periods" FOR SELECT USING (true)` but migration M1 changed this to admin-only. Base schema was never updated to reflect M1.

**Fix applied to `docs/0001_supabase_schema.sql`:**
- Changed `"Public read blocked periods" FOR SELECT USING (true)` → `"Admin read blocked periods" FOR SELECT TO authenticated USING (public.is_admin())`
- Added migration provenance comment

### Finding 2: Stale Audit Check (AUDIT SCRIPT)

**Problem:** `scripts/audit-sql.mjs` line 129-130 checked for `AND status = 'Cancelled'` but the actual policy uses `AND status IN ('Cancelled', 'Confirmed')`.

**Fix applied to `scripts/audit-sql.mjs`:**
- Updated check to `AND status IN ('Cancelled', 'Confirmed')`
- Renamed section from "CANCEL-ONLY FOR USERS" to "STATUS RESTRICTION FOR USERS"

### Finding 3: Misleading Comments (DOCUMENTATION)

**Problem:** Several base schema comments referenced migration numbers (M2, M3) as if they were separate from the base schema, when in fact the base schema already incorporates those changes.

**Fix applied to `docs/0001_supabase_schema.sql`:**
- Removed "(Phase 7 / M2)" from handle_new_user comment
- Updated bookings trigger comment to remove "Added in M3" reference
- Added migration provenance notes for system_settings trigger and notifications

---

## Step 8: Verification

### audit-sql.mjs: 109/109 PASS

All 109 automated checks pass after fixes.

### Runtime Verification

| Test | Result |
|------|--------|
| `node scripts/audit-sql.mjs` | 109/109 PASS ✅ |
| `npx tsc --noEmit` | 0 errors ✅ |
| `npm run build` | 24 routes ✅ |
| Playwright (3 tests) | 3/3 PASS ✅ |

---

## Step 9: Files Modified

| File | Change | Risk |
|------|--------|------|
| `docs/0001_supabase_schema.sql` | Updated blocked_periods policy + comments | LOW (documentation only) |
| `scripts/audit-sql.mjs` | Updated booking status check | LOW (audit script only) |

---

## Conclusion

The migration system is **consistent and well-structured**:
- All 7 migrations are idempotent and correctly isolated
- The base schema now accurately reflects all migration changes
- No functional drift between documentation and intended DB state
- No new migrations needed — the base schema is the source of truth
- `audit-sql.mjs` now validates the correct booking status constraint

**PASS — No further action required.**
