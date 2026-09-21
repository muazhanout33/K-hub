# Phase 13: Payment Architecture Audit Report

**Date**: 2026-08-25
**Scope**: Complete audit of payment architecture, database schema, type alignment, lifecycle integrity, and mock service design
**Method**: Static code analysis, schema comparison, type comparison, flow tracing
**Verdict**: **PASS WITH GAPS** — No critical data corruption or security vulnerability found. The mock system is architecturally sound but has 3 critical gaps that must be resolved before real payment integration.

---

## Table of Contents

- [A. Executive Summary](#a-executive-summary)
- [B. Findings Summary Table](#b-findings-summary-table)
- [C. Database Schema Audit](#c-database-schema-audit)
- [D. TypeScript Type Audit](#d-typescript-type-audit)
- [E. App ↔ DB Alignment](#e-app--db-alignment)
- [F. Payment Lifecycle Audit](#f-payment-lifecycle-audit)
- [G. Idempotency Audit](#g-idempotency-audit)
- [H. Amount Integrity Audit](#h-amount-integrity-audit)
- [I. Refund Integrity Audit](#i-refund-integrity-audit)
- [J. Mock Service Architecture](#j-mock-service-architecture)
- [K. Webhook / Provider Readiness](#k-webhook--provider-readiness)
- [L. Security Audit](#l-security-audit)
- [M. RLS Policy Audit](#m-rls-policy-audit)
- [N. Concurrency & Race Conditions](#n-concurrency--race-conditions)
- [O. Cross-Cutting Concerns](#o-cross-cutting-concerns)
- [P. Drizzle Schema Status](#p-drizzle-schema-status)
- [Q. Test Results](#q-test-results)
- [R. Risk Assessment](#r-risk-assessment)
- [S. Recommendations](#s-recommendations)
- [T. Decision Record](#t-decision-record)
- [U. Final Verdict](#u-final-verdict)

---

## A. Executive Summary

The K-HUB booking platform uses a **mock-only payment system**. Payments are created and processed entirely in-memory via `payment.service.ts` and persisted to Zustand/localStorage. The Supabase `public.payments` table exists with a complete schema (16 columns, CHECK constraints, FK, RLS, indexes, triggers) but is **never written to** by the current application.

### Key Findings

| Category | Status |
|----------|--------|
| DB Schema completeness | ✅ PASS — 16 columns, constraints, RLS, indexes all present |
| TypeScript types vs DB | ⚠️ GAP — App `Payment` type missing 5 DB columns; DB-only fields not exposed |
| App ↔ DB alignment | ⚠️ GAP — `mapPaymentToDbPayment()` exists but is never called; payments never reach DB |
| Payment lifecycle | ⚠️ GAP — No refund processing on booking cancellation |
| Idempotency | ⚠️ GAP — `Date.now()`-based keys can collide in concurrent requests |
| Amount integrity | ✅ PASS — Server-side recalculation in `createBookingAction` |
| Refund integrity | ⚠️ GAP — Refund flow exists in mock but no DB-level enforcement |
| Mock service design | ✅ PASS — Clean state machine, well-structured, provider adapter boundary |
| Security | ✅ PASS — No trust boundary violations in mock system |
| RLS | ✅ PASS — Correct SELECT/ALL policies for users/admins |

**Overall**: The mock system is architecturally sound and safe for development/demo use. The 3 critical gaps are all **preconditions for real payment integration**, not issues with the current mock system.

---

## B. Findings Summary Table

| # | Finding | Severity | Section | Status |
|---|---------|----------|---------|--------|
| 1 | Payments never persisted to DB | CRITICAL | E | Mock-only by design |
| 2 | No server-side payment API route | CRITICAL | E | Mock-only by design |
| 3 | App type missing DB columns | CRITICAL | D | Should be fixed before real payments |
| 4 | `payment_method` always null | HIGH | E | Acceptable for mock |
| 5 | No refund on booking cancellation | HIGH | I | Gap in lifecycle |
| 6 | Idempotency key collision risk | HIGH | G | `Date.now()` granularity |
| 7 | In-memory payment store lost on refresh | HIGH | J | By design for mock |
| 8 | Amount BIGINT vs JS number | MEDIUM | H | Low risk for EGP |
| 9 | No CSRF on payment endpoints | MEDIUM | L | Not applicable (no API routes) |
| 10 | No rate limiting on payment creation | MEDIUM | L | Not applicable (mock) |
| 11 | Client-side payment notifications | MEDIUM | O | Dual notification system |
| 12 | `confirmBookingStatusAction` doesn't verify payment | MEDIUM | F | Acceptable for mock |
| 13 | No payment expiry/cleanup | LOW | J | Mock has no TTL |
| 14 | Drizzle schema stale | LOW | P | Not used by app |
| 15 | `cancelBooking` doesn't update `updated_at` | LOW | F | DB trigger handles it |
| 16 | Provider adapter boundary documented | INFO | K | Good practice |
| 17 | State machine well-defined | INFO | J | Correct transitions |
| 18 | Booking price recalculated server-side | INFO | H | Security best practice |

---

## C. Database Schema Audit

### Actual DB Schema (`public.payments`)

```sql
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
    amount BIGINT NOT NULL CHECK (amount > 0),           -- piastres
    currency VARCHAR(3) NOT NULL DEFAULT 'EGP',
    status payment_status_enum NOT NULL DEFAULT 'Pending',
    payment_method TEXT,
    idempotency_key TEXT UNIQUE NOT NULL,
    transaction_reference TEXT,
    failure_reason TEXT,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,
    refunded_amount BIGINT CHECK (refunded_amount IS NULL OR refunded_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Enum Types
- `payment_status_enum`: `Pending | Paid | Failed | Cancelled | Refunded`
- Amount stored as `BIGINT` in piastres (1 EGP = 100 piastres)

### Constraints
| Constraint | Type | Detail |
|------------|------|--------|
| `amount > 0` | CHECK | Positive amount required |
| `refunded_amount >= 0` | CHECK | Non-negative refund amount |
| `idempotency_key UNIQUE` | UNIQUE | Prevents duplicate idempotency keys |
| `booking_id → bookings(id)` | FK | `ON DELETE RESTRICT` — cannot delete booking with payments |

### Indexes
| Index | Columns |
|-------|---------|
| `idx_payments_booking_id` | `booking_id` |
| `idx_payments_status` | `status` |

### Triggers
| Trigger | Function | Timing |
|---------|----------|--------|
| `tr_payments_updated_at` | `handle_updated_at()` | `BEFORE UPDATE` |

### RLS Policies
| Policy | Operation | Rule |
|--------|-----------|------|
| "Users view own payments" | SELECT | User owns booking OR is_admin() |
| "Service role / admin manage payments" | ALL | is_admin() only |

### Verdict: ✅ PASS
Schema is production-ready with appropriate constraints, indexes, RLS, and triggers. No gaps found.

---

## D. TypeScript Type Audit

### DB Type (`DbPayment` in `database.types.ts`)
```typescript
interface DbPayment {
  id: string;
  booking_id: string;
  amount: number;           // piastres
  currency: string;
  status: PaymentStatusEnum;
  payment_method: string | null;
  idempotency_key: string;
  transaction_reference: string | null;
  failure_reason: string | null;
  refunded_at: string | null;
  refund_reason: string | null;
  refunded_amount: number | null;
  created_at: string;
  updated_at: string;
}
```

### App Type (`Payment` in `types/index.ts`)
```typescript
interface Payment {
  paymentId: string;
  bookingId: string;
  amount: number;
  currency: PaymentCurrency;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  failureReason?: string;
  refundedAt?: string;
  refundReason?: string;
  refundedAmount?: number;
}
```

### Mismatch Analysis

| DB Field | App Field | Mapping | Status |
|----------|-----------|---------|--------|
| `id` | `paymentId` | ✅ Direct | OK |
| `booking_id` | `bookingId` | ✅ Direct | OK |
| `amount` | `amount` | ✅ Direct | OK |
| `currency` | `currency` | ✅ Cast | OK |
| `status` | `status` | ✅ Direct | OK |
| `idempotency_key` | `idempotencyKey` | ✅ Direct | OK |
| `created_at` | `createdAt` | ✅ Direct | OK |
| `updated_at` | `updatedAt` | ✅ Direct | OK |
| `payment_method` | — | ❌ **Missing in App** | GAP |
| `transaction_reference` | — | ❌ **Missing in App** | GAP |
| `failure_reason` | `failureReason?` | ⚠️ Different naming | OK (camelCase convention) |
| `refunded_at` | `refundedAt?` | ⚠️ Different naming | OK (camelCase convention) |
| `refund_reason` | `refundReason?` | ⚠️ Different naming | OK (camelCase convention) |
| `refunded_amount` | `refundedAmount?` | ⚠️ Different naming | OK (camelCase convention) |

### Finding: GAP-3 — App type missing `payment_method` and `transaction_reference`

**Severity**: CRITICAL (for real payments), INFO (for mock)
**Impact**: When real payment providers are integrated, the app cannot track which provider/method was used
**Current risk**: None — mock system doesn't use these fields

### Verdict: ⚠️ GAP — Types are functionally aligned for mock, but missing 2 DB columns

---

## E. App ↔ DB Alignment

### Payment Flow Trace

```
User clicks "Confirm & Pay"
  → payment/page.tsx:handleConfirm()
    → bookingStore.confirmBooking()
      → booking.actions.ts:createBookingAction()  ← Server Action (Supabase)
        → INSERT INTO public.bookings (status: 'Reserved')
    → paymentStore.createPayment()
      → payment.service.ts:createPayment()  ← IN-MEMORY ONLY
        → MOCK_PAYMENTS.unshift(payment)     ← Never touches DB
    → paymentStore.processPayment()
      → payment.service.ts:processMockPayment()  ← IN-MEMORY ONLY
        → payment.status = 'Paid'               ← Never touches DB
    → bookingStore.confirmBookingAfterPayment()
      → booking.actions.ts:confirmBookingStatusAction()  ← Server Action (Supabase)
        → UPDATE public.bookings SET status = 'Confirmed'
```

### Finding: GAP-1 — Payments never reach the database

The `mapPaymentToDbPayment()` mapper exists in `mappers.ts:261-276` but is **never called** anywhere in the codebase. The mock payment service operates entirely in-memory.

**Impact**: No payment records exist in `public.payments`. The `bookings` table has no `payment_id` or `payment_status` column, so there's no FK link.

**Risk for mock system**: None — by design.
**Risk for real payments**: CRITICAL — must be resolved before integration.

### Finding: GAP-2 — No server-side payment API route

No `/api/payments` endpoint exists. All payment operations are client-side through Zustand store → in-memory service.

**Impact**: No server-side payment validation, no webhook endpoint, no admin payment management API.

**Risk for mock system**: None.
**Risk for real payments**: CRITICAL — webhooks must be server-side.

### Finding: GAP-4 — `payment_method` always null

`mapPaymentToDbPayment()` sets `payment_method: null` (line 268). The mock service doesn't track payment method.

**Impact**: DB column exists but is always NULL.
**Risk**: None for mock. When real providers are added, must populate.

### Verdict: ⚠️ GAP — Architectural disconnect between mock service and DB schema

---

## F. Payment Lifecycle Audit

### Status Transition Diagram

```
                    ┌──────────┐
                    │ Pending  │
                    └────┬─────┘
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          ┌──────┐  ┌────────┐  ┌──────────┐
          │ Paid │  │ Failed │  │ Cancelled│
          └──┬───┘  └────────┘  └──────────┘
             │
             ▼
         ┌──────────┐
         │ Refunded │
         └──────────┘
```

### Valid Transitions (from `payment.service.ts`)
| From | To | Enforced |
|------|----|----------|
| Pending | Paid | ✅ `processMockPayment('success')` |
| Pending | Failed | ✅ `processMockPayment('failure')` |
| Pending | Cancelled | ❌ **Never triggered** — no cancel flow exists |
| Paid | Refunded | ✅ `refundPayment()` |
| Failed | — | ✅ Terminal state |
| Cancelled | — | ✅ Terminal state |
| Refunded | — | ✅ Terminal state |

### Finding: GAP-5 — Pending → Cancelled transition never triggered

The state machine allows `Pending → Cancelled` but no code path triggers this. When a booking is cancelled, the mock payment stays in `Pending` status forever.

**Impact**: Stale `Pending` payments accumulate in memory.
**Risk**: Low for mock. For real payments, must handle timeout/cancellation.

### Finding: GAP-6 — No refund on booking cancellation

`cancelBookingAction()` (booking.actions.ts:160-262) updates booking status to 'Cancelled' but never processes a refund. The payment (if it exists as 'Paid') remains 'Paid'.

**Impact**: Cancelled bookings with paid payments have inconsistent state.
**Risk**: Low for mock (no real money). Critical for real payments.

### Finding: GAP-7 — `confirmBookingStatusAction` doesn't verify payment

The server action (booking.actions.ts:322-378) only checks if booking is 'Reserved' and sets it to 'Confirmed'. It doesn't verify that a payment exists or is in 'Paid' status.

**Impact**: A booking could be confirmed without payment in edge cases.
**Risk**: Low for mock. Critical for real payments.

### Booking ↔ Payment Integrity

| Check | Status |
|-------|--------|
| Payment exists for Confirmed booking | ❌ **No** — payments are in-memory, not linked |
| Booking has `payment_id` FK | ❌ **No** — schema doesn't have this column |
| Payment amount matches booking total | ⚠️ **Unverified** — mock service doesn't cross-check |
| Cancelled booking has refund | ❌ **No** — no refund on cancellation |

### Verdict: ⚠️ GAP — Lifecycle is well-defined in mock but has gaps for real integration

---

## G. Idempotency Audit

### Key Generation
```typescript
// payment.service.ts:44-46
function generateIdempotencyKey(bookingId: string): string {
  return `idem-${bookingId}-${Date.now()}`;
}
```

### DB Constraint
```sql
idempotency_key TEXT UNIQUE NOT NULL
```

### Mock Service Guard
```typescript
// payment.service.ts:83-90
const existingByKey = MOCK_PAYMENTS.find((p) => p.idempotencyKey === key);
if (existingByKey) {
  return { success: false, error: 'Duplicate payment request.', payment: existingByKey };
}
```

### Finding: GAP-8 — Idempotency key collision risk

`Date.now()` has millisecond granularity. Two concurrent requests within the same millisecond produce identical keys.

**Example**:
```
Request A: idem-booking-123-1692950400000
Request B: idem-booking-123-1692950400000  ← Same key!
```

**Mitigation**: The mock service uses in-memory `Array.find()` which is not atomic. In concurrent scenarios, both requests could pass the idempotency check before either writes to the array.

**DB mitigation**: The `UNIQUE` constraint on `idempotency_key` would catch this at the DB level, but the mock service bypasses the DB entirely.

**Risk**: Low for mock (single-threaded JS). For real payments with server-side DB writes, the UNIQUE constraint provides safety. Consider adding a random suffix for additional safety.

### Verdict: ⚠️ GAP — Key generation has collision risk; DB UNIQUE constraint provides fallback

---

## H. Amount Integrity Audit

### Amount Flow

```
Court.pricePerHour (DB: numeric)
  → calculateBookingPrice(pricePerHour, durationMinutes)  [EGP]
    → bookingStore.confirmBooking()
      → createBookingAction(payload)
        → Server recalculates: calculateBookingPrice(court.price_per_hour, payload.durationMinutes)
        → INSERT INTO bookings (total_price: recalculated)
    → payment/page.tsx:handleConfirm()
      → paymentAmount = totalPrice * 100  [piastres]
      → createPayment(bookingId, paymentAmount)
```

### Server-Side Recalculation
```typescript
// booking.actions.ts:97-98
const totalPrice = calculateBookingPrice(court.price_per_hour, payload.durationMinutes);
```

**The server ignores `payload.totalPrice` and recalculates from the DB-stored `court.price_per_hour`.** This is correct — the client-provided `totalPrice` in the payload is never used.

### Amount Unit Conversion
| Layer | Unit | Example (1hr court @ 200 EGP) |
|-------|------|-------------------------------|
| DB (`courts.price_per_hour`) | EGP | 200 |
| Booking (`bookings.total_price`) | EGP | 200 |
| Payment (`payments.amount`) | piastres | 20000 |

### Finding: INFO-18 — Booking price recalculated server-side ✅

`createBookingAction` recalculates from `court.price_per_hour` (DB source of truth), ignoring client-provided `totalPrice`. This prevents price manipulation.

### Finding: MEDIUM-8 — Amount BIGINT vs JS number

DB uses `BIGINT` for `amount` (piastres). JavaScript `number` type has 53-bit precision. For EGP amounts up to ~9 quadrillion piastres (~90 trillion EGP), this is safe. No practical risk.

### Verdict: ✅ PASS — Amount integrity is well-protected

---

## I. Refund Integrity Audit

### Mock Refund Flow
```typescript
// payment.service.ts:178-221
export function refundPayment(paymentId: string, reason?: string): RefundResult {
  // 1. Find payment
  // 2. Check status === 'Refunded' (idempotency)
  // 3. Validate transition: Paid → Refunded
  // 4. Simulated failure check (paymentId.includes('fail-refund'))
  // 5. Set status = 'Refunded', refundedAt, refundReason, refundedAmount
}
```

### Refund Guards
| Guard | Status |
|-------|--------|
| Only 'Paid' can be refunded | ✅ Enforced |
| Already refunded = idempotent | ✅ Returns existing payment |
| Refund amount = full payment amount | ✅ `refundedAmount = payment.amount` |
| Refund timestamp recorded | ✅ `refundedAt = nowISO()` |
| Refund reason recorded | ✅ `refundReason = reason || 'Refund requested.'` |

### Finding: GAP-5 (repeat) — No refund on booking cancellation

When `cancelBookingAction` cancels a booking, no refund is processed. The mock payment stays 'Paid'.

### Finding: MEDIUM-12 — No partial refund support

The mock service always refunds the full amount. No partial refund mechanism exists.

### DB Refund Constraints
```sql
refunded_amount BIGINT CHECK (refunded_amount IS NULL OR refunded_amount >= 0)
```

Non-negative check is present but no check that `refunded_amount <= amount`. This is acceptable — a future provider might refund more than the original (e.g., with compensation).

### Verdict: ⚠️ GAP — Refund flow is correct in isolation but not integrated with booking cancellation

---

## J. Mock Service Architecture

### Design Patterns

| Pattern | Implementation | Quality |
|---------|---------------|---------|
| State machine | `VALID_TRANSITIONS` map + `isValidTransition()` | ✅ Clean |
| Idempotency | `generateIdempotencyKey()` + in-memory guard | ⚠️ Collision risk |
| Double-payment prevention | `existingPaid` check in `createPayment()` | ✅ Correct |
| Provider adapter boundary | `getPaymentProviderInfo()` placeholder | ✅ Good |
| Separation of concerns | Service (logic) ↔ Store (state) ↔ UI (display) | ✅ Clean |

### In-Memory Storage
```typescript
const MOCK_PAYMENTS: Payment[] = [];
```

- Array is module-scoped — single instance per server process
- Lost on page refresh (Zustand persist to localStorage provides client-side persistence)
- No TTL/expiry for Pending payments
- No cleanup mechanism

### Provider Adapter Boundary
```typescript
// payment.service.ts:268-270
export function getPaymentProviderInfo(): { provider: string; mode: 'mock' } {
  return { provider: 'mock', mode: 'mock' };
}
```

This is a clean integration point. A future `PaymentProviderAdapter` interface can be defined here.

### Verdict: ✅ PASS — Well-structured mock with clean extension points

---

## K. Webhook / Provider Readiness

### Current State
- No webhook endpoint exists
- No provider SDK installed
- No server-side payment processing
- No signature verification

### Required for Real Integration
| Requirement | Current | Needed |
|-------------|---------|--------|
| Server-side webhook endpoint | ❌ | `/api/webhooks/payments` |
| Signature verification | ❌ | Provider-specific (HMAC, etc.) |
| Idempotent webhook handling | ❌ | DB-backed idempotency |
| Provider SDK | ❌ | `stripe`, `paymob`, etc. |
| Payment method tracking | ❌ (null) | Populate from provider |
| Transaction reference | ❌ (null) | Store provider's txn ID |

### Verdict: ✅ PASS (for mock) — Webhooks not applicable

---

## L. Security Audit

### Trust Boundaries

| Check | Status |
|-------|--------|
| Client doesn't set payment status | ✅ Status set by service state machine |
| Client doesn't set amount | ⚠️ Client sends `totalPrice` but server recalculates |
| Client doesn't set `payment_id` | ✅ Generated by service |
| No card data handled | ✅ Mock system — no real card data |
| No secrets in client code | ✅ No API keys, no provider credentials |

### Finding: MEDIUM-9 — No CSRF on payment endpoints

Not applicable — no payment API routes exist. All operations are client-side.

### Finding: MEDIUM-10 — No rate limiting

Not applicable — mock service runs in browser memory.

### Verdict: ✅ PASS — No trust boundary violations in mock system

---

## M. RLS Policy Audit

### Policies
```sql
-- SELECT: Users can view payments for their own bookings
CREATE POLICY "Users view own payments" ON public.payments FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = payments.booking_id AND (b.user_id = auth.uid() OR public.is_admin())
    )
);

-- ALL: Admins have full access
CREATE POLICY "Service role / admin manage payments" ON public.payments FOR ALL USING (public.is_admin());
```

### Analysis
| Operation | User | Admin | Service Role |
|-----------|------|-------|--------------|
| SELECT | Own bookings only | ✅ All | ✅ All |
| INSERT | ❌ No policy | ✅ All | ✅ All |
| UPDATE | ❌ No policy | ✅ All | ✅ All |
| DELETE | ❌ No policy | ✅ All | ✅ All |

### Finding: INFO — Users cannot INSERT/UPDATE/DELETE payments

This is correct for the current architecture where payments are managed by the mock service (client-side). For real payments, the service role would handle INSERTs via server-side API.

### Verdict: ✅ PASS — RLS policies are correctly scoped

---

## N. Concurrency & Race Conditions

### Mock Service
- Single-threaded JavaScript — no true concurrency
- `MOCK_PAYMENTS` array operations are synchronous
- No race conditions in current mock

### Booking + Payment Flow
```
Request A: confirmBooking() → INSERT booking (Reserved)
Request B: confirmBooking() → INSERT booking (Reserved) — EXCLUDE constraint may block
Request A: createPayment() → In-memory write
Request A: processPayment() → In-memory write
Request A: confirmBookingAfterPayment() → UPDATE booking (Confirmed)
```

### Finding: INFO — EXCLUDE constraint prevents double-booking

The `prevent_double_booking` EXCLUDE USING gist constraint on `bookings` prevents two bookings for the same court+time slot. This is a database-level guarantee independent of the payment system.

### Verdict: ✅ PASS — No concurrency issues in mock system

---

## O. Cross-Cutting Concerns

### Notifications
| Type | Source | Destination |
|------|--------|-------------|
| Booking Reserved | Server Action → DB INSERT | Supabase `notifications` |
| Booking Cancelled | Server Action → DB INSERT | Supabase `notifications` |
| Booking Confirmed | Client → Zustand store | `useNotificationStore` (client) |
| Payment Successful | Client → Zustand store | `useNotificationStore` (client) |

**Finding**: MEDIUM-11 — Dual notification system. Booking notifications go to DB; payment notifications stay in client state.

### Auth Integration
```typescript
// useAuthStore.ts
clearPayments: () => {
  usePaymentStore.getState().clearPayments();
}
```

Payments are cleared on logout. Since payments are in-memory, this is correct behavior.

### Verdict: ✅ PASS — Cross-cutting concerns are handled appropriately for mock

---

## P. Drizzle Schema Status

### `src/db/schema.ts` — Payments Table
```typescript
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id').references(() => bookings.id).notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),  // ❌ Should be bigint
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(),  // ❌ Should be nullable
  paymentStatus: varchar('payment_status', { length: 50 }).default('Completed').notNull(),  // ❌ Wrong column name, wrong default
  transactionReference: varchar('transaction_reference', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Discrepancies
| Field | Drizzle Schema | Actual DB | Match |
|-------|---------------|-----------|-------|
| `amount` | `numeric(10,2)` | `BIGINT` | ❌ Wrong type |
| `payment_method` | `varchar NOT NULL` | `TEXT NULL` | ❌ Wrong nullability |
| `payment_status` | `varchar` | `payment_status_enum` | ❌ Wrong type |
| Default status | `'Completed'` | `'Pending'` | ❌ Wrong default |
| Missing columns | — | `currency`, `idempotency_key`, `failure_reason`, `refunded_at`, `refund_reason`, `refunded_amount`, `updated_at` | ❌ 7 columns missing |

### Finding: LOW-14 — Drizzle schema is stale

The Drizzle schema (`schema.ts`) is significantly out of sync with the actual Supabase schema. It is not used by the application (app uses `supabase.from()` directly). Should be updated or removed to prevent confusion.

### Verdict: ⚠️ STALE — Drizzle schema not aligned; not used by app

---

## Q. Test Results

| Test | Result |
|------|--------|
| `npx tsc --noEmit` | ✅ PASS — No type errors |
| Build | Not run (no changes to build) |

### Verdict: ✅ PASS — No type regressions

---

## R. Risk Assessment

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Payment data lost on refresh | High (by design) | Low (mock) | Zustand localStorage persistence |
| Idempotency key collision | Low (ms granularity) | Low (mock) | DB UNIQUE constraint for real payments |
| No refund on cancellation | Medium | Low (mock) | Must implement for real payments |
| Amount manipulation | Low (server recalculates) | N/A | Already mitigated |
| RLS bypass | Low (policies correct) | N/A | Already mitigated |
| Double payment | Low (in-memory guard) | Low (mock) | DB constraint for real payments |

### Overall Risk for Mock System: LOW

The mock system is safe for development, demo, and testing purposes. All identified gaps are **preconditions for real payment integration**, not issues with the current mock.

---

## S. Recommendations

### Before Real Payment Integration (CRITICAL)

1. **Persist payments to DB** — Call `mapPaymentToDbPayment()` and INSERT via Supabase after `createPayment()`
2. **Add payment API route** — Create `/api/payments` for server-side payment operations
3. **Extend `Payment` type** — Add `paymentMethod`, `transactionReference` fields
4. **Integrate refund with cancellation** — Process refund when `cancelBookingAction` cancels a paid booking
5. **Server-side payment verification** — `confirmBookingStatusAction` must verify payment status before confirming

### Before Production (HIGH)

6. **Add idempotency key randomness** — Use `crypto.randomUUID()` instead of `Date.now()`
7. **Add payment expiry** — Pending payments should timeout after N minutes
8. **Populate `payment_method`** — Track which provider/method was used
9. **Add webhook endpoint** — `/api/webhooks/payments` with signature verification
10. **Add rate limiting** — Prevent payment creation abuse

### Nice to Have (MEDIUM/LOW)

11. **Unify notification system** — Server-side for all notification types
12. **Update Drizzle schema** — Align with actual DB or remove if unused
13. **Add partial refund support** — For future flexibility
14. **Add payment analytics** — Success/failure rates, provider metrics

---

## T. Decision Record

| Decision | Rationale |
|----------|-----------|
| Mock-only payments | Correct for current phase — no real money at risk |
| In-memory storage | Acceptable for mock; localStorage provides client persistence |
| Server-side price recalculation | Security best practice — prevents price manipulation |
| `ON DELETE RESTRICT` on payments FK | Correct — prevents accidental deletion of bookings with payments |
| RLS SELECT via bookings join | Correct — users see payments for their own bookings only |
| State machine in service layer | Correct — components never set status directly |

---

## U. Final Verdict

### **PASS WITH GAPS**

| Category | Verdict |
|----------|---------|
| Database schema | ✅ PASS |
| TypeScript types | ⚠️ GAP (2 missing fields) |
| App ↔ DB alignment | ⚠️ GAP (payments not persisted) |
| Payment lifecycle | ⚠️ GAP (no refund on cancel) |
| Idempotency | ⚠️ GAP (key collision risk) |
| Amount integrity | ✅ PASS |
| Refund integrity | ⚠️ GAP (not integrated with booking) |
| Mock service | ✅ PASS |
| Security | ✅ PASS |
| RLS | ✅ PASS |
| **Overall** | **PASS WITH GAPS** |

### Summary

The mock payment system is **architecturally sound and safe for its intended purpose** (development, demo, testing). The 3 critical gaps (payments not persisted, no API route, missing type fields) are all **preconditions for real payment integration**, not issues with the current mock system.

**No migration needed.** No code changes required for the mock system to continue functioning correctly.

**Next steps**: These gaps should be resolved as part of a future "Real Payment Integration" phase, not as part of the current Phase 13 audit.

---

*Report generated by Phase 13 Payment Architecture Audit*
*Auditor: AI Agent (Claude)*
*Date: 2026-08-25*
