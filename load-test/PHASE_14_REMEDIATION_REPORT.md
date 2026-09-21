# Phase 14 Notification Audit — Remediation Report

**Date**: 2026-08-26  
**Original Audit**: `load-test/PHASE_14_REPORT.md`  
**Verdict**: PASS WITH GAPS → **PASS** (all 11 actionable findings resolved)

---

## Executive Summary

All 11 actionable findings (F1–F11) from the Phase 14 audit have been remediated. The notification system now follows a clean single-source-of-truth architecture: **Business Event → Server Action → `createNotification` service → Supabase → Realtime → Zustand → UI**. Client components no longer create persistent notifications directly.

---

## Finding Resolution Matrix

| ID | Finding | Severity | Status | Resolution |
|----|---------|----------|--------|------------|
| F1 | `payment/page.tsx` creates duplicate client-side notifications | High | FIXED | Removed client-side `addNotification` calls; `confirmBookingStatusAction` now handles `booking_confirmed` + `payment_successful` server-side |
| F2 | `bookings/page.tsx` creates duplicate client-side notifications | High | FIXED | Removed all client-side `addNotification` calls; `cancelBookingAction` creates `booking_cancelled` with dedupe_key server-side |
| F3 | `membership/page.tsx` uses client-side `addNotification` | Medium | FIXED | Replaced with `createNotificationAction` Server Action import |
| F4 | No deduplication mechanism | High | FIXED | `dedupe_key` column + unique partial index added via migration |
| F5 | No content validation | Medium | FIXED | CHECK constraints on `type`, `title`, `message` columns in migration |
| F6 | `booking_expired` not in NotificationType enum | Medium | FIXED | Added to `src/types/index.ts` enum and used in `expireStaleBookingsAction` |
| F7 | Logout leaves stale notifications in Zustand | Medium | FIXED | Added `clearNotifications()` method to notification store; auth store calls it on logout |
| F8 | `addNotification` fire-and-forget with no error handling | Low | FIXED | Added try/catch with console.error; marked `@deprecated`; Server Actions recommended |
| F9 | `markAllAsRead` updates ALL notifications (no `is_read=false` filter) | Low | FIXED | Added `.eq('is_read', false)` filter to Supabase update query |
| F10 | Drizzle schema has wrong column names (`notificationType`, `readStatus`, missing columns) | Medium | FIXED | Updated `src/db/schema.ts` to match actual DB: `type`, `isRead`, added `relatedBookingId`, `dedupeKey` |
| F11 | `DbNotification` type missing `dedupe_key` field | Low | FIXED | Added `dedupe_key: string | null` to `src/types/database.types.ts` |

---

## Architecture Changes

### Before (Phase 14 Audit)
```
Client Component → addNotification() → Zustand → Supabase (fire-and-forget)
                                                              ↓
Payment page → addNotification(booking_confirmed) ← DUPLICATE
Payment page → addNotification(payment_successful) ← DUPLICATE
Bookings page → addNotification(booking_cancelled) ← DUPLICATE
```

### After (Phase 14 Remediation)
```
Server Action → createNotification() → Supabase notifications table
                                            ↓
                                     Realtime subscription
                                            ↓
                                     Zustand store ← initNotifications()
                                            ↓
                                     UI components
```

---

## Files Created

| File | Purpose |
|------|---------|
| `src/services/notification.service.ts` | Server-side `createNotification()` and `createBookingNotification()` with dedupe_key support |
| `src/app/actions/notification.actions.ts` | Server Actions: `createNotificationAction`, `createBookingNotificationAction`, `createPaymentRefundedNotification` |
| `tests/notification-phase14.spec.ts` | 16 Playwright test cases covering notification lifecycle |
| `supabase/migrations/20260826000000_add_notifications_dedupe_and_constraints.sql` | DB migration for dedupe_key, CHECK constraints |

## Files Modified

| File | Changes |
|------|---------|
| `src/types/index.ts` | Added `booking_expired` to `NotificationType` enum |
| `src/types/database.types.ts` | Added `dedupe_key: string \| null` to `DbNotification` |
| `src/lib/mappers.ts` | Added `mapNotificationToDbNotification()` reverse mapper |
| `src/db/schema.ts` | Fixed notifications table: renamed columns, added `relatedBookingId`, `dedupeKey` |
| `src/features/notifications/useNotificationStore.ts` | Added `clearNotifications()`, deprecated `addNotification`, optimized `markAllAsRead` |
| `src/features/auth/useAuthStore.ts` | Logout calls `clearNotifications()` on notification store |
| `src/app/actions/booking.actions.ts` | `confirmBookingStatusAction` creates server-side notifications; `cancelBookingAction` uses dedupe_key; `expireStaleBookingsAction` creates `booking_expired` |
| `src/app/book/payment/page.tsx` | Removed client-side `addNotification` calls |
| `src/app/bookings/page.tsx` | Removed all client-side `addNotification` calls; uses Server Action for refund |
| `src/app/membership/page.tsx` | Uses `createNotificationAction` Server Action |
| `src/app/notifications/page.tsx` | Added `booking_expired` config; fixed `clearUserNotifications` → `clearNotifications` |
| `src/components/notifications/NotificationDropdown.tsx` | Added `booking_expired` icon config |

---

## Database Changes (Migration Required)

```sql
-- supabase/migrations/20260826000000_add_notifications_dedupe_and_constraints.sql

-- 1. dedupe_key column (nullable for existing rows)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255);

-- 2. Unique partial index (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- 3. CHECK: type must be known value
-- 4. CHECK: title non-empty after trim
-- 5. CHECK: message non-empty after trim
-- 6. CHECK: title ≤ 255 chars
-- 7. CHECK: message ≤ 2000 chars
```

---

## RLS Policy Verification

All 4 RLS policies on `notifications` table remain intact:

| Policy | Operation | Rule |
|--------|-----------|------|
| Users view own notifications | SELECT | `auth.uid() = user_id OR public.is_admin()` |
| Users mark notifications read | UPDATE | `auth.uid() = user_id` + immutable field protection |
| Users delete own notifications | DELETE | `auth.uid() = user_id` |
| Admins manage notifications | ALL | `public.is_admin()` |

**No broad INSERT policy** — regular users cannot insert via client. All inserts go through Server Actions with service role key (bypasses RLS).

---

## TypeScript Verification

```
npx tsc --noEmit → 0 errors
```

---

## Test Coverage

16 Playwright test cases in `tests/notification-phase14.spec.ts`:
- TC-01 to TC-02: Bell badge count, dropdown ordering
- TC-03 to TC-04: Store clearNotifications, booking_expired enum
- TC-05 to TC-06: Mark as read, markAllAsRead
- TC-07 to TC-09: Booking lifecycle notifications, no client-side duplicates
- TC-10: Membership page uses Server Action
- TC-11 to TC-12: Store architecture verification
- TC-13 to TC-16: DB constraints, dedupe_key, lifecycle type coverage

---

## Remaining Items

| Item | Priority | Notes |
|------|----------|-------|
| Run Supabase migration in production | High | `20260826000000_add_notifications_dedupe_and_constraints.sql` |
| Run Playwright tests against live DB | Medium | Tests are written but require running Supabase |
| Consider removing deprecated `addNotification` entirely | Low | Currently retained for backward compatibility |

---

## Conclusion

The notification system is now architecturally sound with a single source of truth (Supabase DB), server-side notification creation, deduplication, content validation, and proper cleanup on logout. All 11 findings resolved. TypeScript compiles clean. Migration ready to deploy.
