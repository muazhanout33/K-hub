import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePaymentStore } from './usePaymentStore';
import { clearPayments } from '@/services/payment.service';

// Mock booking store (not used by payment store directly)
vi.mock('@/features/booking/useBookingStore', () => ({
  useBookingStore: {
    getState: vi.fn(() => ({
      bookings: [],
    })),
  },
}));

beforeEach(() => {
  clearPayments();
  usePaymentStore.setState({ payments: [], lastIdempotencyKey: null, pendingConfirmation: null, lastBookingId: null, _hasHydrated: true });
});

describe('usePaymentStore', () => {
  it('has empty payments and null lastIdempotencyKey initially', () => {
    const { result } = renderHook(() => usePaymentStore());
    expect(result.current.payments).toEqual([]);
    expect(result.current.lastIdempotencyKey).toBeNull();
  });

  describe('createPayment', () => {
    it('creates a payment and adds to state', () => {
      const { result } = renderHook(() => usePaymentStore());

      let res: any;
      act(() => {
        res = result.current.createPayment('booking-1', 5000);
      });

      expect(res.success).toBe(true);
      expect(res.payment).toBeDefined();
      expect(res.payment.bookingId).toBe('booking-1');
      expect(res.payment.amount).toBe(5000);
      expect(res.payment.status).toBe('Pending');
      expect(result.current.payments).toHaveLength(1);
    });

    it('sets lastIdempotencyKey after creation', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.createPayment('booking-1', 5000, 'my-key');
      });

      expect(result.current.lastIdempotencyKey).toBe('my-key');
    });

    it('rejects duplicate idempotency key', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.createPayment('booking-1', 5000, 'dup-key');
      });

      let res: any;
      act(() => {
        res = result.current.createPayment('booking-2', 3000, 'dup-key');
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Duplicate');
    });

    it('rejects double payment for same booking after Paid', () => {
      const { result } = renderHook(() => usePaymentStore());

      let paymentId: string = '';
      act(() => {
        const res = result.current.createPayment('booking-1', 5000);
        paymentId = res.payment!.paymentId;
      });

      act(() => {
        result.current.processPayment(paymentId, 'success');
      });

      let res: any;
      act(() => {
        res = result.current.createPayment('booking-1', 5000);
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('already been paid');
    });
  });

  describe('processPayment', () => {
    it('transitions Pending → Paid on success', () => {
      const { result } = renderHook(() => usePaymentStore());

      let paymentId: string = '';
      act(() => {
        const res = result.current.createPayment('booking-1', 5000);
        paymentId = res.payment!.paymentId;
      });

      let res: any;
      act(() => {
        res = result.current.processPayment(paymentId, 'success');
      });

      expect(res.success).toBe(true);
      expect(res.payment!.status).toBe('Paid');
      expect(result.current.payments[0].status).toBe('Paid');
    });

    it('transitions Pending → Failed on failure', () => {
      const { result } = renderHook(() => usePaymentStore());

      let paymentId: string = '';
      act(() => {
        const res = result.current.createPayment('booking-1', 5000);
        paymentId = res.payment!.paymentId;
      });

      let res: any;
      act(() => {
        res = result.current.processPayment(paymentId, 'failure');
      });

      expect(res.success).toBe(true);
      expect(res.payment!.status).toBe('Failed');
      expect(res.payment!.failureReason).toBeTruthy();
    });

    it('rejects processing non-existent payment', () => {
      const { result } = renderHook(() => usePaymentStore());

      let res: any;
      act(() => {
        res = result.current.processPayment('non-existent', 'success');
      });

      expect(res.success).toBe(false);
    });
  });

  describe('refundPayment', () => {
    it('transitions Paid → Refunded', () => {
      const { result } = renderHook(() => usePaymentStore());

      let paymentId: string = '';
      act(() => {
        const res = result.current.createPayment('booking-1', 5000);
        paymentId = res.payment!.paymentId;
      });

      act(() => {
        result.current.processPayment(paymentId, 'success');
      });

      let res: any;
      act(() => {
        res = result.current.refundPayment(paymentId);
      });

      expect(res.success).toBe(true);
      expect(res.payment!.status).toBe('Refunded');
      expect(res.payment!.refundedAmount).toBe(5000);
    });

    it('rejects refund of Pending payment', () => {
      const { result } = renderHook(() => usePaymentStore());

      let paymentId: string = '';
      act(() => {
        const res = result.current.createPayment('booking-1', 5000);
        paymentId = res.payment!.paymentId;
      });

      let res: any;
      act(() => {
        res = result.current.refundPayment(paymentId);
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Paid');
    });

    it('rejects refund of non-existent payment', () => {
      const { result } = renderHook(() => usePaymentStore());

      let res: any;
      act(() => {
        res = result.current.refundPayment('non-existent');
      });

      expect(res.success).toBe(false);
    });
  });

  describe('clearPayments', () => {
    it('clears all payments and lastIdempotencyKey', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.createPayment('booking-1', 5000);
      });

      expect(result.current.payments).toHaveLength(1);

      act(() => {
        result.current.clearPayments();
      });

      expect(result.current.payments).toEqual([]);
      expect(result.current.lastIdempotencyKey).toBeNull();
    });

    it('also clears the durable confirmation op and lastBookingId', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.beginConfirmation('booking-1', 'pay-1');
      });

      act(() => {
        result.current.clearPayments();
      });

      expect(result.current.pendingConfirmation).toBeNull();
      expect(result.current.lastBookingId).toBeNull();
    });
  });

  // ── Durable pendingConfirmation (refresh/redirect recovery) ──
  describe('pendingConfirmation lifecycle', () => {
    it('begins an op and records lastBookingId', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.beginConfirmation('booking-1', 'pay-1');
      });

      expect(result.current.pendingConfirmation).toMatchObject({
        bookingId: 'booking-1',
        paymentId: 'pay-1',
        phase: 'confirming',
        attempts: 0,
        lastError: null,
      });
      expect(result.current.lastBookingId).toBe('booking-1');
    });

    it('re-beginning the SAME booking keeps attempts (idempotent)', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => { result.current.beginConfirmation('booking-1'); });
      act(() => { result.current.recordConfirmationAttempt(); });
      act(() => { result.current.recordConfirmationAttempt(); });
      expect(result.current.pendingConfirmation!.attempts).toBe(2);

      // Recovery re-entry must not reset attempt history.
      act(() => { result.current.beginConfirmation('booking-1', 'pay-9'); });
      expect(result.current.pendingConfirmation!.attempts).toBe(2);
      expect(result.current.pendingConfirmation!.paymentId).toBe('pay-9');
      expect(result.current.pendingConfirmation!.phase).toBe('confirming');
    });

    it('beginning a DIFFERENT booking resets the op', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => { result.current.beginConfirmation('booking-1'); });
      act(() => { result.current.recordConfirmationAttempt(); });
      act(() => { result.current.markConfirmationFailed('boom'); });

      act(() => { result.current.beginConfirmation('booking-2'); });
      expect(result.current.pendingConfirmation).toMatchObject({
        bookingId: 'booking-2',
        phase: 'confirming',
        attempts: 0,
        lastError: null,
      });
      expect(result.current.lastBookingId).toBe('booking-2');
    });

    it('markConfirmationFailed preserves the op for refresh recovery', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => { result.current.beginConfirmation('booking-1'); });
      act(() => { result.current.markConfirmationFailed('confirm failed'); });

      expect(result.current.pendingConfirmation!.phase).toBe('failed');
      expect(result.current.pendingConfirmation!.lastError).toBe('confirm failed');
      // Booking id survives so the payment page can show the recovery UI
      // instead of the old "No booking in progress" dead end.
      expect(result.current.pendingConfirmation!.bookingId).toBe('booking-1');
    });

    it('clearConfirmation removes only the op, keeping lastBookingId', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => { result.current.beginConfirmation('booking-1'); });
      act(() => { result.current.clearConfirmation(); });

      expect(result.current.pendingConfirmation).toBeNull();
      // lastBookingId remains for the confirmation page to recover by id.
      expect(result.current.lastBookingId).toBe('booking-1');
    });

    it('no-ops safely when there is no op', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => { result.current.recordConfirmationAttempt(); });
      act(() => { result.current.markConfirmationFailed('x'); });
      act(() => { result.current.clearConfirmation(); });

      expect(result.current.pendingConfirmation).toBeNull();
    });

    it('does not persist the transient _hasHydrated flag', () => {
      const partialized = usePaymentStore.persist.getOptions().partialize?.(
        usePaymentStore.getState() as never
      ) as Record<string, unknown>;
      expect(partialized).toHaveProperty('pendingConfirmation');
      expect(partialized).toHaveProperty('lastBookingId');
      expect(partialized).not.toHaveProperty('_hasHydrated');
    });
  });
});
