import { Payment, PaymentStatus, PaymentResult, RefundResult } from '@/types';

// ──────────────────────────────────────────────
// MOCK DATA — single source of truth for payments
// ──────────────────────────────────────────────

const MOCK_PAYMENTS: Payment[] = [];

// ──────────────────────────────────────────────
// STATE MACHINE
// ──────────────────────────────────────────────

/**
 * Valid payment status transitions.
 * Enforced at the service layer — Components must never change status directly.
 *
 *   Pending  → Paid
 *   Pending  → Failed
 *   Pending  → Cancelled
 *   Paid     → Refunded
 *
 * All other transitions are rejected.
 */
const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  Pending: ['Paid', 'Failed', 'Cancelled'],
  Paid: ['Refunded'],
  Failed: [],
  Cancelled: [],
  Refunded: [],
};

function isValidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

function generatePaymentId(): string {
  return `pay-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function generateIdempotencyKey(bookingId: string): string {
  return `idem-${bookingId}-${Date.now()}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

// ──────────────────────────────────────────────
// CREATE PAYMENT
// ──────────────────────────────────────────────

/**
 * Creates a new payment in Pending status.
 *
 * Validates:
 * - bookingId is non-empty
 * - amount is a positive integer
 * - No existing Paid payment for this booking (double-payment prevention)
 * - No duplicate idempotency key (idempotency)
 *
 * Returns PaymentResult with the created payment or error.
 */
export function createPayment(
  bookingId: string,
  amount: number,
  idempotencyKey?: string
): PaymentResult {
  // ── Validation 1: required fields ──
  if (!bookingId || bookingId.trim().length === 0) {
    return { success: false, error: 'Booking ID is required.' };
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, error: 'Payment amount must be a positive integer (smallest currency unit).' };
  }

  const key = idempotencyKey || generateIdempotencyKey(bookingId);

  // ── Validation 2: idempotency — reject duplicate key ──
  const existingByKey = MOCK_PAYMENTS.find((p) => p.idempotencyKey === key);
  if (existingByKey) {
    return {
      success: false,
      error: 'Duplicate payment request. This payment has already been submitted.',
      payment: existingByKey,
    };
  }

  // ── Validation 3: double-payment prevention — reject if booking already has a Paid payment ──
  const existingPaid = MOCK_PAYMENTS.find(
    (p) => p.bookingId === bookingId && p.status === 'Paid'
  );
  if (existingPaid) {
    return {
      success: false,
      error: 'This booking has already been paid for.',
      payment: existingPaid,
    };
  }

  // ── Create payment ──
  const ts = nowISO();
  const payment: Payment = {
    paymentId: generatePaymentId(),
    bookingId,
    amount,
    currency: 'EGP',
    status: 'Pending',
    createdAt: ts,
    updatedAt: ts,
    idempotencyKey: key,
  };

  MOCK_PAYMENTS.unshift(payment);

  return { success: true, payment };
}

// ──────────────────────────────────────────────
// MOCK PAYMENT PROCESSING
// ──────────────────────────────────────────────

/**
 * Simulates payment processing with a controlled outcome.
 *
 * Valid transitions:
 *   Pending → Paid    (on 'success')
 *   Pending → Failed  (on 'failure')
 *
 * Rejects if payment is not Pending, or if payment doesn't exist.
 * This is the single entry point for all payment status changes from Pending.
 */
export function processMockPayment(
  paymentId: string,
  outcome: 'success' | 'failure'
): PaymentResult {
  const payment = MOCK_PAYMENTS.find((p) => p.paymentId === paymentId);
  if (!payment) {
    return { success: false, error: 'Payment not found.' };
  }

  const targetStatus: PaymentStatus = outcome === 'success' ? 'Paid' : 'Failed';

  if (!isValidTransition(payment.status, targetStatus)) {
    return {
      success: false,
      error: `Cannot transition payment from '${payment.status}' to '${targetStatus}'.`,
    };
  }

  payment.status = targetStatus;
  payment.updatedAt = nowISO();

  if (outcome === 'failure') {
    payment.failureReason = 'Mock payment processing failure.';
  }

  return { success: true, payment };
}

// ──────────────────────────────────────────────
// STANDALONE REFUND
// ──────────────────────────────────────────────

/**
 * Refunds a Paid payment.
 *
 * Valid transition: Paid → Refunded
 * Rejects all other current statuses.
 *
 * Refund idempotency: calling twice on the same payment returns "already refunded".
 * Simulated refund failure: if paymentId contains 'fail-refund', the refund is rejected
 * and the payment stays Paid.
 */
export function refundPayment(
  paymentId: string,
  reason?: string
): RefundResult {
  const payment = MOCK_PAYMENTS.find((p) => p.paymentId === paymentId);
  if (!payment) {
    return { success: false, error: 'Payment not found.' };
  }

  // ── Refund idempotency: already refunded ──
  if (payment.status === 'Refunded') {
    return {
      success: false,
      error: 'Payment has already been refunded.',
      payment,
    };
  }

  // ── Validate transition: only Paid → Refunded is valid ──
  if (!isValidTransition(payment.status, 'Refunded')) {
    return {
      success: false,
      error: `Cannot refund a payment in '${payment.status}' status. Only 'Paid' payments can be refunded.`,
    };
  }

  // ── Simulated refund failure ──
  if (paymentId.includes('fail-refund')) {
    return {
      success: false,
      error: 'Simulated refund failure. Payment remains Paid.',
      payment,
    };
  }

  // ── Process refund ──
  payment.status = 'Refunded';
  payment.refundedAt = nowISO();
  payment.refundReason = reason || 'Refund requested.';
  payment.refundedAmount = payment.amount;
  payment.updatedAt = nowISO();

  return { success: true, payment };
}

// ──────────────────────────────────────────────
// QUERY FUNCTIONS
// ──────────────────────────────────────────────

/** Get a single payment by its ID. */
export function getPayment(paymentId: string): Payment | undefined {
  return MOCK_PAYMENTS.find((p) => p.paymentId === paymentId);
}

/** Get the payment for a specific booking. Returns the most recent payment if multiple exist. */
export function getPaymentByBookingId(bookingId: string): Payment | undefined {
  return MOCK_PAYMENTS.find((p) => p.bookingId === bookingId);
}

/** Get all payments, optionally filtered. Returns newest first. */
export function getPaymentHistory(filters?: {
  status?: PaymentStatus;
  bookingId?: string;
}): Payment[] {
  let results = [...MOCK_PAYMENTS];

  if (filters?.status) {
    results = results.filter((p) => p.status === filters.status);
  }
  if (filters?.bookingId) {
    results = results.filter((p) => p.bookingId === filters.bookingId);
  }

  return results;
}

// ──────────────────────────────────────────────
// PROVIDER ADAPTER BOUNDARY (placeholder)
// ──────────────────────────────────────────────

/**
 * Future integration point for real payment providers.
 *
 * Architecture:
 *   Payment Service → Payment Provider Adapter → Stripe / Paymob / Other
 *
 * Components never know which provider is used.
 * A future webhook can safely trigger processMockPayment() through the
 * same centralized transition logic, without touching Components or UI state.
 */
export function getPaymentProviderInfo(): { provider: string; mode: 'mock' } {
  return { provider: 'mock', mode: 'mock' };
}

/**
 * Clears all payments from the in-memory array.
 * Used in tests to ensure clean state between tests.
 */
export function clearPayments(): void {
  MOCK_PAYMENTS.length = 0;
}
