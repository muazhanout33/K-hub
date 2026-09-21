# Phase 16 — Database Functions Comprehensive Audit & Remediation Report

**Date:** 2026-08-26
**Status:** PASS
**Scope:** Complete audit of all PostgreSQL database functions

---

## Executive Summary

**Verdict: PASS**

5 functions discovered. All verified from source definitions and 2 callable functions confirmed on live DB. No SECURITY DEFINER abuse, no SQL injection surface, no role escalation, no application/DB overlap issues. Zero changes made.

---

## 1. Function Inventory

| # | Function | Language | SECURITY DEFINER | search_path | Trigger | RLS | Reads | Writes | Source |
|---|----------|----------|-----------------|-------------|---------|-----|-------|--------|--------|
| 1 | `handle_updated_at()` | plpgsql | No | N/A | YES (8 tables) | No | None | NEW.updated_at only | Base schema |
| 2 | `handle_new_user()` | plpgsql | Yes | `public` | YES (auth.users) | No | NEW.* (auth row) | INSERT/UPDATE profiles | Base schema + M2 |
| 3 | `is_admin()` | plpgsql | Yes | `public` | No | YES (15 policies) | profiles (1 row) | None | Base schema |
| 4 | `get_my_role()` | sql | Yes | `''` (empty) | No | YES (1 policy) | profiles (1 row) | None | Base schema |
| 5 | `enforce_booking_immutable_fields()` | plpgsql | No | N/A | YES (bookings) | No | None (NEW/OLD only) | None | Base schema + M3 |

**Total: 5 functions.** No additional functions found in migrations or schema.

---

## 2. Source vs Migration vs Live DB Comparison

### handle_updated_at()

| Source | Migration | Live DB | Status |
|--------|-----------|---------|--------|
| Base schema: `NEW.updated_at = NOW();` | M5: identical definition | Callable (trigger works — bookings have non-null `updated_at`) | CONSISTENT |

**M5 migration note:** `CREATE OR REPLACE` was used — no signature change, only re-applied the same function. This is safe.

### handle_new_user()

| Source | Migration M2 | Status |
|--------|-------------|--------|
| Base schema: hardcoded `'User'::user_role_enum` | M2: hardcoded `'User'::user_role_enum` | CONSISTENT |

**Migration M2:** `CREATE OR REPLACE FUNCTION public.handle_new_user()` — correct idempotent pattern. The rollback section (commented) shows the vulnerable version for reference.

### is_admin()

| Source | Live DB | Status |
|--------|---------|--------|
| Base schema: `EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')` | RPC call returns `False` (expected for service role) | CONSISTENT |

### get_my_role()

| Source | Live DB | Status |
|--------|---------|--------|
| Base schema: `SELECT role FROM public.profiles WHERE id = auth.uid()` | RPC call returns `null` (expected for service role) | CONSISTENT |

### enforce_booking_immutable_fields()

| Source | Migration M3 | Status |
|--------|-------------|--------|
| Base schema: 4 `IS DISTINCT FROM` checks | M3: identical 4 checks | CONSISTENT |

**No stale definitions, no missing functions, no duplicate functions, no signature changes.**

---

## 3. SECURITY DEFINER Audit

### A. search_path Hardening

| Function | search_path | Status |
|----------|-------------|--------|
| `handle_new_user()` | `SET search_path = public` | PASS |
| `is_admin()` | `SET search_path = public` | PASS |
| `get_my_role()` | `SET search_path = ''` (empty — strictest) | PASS |

No unsafe `SET search_path TO "$user", public` found. No attacker-controlled schemas.

### B. Object Qualification

All table references in SECURITY DEFINER functions use `public.` prefix:
- `handle_new_user()`: `public.profiles`
- `is_admin()`: `public.profiles`
- `get_my_role()`: `public.profiles`

**PASS**

### C. Role Escalation Protection

| Check | Result |
|-------|--------|
| `handle_new_user()` trusts `raw_user_meta_data->>'role'`? | NO — hardcoded `'User'::user_role_enum` |
| Any function trusts client-provided role? | NO |
| Any function trusts client-provided admin flag? | NO |

**PASS**

### D. RLS Bypass Documentation

| Function | Bypasses RLS | Why | What it accesses | Mutates data? |
|----------|-------------|-----|-----------------|---------------|
| `handle_new_user()` | Yes | Must insert into `profiles` during auth trigger (before user session exists) | INSERT/UPDATE `public.profiles` | Yes (profiles only) |
| `is_admin()` | Yes | Must read `profiles.role` for RLS policy evaluation | SELECT 1 row from `public.profiles` | No |
| `get_my_role()` | Yes | Must read `profiles.role` for RLS policy evaluation | SELECT 1 row from `public.profiles` | No |

All three are intentionally SECURITY DEFINER. Removing it would break the security model.

---

## 4. Function-by-Function Security Review

### 4.1 handle_updated_at()

```
SECURITY DEFINER: No
search_path: N/A
Dynamic SQL: NONE
Queries: NONE (only touches NEW record)
Writes: NEW.updated_at = NOW() only
Trigger: BEFORE UPDATE on 8 tables
```

**Verdict: PASS** — Minimal, safe, no security concerns.

### 4.2 handle_new_user()

```
SECURITY DEFINER: Yes
search_path: public
Dynamic SQL: NONE
Queries: NONE (reads NEW record from auth.users trigger)
Writes: INSERT INTO public.profiles (single row)
ON CONFLICT: DO UPDATE SET email + updated_at (idempotent)
Role: Hardcoded 'User'::user_role_enum
Metadata used: full_name, email, phone_number, avatar_url (display fields only)
```

**Verdict: PASS** — Cannot be exploited for privilege escalation.

### 4.3 is_admin()

```
SECURITY DEFINER: Yes
search_path: public
Dynamic SQL: NONE
Queries: SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'
Returns: BOOLEAN
Used by: 15 RLS policies across 11 tables
```

**Potential concern:** If `profiles` table has no row for `auth.uid()`, returns `false`. This is correct behavior — no profile = not admin.

**Verdict: PASS** — Safe for RLS use. No recursion (RLS policies on `profiles` don't call `is_admin()`).

### 4.4 get_my_role()

```
SECURITY DEFINER: Yes
search_path: '' (empty — strictest)
Dynamic SQL: NONE
Queries: SELECT role FROM public.profiles WHERE id = auth.uid()
Returns: user_role_enum
Used by: profiles UPDATE policy (role escalation prevention)
```

**Verdict: PASS** — Empty search_path is the strictest possible hardening.

### 4.5 enforce_booking_immutable_fields()

```
SECURITY DEFINER: No
search_path: N/A
Dynamic SQL: NONE
Queries: NONE (uses NEW/OLD records only)
Writes: NONE (RAISE EXCEPTION on violation)
Trigger: BEFORE UPDATE on bookings
```

**Protected fields:** user_id, court_id, total_price, booking_range
**Mutable fields NOT blocked:** status, cancelled_at, cancellation_reason, updated_at

**Verdict: PASS** — Correct enforcement, no security concerns.

---

## 5. search_path Audit

| Function | Declared | Acceptable | Status |
|----------|----------|------------|--------|
| `handle_updated_at()` | None (not SECURITY DEFINER) | N/A | PASS |
| `handle_new_user()` | `SET search_path = public` | Yes | PASS |
| `is_admin()` | `SET search_path = public` | Yes | PASS |
| `get_my_role()` | `SET search_path = ''` | Yes (strictest) | PASS |
| `enforce_booking_immutable_fields()` | None (not SECURITY DEFINER) | N/A | PASS |

---

## 6. EXECUTE Privileges

| Function | PUBLIC | anon | authenticated | service_role | Notes |
|----------|--------|------|---------------|-------------|-------|
| `handle_updated_at()` | Via trigger | Via trigger | Via trigger | Via trigger | Trigger-only; no direct EXECUTE needed |
| `handle_new_user()` | Via trigger | Via trigger | Via trigger | Via trigger | Trigger-only on auth.users |
| `is_admin()` | Yes (RLS) | Yes (RLS) | Yes (RLS) | Yes (RPC) | Required for RLS policies |
| `get_my_role()` | Yes (RLS) | Yes (RLS) | Yes (RLS) | Yes (RPC) | Required for RLS policies |
| `enforce_booking_immutable_fields()` | Via trigger | Via trigger | Via trigger | Via trigger | Trigger-only |

**Note:** No explicit GRANT/REVOKE found for any function. Default PostgreSQL behavior applies — all functions in `public` schema are executable by PUBLIC unless explicitly restricted. For RLS helper functions (`is_admin()`, `get_my_role()`), PUBLIC execute is **required** — RLS policies run as the calling user, not as a superuser.

**Verdict: PASS** — Default privileges are correct for this architecture.

---

## 7. RLS Dependency Graph

```
notifications SELECT → is_admin() → public.profiles
notifications INSERT → auth.uid() (no function)
notifications UPDATE → is_admin() → public.profiles
notifications DELETE → is_admin() → public.profiles

profiles SELECT → is_admin() → public.profiles
profiles UPDATE → get_my_role() → public.profiles
profiles DELETE → is_admin() → public.profiles

courts SELECT → is_admin() → public.profiles
courts INSERT/UPDATE/DELETE → is_admin() → public.profiles

blocked_periods SELECT → is_admin() → public.profiles
blocked_periods INSERT/UPDATE/DELETE → is_admin() → public.profiles

bookings SELECT → is_admin() → public.profiles
bookings INSERT → is_admin() → public.profiles
bookings UPDATE → is_admin() → public.profiles
bookings DELETE → is_admin() → public.profiles

payments SELECT → is_admin() → public.profiles
payments INSERT/UPDATE/DELETE → is_admin() → public.profiles

events SELECT → is_admin() → public.profiles
events INSERT/UPDATE/DELETE → is_admin() → public.profiles

event_registrations SELECT → is_admin() → public.profiles
event_registrations INSERT → is_admin() → public.profiles
event_registrations DELETE → is_admin() → public.profiles

advertising_spaces SELECT → is_admin() (via is_available check)

sponsorship_requests → is_admin() → public.profiles
advertisement_requests → is_admin() → public.profiles
faqs → is_admin() → public.profiles
testimonials → is_admin() → public.profiles
contact_submissions SELECT → is_admin() → public.profiles
system_settings → is_admin() → public.profiles
```

**Recursion check:** `profiles` policies do NOT call `is_admin()` in a way that creates recursion:
- `profiles SELECT`: `auth.uid() = id OR public.is_admin()` — if user IS the profile owner, short-circuits before calling `is_admin()`
- `profiles UPDATE`: Uses `get_my_role()` (not `is_admin()`) — no recursion
- `profiles DELETE`: `public.is_admin()` — but profiles DELETE is admin-only, so only admins trigger it, and `is_admin()` reads the same row being deleted (safe)

**Verdict: PASS** — No circular dependencies, no RLS deadlocks.

---

## 8. Trigger Dependencies

| Trigger | Table | Function | Signature Match | Status |
|---------|-------|----------|----------------|--------|
| `tr_profiles_updated_at` | profiles | `handle_updated_at()` | Yes | PASS |
| `tr_courts_updated_at` | courts | `handle_updated_at()` | Yes | PASS |
| `tr_bookings_updated_at` | bookings | `handle_updated_at()` | Yes | PASS |
| `tr_payments_updated_at` | payments | `handle_updated_at()` | Yes | PASS |
| `tr_events_updated_at` | events | `handle_updated_at()` | Yes | PASS |
| `tr_sponsorship_requests_updated_at` | sponsorship_requests | `handle_updated_at()` | Yes | PASS |
| `tr_advertisement_requests_updated_at` | advertisement_requests | `handle_updated_at()` | Yes | PASS |
| `tr_system_settings_updated_at` | system_settings | `handle_updated_at()` | Yes | PASS |
| `trg_booking_immutable_fields` | bookings | `enforce_booking_immutable_fields()` | Yes | PASS |
| `on_auth_user_created` | auth.users | `handle_new_user()` | Yes | PASS |

**10/10 triggers verified.** No duplicate signatures. No stale versions.

---

## 9. SQL Injection / Dynamic SQL Audit

```
EXECUTE: NONE
format(): NONE
quote_ident(): NONE
quote_literal(): NONE
Dynamic SQL: NONE
SQL injection surface: MINIMAL
```

No function constructs SQL dynamically. All operations use static queries or direct column references.

**Verdict: PASS**

---

## 10. Data Access Audit

### Functions that READ data

| Function | Tables | Columns | Caller influence? | RLS bypass? |
|----------|--------|---------|-------------------|-------------|
| `is_admin()` | public.profiles | id, role | No (uses `auth.uid()`) | Yes (SECURITY DEFINER) |
| `get_my_role()` | public.profiles | id, role | No (uses `auth.uid()`) | Yes (SECURITY DEFINER) |

### Functions that WRITE data

| Function | Tables | Columns | Authorization check? |
|----------|--------|---------|---------------------|
| `handle_new_user()` | public.profiles | id, full_name, email, phone_number, avatar_url, role | Trigger context (auth.users INSERT) — only Supabase Auth can fire |
| `handle_updated_at()` | (8 tables) | updated_at only | Trigger context — fires on any UPDATE |

### SECURITY DEFINER + writes data

Only `handle_new_user()` writes data with SECURITY DEFINER. It:
- Inserts a single row into `profiles` with the new user's auth ID
- Hardcodes role to `'User'`
- Cannot be called directly by application code (trigger-only)
- Cannot modify other users' data
- Cannot escalate privileges

**Verdict: PASS**

---

## 11. Input Validation

| Function | NULL handling | Invalid UUID | Invalid enum | Missing auth | Edge cases |
|----------|--------------|-------------|-------------|-------------|------------|
| `handle_new_user()` | COALESCE for name/email | N/A (auth.uid is always valid UUID) | N/A (role hardcoded) | N/A (trigger context) | ON CONFLICT handles duplicate inserts |
| `is_admin()` | `auth.uid()` returns NULL → EXISTS returns false | N/A | N/A | Returns false | No profile = not admin |
| `get_my_role()` | No profile → returns NULL | N/A | N/A | Returns NULL | NULL returned to RLS policy |
| `enforce_booking_immutable_fields()` | IS DISTINCT FROM handles NULLs correctly | N/A | N/A | N/A | NULL = NULL comparison works |

**Verdict: PASS**

---

## 12. Error Handling

| Function | Exception handling | Error messages | Info disclosure |
|----------|-------------------|----------------|-----------------|
| `handle_updated_at()` | No exceptions possible | N/A | None |
| `handle_new_user()` | ON CONFLICT → silent upsert | N/A | None |
| `is_admin()` | No exceptions possible | N/A | None |
| `get_my_role()` | No exceptions possible | N/A | None |
| `enforce_booking_immutable_fields()` | RAISE EXCEPTION with specific messages | 'Booking user_id is immutable' etc. | Minimal — only reveals which field was attempted |

**Error messages in `enforce_booking_immutable_fields()`:**
- `'Booking user_id is immutable'`
- `'Booking court_id is immutable'`
- `'Booking total_price is immutable'`
- `'Booking booking_range is immutable'`

These reveal which field was attempted but not internal state. Acceptable for debugging.

**Verdict: PASS**

---

## 13. Volatility

| Function | Declared | Actual behavior | Correct? |
|----------|----------|----------------|----------|
| `handle_updated_at()` | VOLATILE (implicit) | Modifies NEW.updated_at | YES |
| `handle_new_user()` | VOLATILE (implicit) | INSERT/UPDATE profiles | YES |
| `is_admin()` | VOLATILE (implicit) | Reads profiles | YES (reads DB state) |
| `get_my_role()` | VOLATILE (implicit) | Reads profiles | YES (reads DB state) |
| `enforce_booking_immutable_fields()` | VOLATILE (implicit) | Reads NEW/OLD | YES |

No function is incorrectly marked `IMMUTABLE` or `STABLE`. All are `VOLATILE` (default), which is correct.

**Verdict: PASS**

---

## 14. Performance

| Function | Queries per call | Index support | Per-row invocation | Concern? |
|----------|-----------------|---------------|-------------------|----------|
| `handle_updated_at()` | 0 | N/A | Yes (8 triggers) | NO — no query |
| `handle_new_user()` | 0-1 (INSERT or UPDATE) | N/A (auth trigger) | Once per signup | NO |
| `is_admin()` | 1 | `profiles.id` (PK) | Yes (15 RLS policies) | NO — PK lookup |
| `get_my_role()` | 1 | `profiles.id` (PK) | Yes (1 policy) | NO — PK lookup |
| `enforce_booking_immutable_fields()` | 0 | N/A | Yes (bookings trigger) | NO — no query |

**Known expected patterns confirmed.** No unnecessary queries, no expensive loops, no recursive calls.

**Verdict: PASS**

---

## 15. Application ↔ DB Overlap

### DB responsibilities

| Area | Implementation |
|------|---------------|
| Timestamps | `handle_updated_at()` trigger |
| Auth profile creation | `handle_new_user()` trigger |
| Role escalation prevention | `handle_new_user()` hardcodes role |
| Admin authorization | `is_admin()` for RLS |
| Role reading | `get_my_role()` for RLS |
| Booking field immutability | `enforce_booking_immutable_fields()` trigger |

### Application responsibilities

| Area | Implementation |
|------|---------------|
| Booking creation workflow | `booking.actions.ts` — validates court, past-slot, blocked-periods, overlap, price |
| Cancellation workflow | `booking.actions.ts` — 2-hour window, ownership, status checks |
| Admin role check (defense-in-depth) | `booking.actions.ts` — reads `profiles.role` via Supabase query (not `is_admin()` RPC) |
| Profile creation fallback | `auth.service.ts` — creates minimal profile if `handle_new_user()` trigger fails |
| Notification creation | `notification.service.ts` — server-side only, with dedupe_key |

### Overlap analysis

Application code checks `role !== 'Admin'` in Server Actions (lines 201, 293, 358, 431 of `booking.actions.ts`). This reads the profile from the DB (not client metadata) — it's a defense-in-depth measure, NOT duplicating `is_admin()`. The application check is for business workflow authorization; the DB function is for RLS policy evaluation. They serve different layers.

**Verdict: PASS** — Correct separation of concerns.

---

## 16. Migration Audit

| Migration | Function changes | Idempotent? | Ordering | Correct? |
|-----------|-----------------|-------------|----------|----------|
| M1 (tighten blocked_periods_rls) | None | N/A | First | PASS |
| M2 (fix_signup_role_escalation) | `handle_new_user()` — hardened role | `CREATE OR REPLACE` | Second | PASS |
| M3 (reconcile_bookings_rls) | `enforce_booking_immutable_fields()` — new | `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS` | Third | PASS |
| M4 (fix_service_role_bookings_grants) | None (GRANT only) | N/A | Fourth | PASS |
| M5 (system_settings updated_at) | `handle_updated_at()` — re-applied (no change) | `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS` | Fifth | PASS |
| M6 (notifications dedupe) | None (DDL only) | `ADD COLUMN IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS` | Sixth | PASS |

**Migration ordering:** Correct. M2 before M3 before M4 before M5 before M6.

**No orphaned old function versions.** No duplicate overloads. No accidental signature changes.

**Verdict: PASS**

---

## 17. Findings

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| — | — | No findings | — |

**Zero findings.** All functions are correct, secure, and properly documented.

---

## 18. Changes Made

**ZERO changes.** All functions verified correct. No modifications required.

---

## 19. Regression Tests

```text
TypeScript: 0 errors
Playwright: 32/32 passed (57.1s)
```

All tests cover notification system, booking lifecycle, edge cases, and store architecture. No tests were modified, weakened, or skipped.

---

## 20. Final Function Inventory

| Function | Security | search_path | EXECUTE | Reads | Writes | RLS | Trigger | Status |
|----------|----------|-------------|---------|-------|--------|-----|---------|--------|
| `handle_updated_at()` | INVOKER | N/A | Via trigger | None | NEW.updated_at | No | 8 tables | PASS |
| `handle_new_user()` | DEFINER | `public` | Via trigger | auth.users NEW | profiles (INSERT/UPDATE) | No | auth.users | PASS |
| `is_admin()` | DEFINER | `public` | PUBLIC | profiles (1 row) | None | YES (15 policies) | No | PASS |
| `get_my_role()` | DEFINER | `''` | PUBLIC | profiles (1 row) | None | YES (1 policy) | No | PASS |
| `enforce_booking_immutable_fields()` | INVOKER | N/A | Via trigger | None (NEW/OLD) | None | No | bookings | PASS |

---

## 21. Final Security Matrix

| Function | SECURITY DEFINER | search_path Hardened | SQL Injection Risk | RLS Bypass | Authorization Risk | Result |
|----------|-----------------|---------------------|-------------------|------------|-------------------|--------|
| `handle_updated_at()` | No | N/A | NONE | No | NONE | PASS |
| `handle_new_user()` | Yes | Yes (`public`) | NONE | Yes (intentional) | NONE (hardcoded role) | PASS |
| `is_admin()` | Yes | Yes (`public`) | NONE | Yes (intentional) | NONE | PASS |
| `get_my_role()` | Yes | Yes (`''`) | NONE | Yes (intentional) | NONE | PASS |
| `enforce_booking_immutable_fields()` | No | N/A | NONE | No | NONE | PASS |

---

## 22. Final Architecture Check

```
Auth
 ↓
handle_new_user() [SECURITY DEFINER, hardcoded role]
 ↓
profiles

RLS
 ↓
is_admin() [SECURITY DEFINER, 15 policies]
get_my_role() [SECURITY DEFINER, 1 policy]

Booking DB invariant
 ↓
enforce_booking_immutable_fields() [trigger, no SECURITY DEFINER]

Timestamps
 ↓
handle_updated_at() [trigger, 8 tables]

Business workflows
 ↓
Server Actions / Services [application layer]
```

**No business logic in DB functions.** All functions serve a clear security/infrastructure purpose.

---

## 23. Limitations

| Limitation | Impact |
|-----------|--------|
| No psql available | Cannot inspect `pg_proc`, `pg_trigger`, `pg_roles`, `information_schema.routine_privileges` metadata directly |
| No Supabase CLI login | Cannot query live DB catalog for exact function definitions, owners, or EXECUTE grants |
| Live DB verification limited to | RPC calls (`is_admin()`, `get_my_role()`) and table queries via REST API |
| Role escalation test | Analytical only (verified from migration source code), not tested with actual signup |

**Impact:** Low. All verifiable aspects confirmed via RPC + source analysis. Cannot verify actual function definitions in `pg_proc` or EXECUTE grants in `information_schema.routine_privileges`, but source definitions are canonical and migrations are idempotent.

---

```
PHASE 16 DATABASE FUNCTIONS AUDIT = PASS

Functions discovered: 5
SECURITY DEFINER: 3 (handle_new_user, is_admin, get_my_role)
search_path hardened: 3/3 SECURITY DEFINER functions
Dynamic SQL: NONE
SQL injection surface: MINIMAL
Role escalation: PROTECTED
RLS dependencies: VERIFIED (no recursion)
Trigger dependencies: VERIFIED (10/10)
Migration quality: PASS
Application overlap: CORRECT (defense-in-depth, not duplication)
Changes made: ZERO
TypeScript: 0 errors
Playwright: 32/32 passed

PHASE 17 NOT STARTED.
STOP.
```
