# Phase 15: Database Triggers — Audit Report

**Date:** 2026-08-26
**Status:** PASS — No changes required
**Auditor:** opencode

---

## Executive Summary

The existing database trigger architecture was audited across 18 steps. The trigger/function inventory is complete, secure, and correctly scoped. **No new triggers are needed, no existing triggers require modification, and no application-layer changes are warranted.**

---

## Trigger & Function Inventory

### Functions (5 total)

| # | Function | Language | Security | Purpose |
|---|----------|----------|----------|---------|
| F1 | `handle_updated_at()` | PL/pgSQL | None | Sets `updated_at = NOW()` on UPDATE |
| F2 | `handle_new_user()` | PL/pgSQL | SECURITY DEFINER, search_path=public | Creates profile row on auth.users INSERT |
| F3 | `is_admin()` | PL/pgSQL | SECURITY DEFINER, search_path=public | Returns TRUE if caller has Admin role |
| F4 | `get_my_role()` | SQL | SECURITY DEFINER, search_path='' | Returns caller's persisted role (RLS-safe) |
| F5 | `enforce_booking_immutable_fields()` | PL/pgSQL | None | BEFORE UPDATE: blocks changes to immutable booking fields |

### Triggers (10 total)

| # | Trigger Name | Table | Event | Timing | Function |
|---|-------------|-------|-------|--------|----------|
| T1 | `tr_profiles_updated_at` | public.profiles | UPDATE | BEFORE | F1: `handle_updated_at()` |
| T2 | `tr_courts_updated_at` | public.courts | UPDATE | BEFORE | F1: `handle_updated_at()` |
| T3 | `tr_bookings_updated_at` | public.bookings | UPDATE | BEFORE | F1: `handle_updated_at()` |
| T4 | `tr_payments_updated_at` | public.payments | UPDATE | BEFORE | F1: `handle_updated_at()` |
| T5 | `tr_events_updated_at` | public.events | UPDATE | BEFORE | F1: `handle_updated_at()` |
| T6 | `tr_sponsorship_requests_updated_at` | public.sponsorship_requests | UPDATE | BEFORE | F1: `handle_updated_at()` |
| T7 | `tr_advertisement_requests_updated_at` | public.advertisement_requests | UPDATE | BEFORE | F1: `handle_updated_at()` |
| T8 | `tr_system_settings_updated_at` | public.system_settings | UPDATE | BEFORE | F1: `handle_updated_at()` |
| T9 | `on_auth_user_created` | auth.users | INSERT | AFTER | F2: `handle_new_user()` |
| T10 | `tr_bookings_immutable_fields` | public.bookings | UPDATE | BEFORE | F5: `enforce_booking_immutable_fields()` |

### Tables WITHOUT `updated_at` triggers (by design)

| Table | Reason |
|-------|--------|
| `blocked_periods` | Rarely modified; audit trail not critical |
| `faqs` | CMS content; admin edits don't need timestamp tracking |
| `testimonials` | CMS content; admin edits don't need timestamp tracking |
| `event_registrations` | Immutable after creation (no UPDATE) |
| `sponsors` | Admin-managed; timestamp tracking not critical |
| `contact_submissions` | Write-once; no updates expected |
| `notifications` | Created by app; immutable status (`is_read` is a flag, not audit) |

---

## Overlap Audit: Application ↔ Trigger

| Concern | Application Layer | DB Trigger | Verdict |
|---------|------------------|------------|---------|
| Notifications | `notification.service.ts`, `notification.actions.ts` | None | ✓ No overlap |
| Payments | `payment.service.ts` (mock, in-memory) | None | ✓ No overlap |
| Booking pricing | `booking.actions.ts` | None | ✓ No overlap |
| Auth/profile creation | `auth.service.ts` calls `signUp()` | `handle_new_user()` | ✓ Correct separation |
| Timestamps | None (app never sets `updated_at`) | `handle_updated_at()` on 8 tables | ✓ No overlap |
| Immutable fields | None | `tr_bookings_immutable_fields` | ✓ No overlap |

**No application code duplicates or conflicts with any database trigger.**

---

## Security Audit

| Function | SECURITY DEFINER | search_path | Hardcoded role | Risk |
|----------|-----------------|-------------|----------------|------|
| `handle_new_user()` | Yes | public | Yes (`role = 'User'`) | None — role escalation blocked |
| `is_admin()` | Yes | public | N/A (reads from profiles) | None — read-only |
| `get_my_role()` | Yes | '' (empty) | N/A (reads from profiles) | None — most restrictive path |
| `handle_updated_at()` | No | N/A | N/A | None — no row access |
| `enforce_booking_immutable_fields()` | No | N/A | N/A | None — no row access |

**All SECURITY DEFINER functions use hardened `search_path` settings.**
**The `handle_new_user()` role escalation vulnerability was fixed in migration `20260823000001`.**

---

## Recursion / Chain Audit

| Scenario | Risk | Verdict |
|----------|------|---------|
| `handle_updated_at()` sets `updated_at` → re-fires trigger | None — BEFORE UPDATE, single row, no recursive UPDATE | ✓ Safe |
| `handle_new_user()` inserts into profiles → profiles trigger fires | None — profiles BEFORE UPDATE trigger only fires on UPDATE, not INSERT | ✓ Safe |
| `enforce_booking_immutable_fields()` → UPDATE on another table | None — function only RAISES exceptions, never writes | ✓ Safe |
| Trigger chain: AFTER trigger → UPDATE on table with trigger | None — only one AFTER trigger (`on_auth_user_created`) targets auth.users, not public tables | ✓ Safe |

**No recursion risks. No trigger chains. No cascading updates.**

---

## Architectural Decision: Why No New Triggers

Per the Phase 15 architectural rule: **Do NOT move application business logic into triggers.** Use triggers only for DB-layer concerns.

| Proposed Trigger | Rejected? | Reason |
|-----------------|-----------|--------|
| Notification triggers | Yes | Business logic belongs in `notification.service.ts`; application-layer dedup is more flexible |
| Payment status triggers | Yes | Payments are MOCK ONLY (in-memory); no Supabase writes |
| Booking pricing triggers | Yes | Pricing is calculated in `booking.actions.ts`; no DB-layer invariant to enforce |
| Expiry notification triggers | Yes | Business event → Server Action → notification service is the correct architectural pattern |

---

## Migration Files Reviewed

| Migration | File | Changes |
|-----------|------|---------|
| M1 | `20260823000000_tighten_blocked_periods_rls.sql` | RLS policies only; no triggers |
| M2 | `20260823000001_fix_signup_role_escalation.sql` | Hardcoded `role = 'User'` in `handle_new_user()` |
| M3 | `20260823000002_reconcile_bookings_rls.sql` | Created `enforce_booking_immutable_fields()` + trigger |
| M4 | `20260823000003_fix_service_role_bookings_grants.sql` | RLS + GRANTs only; no triggers |
| M5 | `20260825000000_add_system_settings_updated_at_trigger.sql` | Added `updated_at` trigger to `system_settings` |
| M6 | `20260826000000_add_notifications_dedupe_and_constraints.sql` | Added `dedupe_key` column + indexes + constraints; no triggers |

**All 6 migrations reviewed. No trigger regressions found.**

---

## Verification Checklist

- [x] All 5 functions reviewed for SECURITY DEFINER + search_path
- [x] All 10 triggers verified for correct table, event, timing
- [x] No application code duplicates trigger logic
- [x] No recursion risks (circular trigger chains)
- [x] No trigger chains (AFTER → UPDATE on triggered table)
- [x] `handle_new_user()` hardcoded role = 'User' (role escalation blocked)
- [x] `is_admin()` and `get_my_role()` hardened search_path
- [x] All 6 migration files reviewed for trigger regressions
- [x] Tables without `updated_at` triggers documented with rationale
- [x] Architectural rule (no business logic in triggers) upheld

---

## Conclusion

**Phase 15: PASS — No changes required.**

The trigger architecture is complete, secure, and correctly separated from application logic. The 5 functions and 10 triggers serve clear database-layer concerns (timestamps, auth/profile provisioning, invariant enforcement) without encroaching on application business logic.

**Next Phase:** Phase 16 (pending approval).
