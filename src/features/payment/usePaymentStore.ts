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

interface PaymentStoreState {
  payments: Payment[];
  lastIdempotencyKey: string | null;

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
}

export const usePaymentStore = create<PaymentStoreState>()(
  persist(
    (set, get) => ({
      payments: [],
      lastIdempotencyKey: null,

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

      getPayment: (paymentId: string) => getPayment(paymentId),

      getPaymentByBookingId: (bookingId: string) =>
        getPaymentByBookingId(bookingId),

      getPaymentHistory: (filters?) => getPaymentHistory(filters),

      getPaymentsForUser: (userId: string) => {
        const bookings = useBookingStore.getState().bookings;
        const userBookingIds = new Set(
          bookings.filter((b) => b.userId === userId).map((b) => b.id)
        );
        return get().payments.filter((p) => userBookingIds.has(p.bookingId));
      },

      clearPayments: () => set({ payments: [], lastIdempotencyKey: null }),
    }),
    {
      name: 'khub-payment-storage',
      version: 1,
      partialize: (state) => ({
        payments: state.payments,
        lastIdempotencyKey: state.lastIdempotencyKey,
      }),
      skipHydration: true,
    }
  )
);
