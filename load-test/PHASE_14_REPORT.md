# Phase 14 — Notification Architecture Audit Report

**Date:** 2026-08-25  
**Scope:** Complete audit of the Notifications architecture and database integrity  
**Verdict:** **PASS WITH GAPS**  
**Environment:** Node v22.23.2, win32, Next.js 16.2.12, Supabase PostgreSQL

---

## Executive Summary

The notification system is a **dual-layer architecture**: server-side DB notifications (via Supabase `notifications` table) coexist with client-side Zustand store notifications. The DB schema is well-structured with RLS, FK cascades, and a composite index. However, **several architectural gaps** create inconsistency: the same user action can trigger notifications through two different paths, the Drizzle schema is stale/legacy, there is no TTL/cleanup mechanism, and logout does not clear the notification store.

**No CRITICAL or security-blocking issues were found.** The RLS policies are correctly scoped (users see only their own, admin bypasses RLS). No data exposure or injection vectors were identified.

---

## Findings Table

| # | Section | Finding | Severity | Status |
|---|---------|---------|----------|--------|
| F1 | A | Drizzle `schema.ts` notifications table is stale/legacy — wrong column names | MEDIUM | Open |
| F2 | A | No reverse mapper (App→DB) — `addNotification` bypasses mappers entirely | MEDIUM | Open |
| F3 | F | Dual notification system — same event can create DB + client-side notifications | HIGH | Open |
| F4 | G | `expireStaleBookingsAction` does not send notification on expiry | MEDIUM | Open |
| F5 | G | No TTL or cleanup mechanism for old notifications | MEDIUM | Open |
| F6 | D | Logout does not clear notification store (Zustand or DB) | MEDIUM | Open |
| F7 | N | `addNotification` fires fire-and-forget DB insert — client shows before DB confirms | LOW | Info |
| F8 | I | No duplicate notification prevention at DB level | LOW | Info |
| F9 | K | No content length constraints on `title`/`message` columns | LOW | Info |
| F10 | C | `markAllAsRead` issues UPDATE without filtering `is_read = false` first | LOW | Info |
| F11 | — | No notification-specific unit/integration tests exist | LOW | Info |

**Totals:** 0 CRITICAL · 1 HIGH · 6 MEDIUM · 4 LOW · 11 Total

---

## Section A: TypeScript ↔ Database Alignment

### F1 — Drizzle `schema.ts` is stale (MEDIUM)

The legacy Drizzle schema (`src/db/schema.ts:170-179`) defines the notifications table with **wrong column names**:

| Drizzle schema | Actual DB column | Correct? |
|----------------|------------------|----------|
| `notificationType` (varchar) | `type` (text) | ❌ |
| `readStatus` (boolean) | `is_read` (boolean) | ❌ |
| — | `related_booking_id` (uuid FK) | Missing |

**Impact:** If anyone uses Drizzle to query the `notifications` table, it will fail. The app currently does NOT use Drizzle for notifications (it uses Supabase client directly), so this is non-blocking but misleading.

**Evidence:** `src/db/schema.ts:170-179`

```typescript
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  notificationType: varchar('notification_type', { length: 50 }).notNull(), // ← WRONG
  readStatus: boolean('read_status').default(false).notNull(),               // ← WRONG
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Missing: related_booking_id, type column, is_read column
});
```

**Recommendation:** Update Drizzle schema to match actual DB, or delete the Drizzle notifications table definition since it's unused.

---

### F2 — No reverse mapper (MEDIUM)

The one-way mapper `mapDbNotificationToNotification` (`src/lib/mappers.ts:280-291`) converts DB rows → App types. No reverse mapper exists.

The `addNotification` function in `useNotificationStore.ts` constructs the DB insert payload manually with hardcoded snake_case field names, bypassing any mapper layer:

```typescript
const { error } = await supabase
  .from('notifications')
  .insert({
    user_id: userId,          // manual snake_case
    type: type,
    title: title,
    message: message,
    is_read: false,
  })
  .select()
  .single();
```

**Impact:** Field name mapping is duplicated and fragile. If the DB column names change, two places must be updated.

---

## Section F: Notification Creation Flows

### F3 — Dual notification system (HIGH)

Two distinct notification creation paths exist:

| Path | Where | Persists to DB? | Survives refresh? |
|------|-------|-----------------|-------------------|
| **Server-side** | `booking.actions.ts` (create/cancel) | ✅ Yes | ✅ Yes |
| **Client-side** | `payment/page.tsx`, `bookings/page.tsx`, `membership/page.tsx` | ⚠️ Fire-and-forget INSERT | ✅ Yes (via Realtime) |

**Specific flows:**

1. **`createBookingAction`** (line ~135): INSERT to Supabase `notifications` — type: `new_booking` or similar
2. **`cancelBookingAction`** (line ~248): INSERT to Supabase `notifications` — type: `booking_cancelled`
3. **`payment/page.tsx` `handleConfirm`** (lines 104-117): `addNotification()` — types: `booking_confirmed`, `payment_successful`
4. **`bookings/page.tsx` cancel handler** (lines 88-116): `addNotification()` — types: `payment_refunded`, `booking_cancelled`, `info`
5. **`membership/page.tsx` `handleJoin`** (lines 19-26): `addNotification()` — type: `new_subscription`

**The problem:** When a user creates a booking, `createBookingAction` inserts a DB notification. Then if the payment page also fires `addNotification('booking_confirmed', ...)`, **two notifications are created for the same logical event** — one server-side, one client-side. Both persist because the client-side one also does a fire-and-forget DB INSERT.

**Impact:** Users see duplicate notifications for booking creation + confirmation flows.

---

## Section G: Notification Lifecycle

### F4 — No notification on booking expiry (MEDIUM)

`expireStaleBookingsAction` (`booking.actions.ts:386-429`) expires stale Reserved bookings by setting `status = 'expired'` but **does not create a notification** for the affected user.

**Impact:** Users whose reserved bookings expire receive no feedback. They only discover it when they next load their bookings page and see the status changed.

---

### F5 — No TTL or cleanup mechanism (MEDIUM)

There is no scheduled job, database function, or application-level cleanup that removes old notifications. The `system_settings` table has a `data_retention_days` setting, but no code references it for notifications.

Over time, the `notifications` table will grow unbounded. For a single-user app this is negligible, but for a multi-user deployment this becomes a scaling concern.

---

## Section D: Dual System Analysis

### F6 — Logout does not clear notifications (MEDIUM)

The auth store's `logout` function (`useAuthStore.ts:76-82`) clears `bookingStore` and `paymentStore` but **does not clear the notification store**:

```typescript
logout: async () => {
  await authService.logoutUser();
  useBookingStore.getState().resetBookingFlow();
  usePaymentStore.getState().clearPayments();
  // ← useNotificationStore NOT cleared
  set({ user: null, isAuthenticated: false });
},
```

After logout, the Zustand notification state (including `notifications` array, `soundEnabled`, `lastInitializedUserId`) persists in localStorage via `khub-notifications-storage`. When a different user logs in, `initNotifications` is called, which replaces the notifications array — so the old data is overwritten. However, the **persisted state briefly contains stale data** between logout and next login.

**Impact:** Low practical risk (initNotifications overwrites on next login), but architecturally inconsistent with how other stores are cleaned up.

---

## Section N: Concurrency Risks

### F7 — Fire-and-forget DB insert (LOW)

The `addNotification` function inserts to the DB but does not await or check the result for UI purposes:

```typescript
const { error } = await supabase
  .from('notifications')
  .insert({ ... })
  .select()
  .single();

// On success, replace local ID with DB UUID
if (!error && data) {
  set((state) => ({
    notifications: state.notifications.map((n) =>
      n.id === tempId ? { ...n, id: data.id } : n
    ),
  }));
}
```

If the INSERT fails (network error, RLS violation), the notification still shows in the UI (localStorage) but is never persisted to the DB. On next page refresh, it disappears.

**Impact:** Transient UI inconsistency. The notification appears but doesn't persist if the DB insert fails.

---

## Section I: Duplicate Notification Risks

### F8 — No DB-level deduplication (LOW)

The `notifications` table has no unique constraint preventing duplicate notifications. A unique index on `(user_id, type, title, created_at)` with a time window could prevent duplicates, but this is not implemented.

**Impact:** If the same action fires multiple times (e.g., double-click on confirm), duplicate notifications may be created.

---

## Section C: Database Schema

### F9 — No content length constraints (LOW)

The `type`, `title`, and `message` columns are `TEXT NOT NULL` with no `CHECK` constraints for length. The Drizzle schema had `varchar(255)` for title, suggesting an intended limit.

**Impact:** Malformed or excessively long notifications could be stored. Not a security issue (RLS prevents unauthorized inserts), but a data quality concern.

---

### F10 — `markAllAsRead` issues broad UPDATE (LOW)

`markAllAsRead` in the store issues:
```typescript
await supabase
  .from('notifications')
  .update({ is_read: true })
  .eq('user_id', userId);
```

This updates ALL notifications for the user, including already-read ones. A more efficient query would add `.eq('is_read', false)`.

**Impact:** Functional correctness is maintained (setting `is_read = true` on already-true rows is a no-op), but it generates unnecessary write amplification.

---

## Section P: Trigger/Function Dependencies

The notifications table has **no database triggers**. The `updated_at` trigger exists for `profiles`, `bookings`, `blocked_periods`, and `system_settings` but **not for notifications** (which has no `updated_at` column — by design, since notifications are immutable once created).

No database functions reference the `notifications` table. All notification creation is done via the Supabase client from application code.

**Verdict:** No trigger/function gaps identified.

---

## Section K: Security

### RLS Policies (VERIFIED CORRECT)

Three policies on `public.notifications`:

| Policy | Operation | Rule |
|--------|-----------|------|
| `users_select_own_or_admin` | SELECT | `user_id = auth.uid()` OR admin role |
| `users_update_own_is_read` | UPDATE | `user_id = auth.uid()` AND immutable columns protected |
| `users_delete_own` | DELETE | `user_id = auth.uid()` |

**Key observations:**
- No INSERT policy for regular users — all inserts are server-side via service role or via `addNotification` with the user's own `user_id`
- The UPDATE policy uses `WITH CHECK` to protect `user_id`, `title`, `message`, `type`, `related_booking_id` — only `is_read` can be changed
- Admin bypasses all RLS via `admin_all_operations` policy

**No security issues found.** The trust boundary is correctly enforced.

---

## Tests

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ PASS — no type errors |
| Notification-specific tests | ❌ None exist |

---

## Final Verdict: PASS WITH GAPS

| Category | Status |
|----------|--------|
| DB Schema | ✅ Correct — columns, types, FK, indexes, RLS all verified |
| Type Alignment | ⚠️ Gaps — Drizzle schema stale (F1), no reverse mapper (F2) |
| Creation Flows | ⚠️ Gaps — dual system creates duplicate risk (F3) |
| Lifecycle | ⚠️ Gaps — no expiry notification (F4), no TTL (F5) |
| Security | ✅ Correct — RLS properly scoped |
| Concurrency | ✅ Acceptable — fire-and-forget is low risk (F7) |
| Testing | ⚠️ Gap — no notification-specific tests (F11) |

**The notification system is functional and secure.** The primary gap is architectural: the dual notification system (server-side + client-side) creates inconsistency and duplicate risk. This should be addressed in a future phase by standardizing on a single notification creation path.

---

## Recommended Fixes (for future phases, not Phase 14 scope)

| Priority | Fix | Effort |
|----------|-----|--------|
| HIGH | Standardize notification creation — choose server-side OR client-side, not both | Medium |
| MEDIUM | Update Drizzle `schema.ts` to match actual DB or remove stale definition | Low |
| MEDIUM | Add notification on booking expiry in `expireStaleBookingsAction` | Low |
| MEDIUM | Add TTL cleanup job for old notifications (e.g., 90 days) | Medium |
| MEDIUM | Clear notification store on logout (consistency) | Low |
| LOW | Add `.eq('is_read', false)` to `markAllAsRead` query | Low |
| LOW | Add CHECK constraints for `title`/`message` length | Low |
| LOW | Add notification unit tests | Medium |
