import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Payment, PaymentStatus, PaymentResult, RefundResult } from '@/types';
import {
  createPayment,
  processMockPayment,
  refundPayment,
  getPayment,
  getPaymentByBookingId,
  getPaymentHistory,
} from '@/services/payment.service';
import { useBookingStore } from '@/features/booking/useBookingStore';

/**
 * Durable record of an in-flight (or failed) booking confirmation.
 *
 * Persisted so that a refresh / redirect / crash between payment and
 * booking confirmation can be recovered instead of losing the booking
 * context ("No booking in progress").
 *
 * - `phase: 'confirming'` — a retryable operation is pending
 * - `phase: 'failed'`     — retries exhausted; user can retry confirm only
 *   (NEVER asked to pay again)
 */
export interface PendingConfirmation {
  bookingId: string;
  paymentId: string | null;
  phase: 'confirming' | 'failed';
  attempts: number;
  lastError: string | null;
  startedAt: string;
  updatedAt: string;
}

interface PaymentStoreState {
  payments: Payment[];
  lastIdempotencyKey: string | null;
  /** In-flight / failed booking confirmation (durable across refresh). */
  pendingConfirmation: PendingConfirmation | null;
  /** Most recent booking the user was confirming (recovery aid). */
  lastBookingId: string | null;
  /** True once rehydration from localStorage has completed. */
  _hasHydrated: boolean;

  createPayment: (
    bookingId: string,
    amount: number,
    idempotencyKey?: string
  ) => PaymentResult;
  processPayment: (
    paymentId: string,
    outcome: 'success' | 'failure'
  ) => PaymentResult;
  refundPayment: (
    paymentId: string,
    reason?: string
  ) => RefundResult;
  getPayment: (paymentId: string) => Payment | undefined;
  getPaymentByBookingId: (bookingId: string) => Payment | undefined;
  getPaymentHistory: (filters?: {
    status?: PaymentStatus;
    bookingId?: string;
  }) => Payment[];
  getPaymentsForUser: (userId: string) => Payment[];
  clearPayments: () => void;

  /** Record that a confirmation for `bookingId` is about to run (idempotent upsert). */
  beginConfirmation: (bookingId: string, paymentId?: string | null) => void;
  /** Increment the attempt counter and mark the op as actively confirming. */
  recordConfirmationAttempt: () => void;
  /** Confirmation retries exhausted — persist the failure for recovery UI. */
  markConfirmationFailed: (error: string) => void;
  /** Confirmation succeeded (or user abandoned) — drop the durable op. */
  clearConfirmation: () => void;
}

export const usePaymentStore = create<PaymentStoreState>()(
  persist(
    (set, get) => ({
      payments: [],
      lastIdempotencyKey: null,
      pendingConfirmation: null,
      lastBookingId: null,
      _hasHydrated: false,

      createPayment: (
        bookingId: string,
        amount: number,
        idempotencyKey?: string
      ): PaymentResult => {
        const key = idempotencyKey || `idem-${bookingId}-${Date.now()}`;
        const result = createPayment(bookingId, amount, key);

        if (result.success && result.payment) {
          set({
            payments: [result.payment, ...get().payments],
            lastIdempotencyKey: key,
          });
        }

        return result;
      },

      processPayment: (
        paymentId: string,
        outcome: 'success' | 'failure'
      ): PaymentResult => {
        const result = processMockPayment(paymentId, outcome);

        if (result.success && result.payment) {
          set({
            payments: get().payments.map((p) =>
              p.paymentId === paymentId ? result.payment! : p
            ),
          });
        }

        return result;
      },

      refundPayment: (
        paymentId: string,
        reason?: string
      ): RefundResult => {
        const result = refundPayment(paymentId, reason);

        if (result.success && result.payment) {
          set({
            payments: get().payments.map((p) =>
              p.paymentId === paymentId ? result.payment! : p
            ),
          });
        }

        return result;
      },

      // Store-first reads: the persisted store survives page refreshes
      // (the in-memory payment service does not), so consult it before
      // falling back to the service's session-scoped records.
      getPayment: (paymentId: string) =>
        get().payments.find((p) => p.paymentId === paymentId) ??
        getPayment(paymentId),

      getPaymentByBookingId: (bookingId: string) =>
        get().payments.find((p) => p.bookingId === bookingId) ??
        getPaymentByBookingId(bookingId),

      getPaymentHistory: (filters?) => {
        const fromStore = filters
          ? get().payments.filter(
              (p) =>
                (!filters.status || p.status === filters.status) &&
                (!filters.bookingId || p.bookingId === filters.bookingId)
            )
          : get().payments;
        const fromService = getPaymentHistory(filters);
        const seen = new Set(fromStore.map((p) => p.paymentId));
        return [...fromStore, ...fromService.filter((p) => !seen.has(p.paymentId))];
      },

      getPaymentsForUser: (userId: string) => {
        const bookings = useBookingStore.getState().bookings;
        const userBookingIds = new Set(
          bookings.filter((b) => b.userId === userId).map((b) => b.id)
        );
        return get().payments.filter((p) => userBookingIds.has(p.bookingId));
      },

      clearPayments: () =>
        set({
          payments: [],
          lastIdempotencyKey: null,
          pendingConfirmation: null,
          lastBookingId: null,
        }),

      beginConfirmation: (bookingId, paymentId) => {
        if (!bookingId) return;
        const now = new Date().toISOString();
        const existing = get().pendingConfirmation;
        set({
          lastBookingId: bookingId,
          pendingConfirmation:
            existing && existing.bookingId === bookingId
              ? {
                  ...existing,
                  paymentId: paymentId ?? existing.paymentId,
                  phase: 'confirming',
                  updatedAt: now,
                }
              : {
                  bookingId,
                  paymentId: paymentId ?? null,
                  phase: 'confirming',
                  attempts: 0,
                  lastError: null,
                  startedAt: now,
                  updatedAt: now,
                },
        });
      },

      recordConfirmationAttempt: () => {
        const pending = get().pendingConfirmation;
        if (!pending) return;
        const now = new Date().toISOString();
        set({
          pendingConfirmation: {
            ...pending,
            phase: 'confirming',
            attempts: pending.attempts + 1,
            updatedAt: now,
          },
        });
      },

      markConfirmationFailed: (error) => {
        const pending = get().pendingConfirmation;
        if (!pending) return;
        set({
          pendingConfirmation: {
            ...pending,
            phase: 'failed',
            lastError: error,
            updatedAt: new Date().toISOString(),
          },
        });
      },

      clearConfirmation: () => {
        if (!get().pendingConfirmation) return;
        set({ pendingConfirmation: null });
      },
    }),
    {
      name: 'khub-payment-storage',
      version: 1,
      partialize: (state) => ({
        payments: state.payments,
        lastIdempotencyKey: state.lastIdempotencyKey,
        pendingConfirmation: state.pendingConfirmation,
        lastBookingId: state.lastBookingId,
      }),
      skipHydration: true,
    }
  )
);
