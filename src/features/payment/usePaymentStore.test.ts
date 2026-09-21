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
  usePaymentStore.setState({ payments: [], lastIdempotencyKey: null });
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
  });
});
