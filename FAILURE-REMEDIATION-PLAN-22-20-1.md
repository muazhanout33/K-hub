# Phase 22.20.1 — Failure & Edge-Case Remediation Plan (REVISED)

**Date:** 2026-09-07  
**Status:** REVISED — PENDING APPROVAL  
**Verdict Target:** PASS if all P0/P1 resolved; FAIL if any P0/P1 remains

---

## Executive Summary

This plan addresses 4 findings from Phase 22.20 testing (42/42 tests passed, 4 findings). The architecture is a mock-payment SPA with Zustand client stores and Supabase server actions. All fixes are app-layer; no destructive DB migrations required.

| # | Severity | Finding | Root Cause | Fix Scope |
|---|----------|---------|------------|-----------|
| F1 | P0 | Payment succeeded but booking confirmation failed — financial inconsistency | `handleConfirm()` 4-step flow has no compensating action when step 4 fails after step 3 succeeds | `payment/page.tsx` — add server-state verification + idempotent retry |
| F2 | P1 | Payment page refresh returns 500 error | Guard check exists but may not cover all states; needs verification | Verify existing guards; fix only if 500 confirmed |
| F3 | P2 | No retry mechanism for failed payments | No explicit error state or retry affordance after `handleConfirm()` failure | `payment/page.tsx` — add error state UI with retry |
| F4 | P2 | Notification FK trigger blocks booking updates | `enforce_notification_immutable_fields` trigger intentionally prevents `related_booking_id` mutation | No fix — intentional behavior |

---

## CRITICAL ARCHITECTURAL ANALYSIS

### Data Model Reality

| Entity | Storage | Authoritative Source | Verifiable From Client |
|--------|---------|---------------------|----------------------|
| **Bookings** | Supabase PostgreSQL | DB (server actions) | Yes — via server actions |
| **Payments** | `MOCK_PAYMENTS` in-memory array (client) | In-memory array | Yes — via `usePaymentStore.getPaymentByBookingId()` |

**Key implication:** Payment state is NOT persisted to Supabase. The `payments` table exists in the schema but the mock payment service (`payment.service.ts`) uses a module-level `MOCK_PAYMENTS: Payment[]` array. There is no server-side payment state to query.

### `handleConfirm()` 4-Step Flow — Detailed Trace

```
Step 1: confirmBooking()
  → useBookingStore.confirmBooking() calls createBookingAction()
  → Server: auth check → court validation → GIST constraint → INSERT bookings (Reserved)
  → Returns: { success, booking }
  → On failure: toast error, isProcessing=false, DONE

Step 2: createPayment()
  → usePaymentStore.createPayment() calls createPayment() from payment.service.ts
  → Client: validates bookingId, amount, idempotency check, double-payment check
  → INSERT into MOCK_PAYMENTS[] (Pending)
  → Returns: { success, payment }
  → On failure: toast error, isProcessing=false, DONE

Step 3: processMockPayment()
  → usePaymentStore.processPayment() calls processMockPayment() from payment.service.ts
  → Client: 1.5s artificial delay → validates Pending→Paid transition
  → UPDATE MOCK_PAYMENTS[] (Paid)
  → Returns: { success, payment }
  → On failure: toast error, isProcessing=false, DONE

Step 4: confirmBookingAfterPayment()
  → useBookingStore.confirmBookingAfterPayment() calls confirmBookingStatusAction()
  → Server: auth check → ownership check → verifies status=Reserved → UPDATE bookings (Confirmed)
  → Server: creates booking_confirmed + payment_successful notifications
  → Client: updates Zustand local store to match DB
  → Returns: { success, booking }
  → On failure: toast error, isProcessing=false, P0 STATE
```

### `confirmBookingStatusAction` — Server-Side Behavior

```typescript
// booking.actions.ts lines 324-403
export async function confirmBookingStatusAction(bookingId: string): Promise<BookingResult> {
  // 1. Auth check
  // 2. Fetch booking → verify status = 'Reserved'
  //    If status !== 'Reserved' → return { success: false, error: 'Booking is already X.' }
  // 3. UPDATE bookings SET status = 'Confirmed' WHERE id = bookingId
  // 4. Create booking_confirmed notification
  // 5. Create payment_successful notification
  // 6. Return { success: true, booking }
}
```

**Critical:** This action is NOT idempotent for the notification side effects. If called twice:
- First call: Reserved → Confirmed ✓, creates 2 notifications ✓
- Second call: status check fails (status is now 'Confirmed', not 'Reserved') → returns `{ success: false, error: 'Booking is already confirmed.' }`
- No duplicate notifications created (idempotent in practice because of the status check)

### `refundPayment` — Client-Side Behavior

```typescript
// payment.service.ts lines 178-221
export function refundPayment(paymentId: string, reason?: string): RefundResult {
  // 1. Find payment in MOCK_PAYMENTS[]
  // 2. If status === 'Refunded' → return "already refunded" (idempotent)
  // 3. Validate transition: only Paid → Refunded
  // 4. Simulated failure: if paymentId contains 'fail-refund' → reject
  // 5. UPDATE MOCK_PAYMENTS[] (Refunded)
  // 6. Return { success: true, payment }
}
```

### RLS Policies — Relevant Constraints

**Bookings UPDATE policy** (lines 557-570):
```sql
FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
WITH CHECK (
    public.is_admin()
    OR (
        auth.uid() = user_id
        AND status IN ('Cancelled', 'Confirmed')  -- Users can ONLY set Cancelled or Confirmed
        AND user_id = (SELECT user_id FROM bookings WHERE id = bookings.id)
        AND court_id = (SELECT court_id FROM bookings WHERE id = bookings.id)
        AND total_price = (SELECT total_price FROM bookings WHERE id = bookings.id)
        AND booking_range = (SELECT booking_range FROM bookings WHERE id = bookings.id)
    )
)
```

**Important:** Normal users can ONLY update their booking to `Cancelled` or `Confirmed`. They cannot set `Reserved` or `Expired`. This means:
- `confirmBookingStatusAction` uses `auth.uid() = user_id` path → can set `Confirmed` ✓
- `cancelBookingAction` uses `auth.uid() = user_id` path → can set `Cancelled` ✓
- The `is_admin()` branch bypasses all restrictions

**Payments** — RLS only allows admin access for writes. The mock payment service bypasses RLS entirely (in-memory).

---

## FINDING 1 — [P0] Financial Inconsistency

### Failure Scenario

Steps 1-3 succeed, step 4 fails:
- **Booking:** Reserved (DB) — server-side, authoritative
- **Payment:** Paid (MOCK_PAYMENTS in-memory) — client-side, session-local

Step 4 can fail because:
1. Network timeout (server actually succeeded)
2. Auth expired mid-flow (server rejected)
3. Booking status already changed (concurrent admin action)
4. Supabase error (timeout, connection pool)

### Recovery Strategy — Server-State Verification First

**PRINCIPLE:** Never auto-refund based on client/network error alone. Query authoritative server-side booking state. Decide recovery based on what is ACTUALLY true.

**Step 4 retry with server-side verification:**

```
Step 4 fails →
  1. WAIT 2s (allow transient network recovery)
  2. QUERY server-side booking status via confirmBookingStatusAction()
     - If action SUCCEEDS → booking is now Confirmed → SUCCESS (show confirmation)
     - If action fails with "already confirmed" → SUCCESS (show confirmation)
     - If action fails with other error → continue to step 3
  3. QUERY booking status directly (read-only check via server action or Supabase client)
     - If booking is Confirmed → SUCCESS (show confirmation)
     - If booking is Reserved → RETRY step 4 (idempotent, max 2 retries)
     - If booking is Cancelled/Expired → BOOKING IS LOST, cannot recover
       → Show user error, suggest contacting support
       → Do NOT auto-refund (payment is in-memory, cannot be "refunded" in a meaningful way)
```

**Why this is safe:**
- `confirmBookingStatusAction` is idempotent for the booking update (checks status before update)
- Notification side effects are also idempotent (status check prevents duplicate creation)
- Retrying is safe because the action self-protects against double-confirm
- We NEVER auto-refund based on a client error — we verify server state first
- If booking is already Confirmed, we show success (the user's payment was successful)

**Payment state verification (client-side only):**
- After step 4 failure, query `usePaymentStore.getPaymentByBookingId(bookingId)`
- If payment status is `Paid` → payment succeeded, focus on confirming booking
- If payment status is `Failed` → payment never succeeded, different failure mode
- If payment status is `Pending` → payment was never processed, different failure mode

**Mock vs. Real Payment Provider:**
- Mock: `MOCK_PAYMENTS` in-memory → deterministic, session-local, no real money
- Real: Payment would be in DB (payments table) → authoritative, server-side, real money
- Recovery logic MUST be written to work for BOTH cases:
  - Query server-side booking state (works for both)
  - Query server-side payment state (works for real; mock uses client-side)
  - The architectural pattern is the same; only the payment query source differs

### Recovery Flow — Implementation

Add to `handleConfirm()` after step 4 failure:

```typescript
// Step 4 failed — verify server state before any recovery
const MAX_RETRIES = 2;
let retryCount = 0;
let recovered = false;

while (retryCount <= MAX_RETRIES && !recovered) {
  if (retryCount > 0) {
    await new Promise(r => setTimeout(r, 2000)); // Wait before retry
  }

  // Try confirmation again (idempotent)
  const retryResult = await confirmBookingAfterPayment(bookingResult.booking.id);

  if (retryResult.success) {
    recovered = true;
    toast.success('Booking confirmed!');
    router.push('/book/confirmation');
    break;
  }

  // Check if the error indicates "already confirmed"
  if (retryResult.error?.includes('already confirmed') || 
      retryResult.error?.includes('already')) {
    recovered = true;
    toast.success('Booking confirmed!');
    router.push('/book/confirmation');
    break;
  }

  retryCount++;
}

if (!recovered) {
  // All retries failed — check payment state for messaging
  const paymentState = usePaymentStore.getState().getPaymentByBookingId(bookingResult.booking.id);
  
  if (paymentState?.status === 'Paid') {
    // Payment succeeded but we couldn't confirm booking
    toast.error('Payment received but booking confirmation failed. Please contact support with your booking reference.');
  } else {
    toast.error('Booking confirmation failed. Please try again or contact support.');
  }
  setIsProcessing(false);
}
```

**What we deliberately DO NOT do:**
- Auto-refund the payment
- Auto-cancel the booking
- Create a new booking
- Create a new payment

**Why:** The payment is mock (in-memory), and refunding it has no real-world impact. The booking may have been confirmed by a concurrent request (network timeout scenario). Auto-actions could cause duplicate bookings or payments.

### Files to Modify
- `src/app/book/payment/page.tsx` — `handleConfirm()` function: add retry loop with server-state verification

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Retry succeeds after original actually succeeded | `confirmBookingStatusAction` is idempotent — second call returns "already confirmed" |
| Auth expired during retry | Auth check in `confirmBookingStatusAction` catches this → error shown |
| Booking was cancelled by admin during retry | Status check in `confirmBookingStatusAction` catches this → error shown |
| User confusion | Clear toast messages: "Retrying confirmation..." → "Confirmed!" or "Contact support" |
| Race condition: retry + concurrent admin cancel | Server-side atomic UPDATE handles this — only one transition succeeds |

---

## FINDING 2 — [P1] Payment Page Refresh Returns 500

### Root Cause Analysis

The payment page (`src/app/book/payment/page.tsx`) has these guards:

```tsx
// Line 36-47: First guard
if (!selectedCourt || selectedSlots.length === 0) { return <empty state>; }

// Line 49-57: Second guard  
if (!bookingHydrated) { return <loading>; }

// Line 59-62: Third guard
if (!userName || !userEmail) { router.push('/book/details'); return null; }
```

**On direct navigation to `/book/payment`:**
1. Zustand rehydrates from localStorage
2. If user refreshed mid-flow, `selectedCourt`/`selectedSlots` may be null/empty
3. First guard catches this → shows "No booking in progress" → **correct behavior**

**The reported 500 error needs verification.** The code already has guards. Possible causes:
1. `bookingHydrated` is false during SSR/hydration → React error boundary
2. A component inside tries to access null court properties before guards execute
3. The redirect at line 60 causes a render loop

### Verification Required (Before Any Fix)

1. Navigate to `/book/payment` directly while logged in → check for 500
2. Navigate to `/book/payment` while not logged in → check for 500
3. Navigate to `/book/payment` after completing a full booking flow → check for 500
4. Check browser console for hydration errors

### Proposed Fix (Only If 500 Confirmed)

If 500 is confirmed, add a safety wrapper around the page:

```tsx
// Add try-catch boundary at component top
export default function BookingPaymentPage() {
  try {
    // ... existing component
  } catch (error) {
    return (
      <SiteContainer className="py-16 text-center">
        <p className="text-red-500">Something went wrong. Please start over.</p>
        <Button onClick={() => router.push('/book')}>Start Over</Button>
      </SiteContainer>
    );
  }
}
```

### Files to Modify
- `src/app/book/payment/page.tsx` — ONLY if 500 is confirmed during verification

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Fix not needed (guards already work) | Verify first; don't add unnecessary code |
| Fix breaks existing behavior | Wrap in try-catch; only catch render errors |

---

## FINDING 3 — [P2] No Payment Retry Mechanism

### Root Cause Analysis

When `handleConfirm()` fails at any step, `isProcessing` is reset to `false` but no explicit error state is shown. The "Confirm & Pay" button is re-enabled (since `isProcessing` is false), so the user *can* retry by clicking again. However:

1. No visual indication that a failure occurred (beyond the toast)
2. No explicit "Retry" button
3. No "Start Over" option
4. User may not understand they can click again

### Proposed Fix

Combine with F1/P0 fix: add an error state that shows:
- What went wrong (step-specific message)
- "Retry" button (calls `handleConfirm()` again, which handles idempotency)
- "Start Over" link (resets booking flow)
- "Contact Support" link (if retries exhausted)

**Files to modify:**
- `src/app/book/payment/page.tsx` — add error state UI after failed `handleConfirm()`

**No DB changes required.**

---

## FINDING 4 — [P2] Notification FK Trigger Blocks Booking Updates

### Root Cause Analysis

The `enforce_notification_immutable_fields` trigger prevents changes to `related_booking_id` on existing notifications.

**This is intentional.** Verified by reading the schema and trigger code:

```sql
-- Schema (line 188): ON DELETE SET NULL — if booking deleted, notification FK becomes NULL
related_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
```

The trigger blocks ONLY: changing `related_booking_id` on an existing notification. It does NOT block:
- Creating new bookings
- Updating booking status
- Deleting bookings (FK has `ON DELETE SET NULL`)
- Creating notifications

### Verified Behavior

1. **Booking creation** → `createBookingAction` inserts booking → creates notification with `related_booking_id` → ✓ no conflict
2. **Booking status update** → `confirmBookingStatusAction` updates booking status → creates new notifications → ✓ no conflict
3. **Booking cancellation** → `cancelBookingAction` updates booking status → creates notification → ✓ no conflict
4. **Booking deletion** → FK `ON DELETE SET NULL` nullifies notification's `related_booking_id` → ✓ no conflict
5. **Notification re-linking** → BLOCKED by trigger → ✓ correct behavior (intentional)

### Proposed Fix

**No fix required.** Document as intentional behavior. The trigger is working as designed to maintain notification audit integrity.

---

## Implementation Order

1. **Finding 2 (P1)** — Verify 500 scenario first (no code changes needed if guards work)
2. **Finding 1 (P0)** — Add retry loop with server-state verification in `handleConfirm()`
3. **Finding 3 (P2)** — Add error state UI with retry affordance
4. **Finding 4 (P2)** — No action (document as intentional)

## Verification Plan

1. `npx tsc --noEmit` — TypeScript compilation check
2. `npx next build` — Production build verification
3. Full Vitest suite — Unit test regression
4. Re-run Phase 22.20 E2E tests (42/42) — No regressions
5. Add 16 focused regression tests for each finding
6. Manual E2E: trigger P0 scenario (mock step 4 failure), verify retry + server-state check
7. Manual E2E: navigate to `/book/payment` directly, verify no 500
8. Database post-test audit: verify no schema changes, all constraints intact

## Deliverables

| File | Status |
|------|--------|
| `FAILURE-REMEDIATION-PLAN-22-20-1.md` | This file (REVISED) |
| `src/app/book/payment/page.tsx` | To be modified |
| `tests/e2e-failure-edge-case.spec.ts` | To be modified (new regression tests) |
| `FAILURE-REMEDIATION-22-20-1.md` | To be created after implementation |

---

## Approval Required

**STOP — Do not implement until explicitly approved.**

Changes to make:
1. Verify F2 (P1) — test `/book/payment` direct navigation
2. Modify `src/app/book/payment/page.tsx` — add retry loop with server-state verification
3. Modify `src/app/book/payment/page.tsx` — add error state UI
4. Add regression tests

Changes NOT to make:
- No auto-refund logic
- No database migrations
- No RLS changes
- No new server actions
- No payment service modifications
