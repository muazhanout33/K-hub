import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock auth service (external I/O only)
vi.mock('@/services/auth.service', () => ({
  getCurrentUser: vi.fn(),
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  updateUserProfile: vi.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Import REAL payment store + REAL payment service — crosses 2 layers
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { clearPayments } from '@/services/payment.service';

describe('Payment Lifecycle Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the in-memory payment service state
    clearPayments();
    // Reset the store state
    usePaymentStore.setState({ payments: [], lastIdempotencyKey: null });
  });

  describe('Create → Process → Full lifecycle', () => {
    it('creates payment, processes success, state reflects Paid', () => {
      const { result } = renderHook(() => usePaymentStore());

      // Create
      let createRes: any;
      act(() => {
        createRes = result.current.createPayment('booking-lc-1', 7500);
      });

      expect(createRes.success).toBe(true);
      expect(createRes.payment.status).toBe('Pending');
      expect(createRes.payment.amount).toBe(7500);

      const paymentId = createRes.payment.paymentId;

      // Process success
      let processRes: any;
      act(() => {
        processRes = result.current.processPayment(paymentId, 'success');
      });

      expect(processRes.success).toBe(true);
      expect(processRes.payment.status).toBe('Paid');

      // Verify store state
      const state = usePaymentStore.getState();
      expect(state.payments).toHaveLength(1);
      expect(state.payments[0].status).toBe('Paid');
      expect(state.payments[0].amount).toBe(7500);
    });

    it('creates payment, processes failure, state reflects Failed', () => {
      const { result } = renderHook(() => usePaymentStore());

      let createRes: any;
      act(() => {
        createRes = result.current.createPayment('booking-lc-2', 3000);
      });

      const paymentId = createRes.payment.paymentId;

      let processRes: any;
      act(() => {
        processRes = result.current.processPayment(paymentId, 'failure');
      });

      expect(processRes.success).toBe(true);
      expect(processRes.payment.status).toBe('Failed');
      expect(processRes.payment.failureReason).toBeTruthy();
    });
  });

  describe('Refund lifecycle', () => {
    it('Paid → Refunded with full refund amount', () => {
      const { result } = renderHook(() => usePaymentStore());

      let paymentId: string;
      act(() => {
        const res = result.current.createPayment('booking-ref-1', 10000);
        paymentId = res.payment!.paymentId;
      });

      act(() => {
        result.current.processPayment(paymentId!, 'success');
      });

      let refundRes: any;
      act(() => {
        refundRes = result.current.refundPayment(paymentId!);
      });

      expect(refundRes.success).toBe(true);
      expect(refundRes.payment.status).toBe('Refunded');
      expect(refundRes.payment.refundedAmount).toBe(10000);
    });

    it('rejects refund of unpaid booking', () => {
      const { result } = renderHook(() => usePaymentStore());

      let paymentId: string;
      act(() => {
        const res = result.current.createPayment('booking-ref-2', 5000);
        paymentId = res.payment!.paymentId;
      });

      // Don't process — still Pending
      let refundRes: any;
      act(() => {
        refundRes = result.current.refundPayment(paymentId!);
      });

      expect(refundRes.success).toBe(false);
      expect(refundRes.error).toContain('Paid');
    });
  });

  describe('Idempotency across store + service', () => {
    it('same idempotency key is rejected on second attempt', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.createPayment('booking-idem-1', 4000, 'idem-key-abc');
      });

      let secondRes: any;
      act(() => {
        secondRes = result.current.createPayment('booking-idem-2', 4000, 'idem-key-abc');
      });

      expect(secondRes.success).toBe(false);
      expect(secondRes.error).toContain('Duplicate');

      // Only one payment in state
      expect(usePaymentStore.getState().payments).toHaveLength(1);
    });

    it('different idempotency keys are accepted', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.createPayment('booking-idem-3', 4000, 'key-1');
      });

      let secondRes: any;
      act(() => {
        secondRes = result.current.createPayment('booking-idem-4', 4000, 'key-2');
      });

      expect(secondRes.success).toBe(true);
      expect(usePaymentStore.getState().payments).toHaveLength(2);
    });
  });

  describe('Double payment prevention', () => {
    it('cannot create payment for already-paid booking', () => {
      const { result } = renderHook(() => usePaymentStore());

      let paymentId: string;
      act(() => {
        const res = result.current.createPayment('booking-dp-1', 6000);
        paymentId = res.payment!.paymentId;
      });

      act(() => {
        result.current.processPayment(paymentId!, 'success');
      });

      // Try to pay again for same booking
      let secondRes: any;
      act(() => {
        secondRes = result.current.createPayment('booking-dp-1', 6000);
      });

      expect(secondRes.success).toBe(false);
      expect(secondRes.error).toContain('already been paid for');
    });

    it('can create payment for different booking even after first is paid', () => {
      const { result } = renderHook(() => usePaymentStore());

      let paymentId: string;
      act(() => {
        const res = result.current.createPayment('booking-dp-2', 6000);
        paymentId = res.payment!.paymentId;
      });

      act(() => {
        result.current.processPayment(paymentId!, 'success');
      });

      // New booking can be paid
      let newRes: any;
      act(() => {
        newRes = result.current.createPayment('booking-dp-3', 8000);
      });

      expect(newRes.success).toBe(true);
      expect(usePaymentStore.getState().payments).toHaveLength(2);
    });
  });

  describe('Multiple payments — state isolation', () => {
    it('multiple independent payments coexist in state', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => { result.current.createPayment('booking-multi-1', 1000); });
      act(() => { result.current.createPayment('booking-multi-2', 2000); });
      act(() => { result.current.createPayment('booking-multi-3', 3000); });

      const state = usePaymentStore.getState();
      expect(state.payments).toHaveLength(3);
      expect(state.payments.map((p: any) => p.amount).sort()).toEqual([1000, 2000, 3000]);
    });

    it('clearPayments resets all state', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => { result.current.createPayment('booking-clear-1', 1000); });
      act(() => { result.current.createPayment('booking-clear-2', 2000); });

      act(() => { result.current.clearPayments(); });

      const state = usePaymentStore.getState();
      expect(state.payments).toEqual([]);
      expect(state.lastIdempotencyKey).toBeNull();
    });
  });

  describe('Payment lookup by booking ID', () => {
    it('finds payment by booking ID after creation', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => { result.current.createPayment('booking-lookup-1', 5500); });

      const found = usePaymentStore.getState().payments.find(
        (p: any) => p.bookingId === 'booking-lookup-1'
      );

      expect(found).toBeDefined();
      expect(found!.amount).toBe(5500);
    });

    it('returns undefined for non-existent booking ID', () => {
      const { result } = renderHook(() => usePaymentStore());

      const found = usePaymentStore.getState().payments.find(
        (p: any) => p.bookingId === 'non-existent'
      );

      expect(found).toBeUndefined();
    });
  });
});
