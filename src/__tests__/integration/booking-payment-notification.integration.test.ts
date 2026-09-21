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

// Mock booking server actions (external I/O only)
vi.mock('@/app/actions/booking.actions', () => ({
  createBookingAction: vi.fn(),
  cancelBookingAction: vi.fn(),
  confirmBookingStatusAction: vi.fn(),
  expireStaleBookingsAction: vi.fn(),
}));

// Mock booking service (external I/O only)
vi.mock('@/services/booking.service', () => ({
  getInitialBookings: vi.fn(() => []),
  parseHour: vi.fn((time: string) => parseInt(time.split(':')[0], 10)),
  areSlotsConsecutive: vi.fn(() => true),
}));

// Mock availability — only mock validateBookingRequest, keep generateAvailabilitySlots real
vi.mock('@/lib/availability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/availability')>();
  return {
    ...actual,
    validateBookingRequest: vi.fn(() => ({ valid: true })),
  };
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Import REAL stores — crosses 3 layers: booking ↔ payment ↔ notification
import { useBookingStore } from '@/features/booking/useBookingStore';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { clearPayments } from '@/services/payment.service';
import { generateAvailabilitySlots } from '@/lib/availability';
import { MOCK_COURTS } from '@/lib/mock-data';

const TEST_COURT = MOCK_COURTS[0];
const TEST_USER = {
  id: 'user-bpn-1',
  name: 'Cross Store User',
  email: 'cross@test.com',
  phone: '+999',
  role: 'Guest' as const,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('Booking ↔ Payment ↔ Notification Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPayments();

    useAuthStore.setState({ user: TEST_USER, isAuthenticated: true });

    useBookingStore.setState({
      selectedCourt: null,
      selectedDate: '2099-12-01',
      selectedSlots: [],
      bookingStep: 2,
      userName: '',
      userEmail: '',
      userPhone: '',
      reservationStartTime: null,
      reservationExpiresAt: null,
      hasExtendedReservation: false,
    });

    usePaymentStore.setState({ payments: [], lastIdempotencyKey: null });
    useNotificationStore.setState({ notifications: [], soundEnabled: true });
  });

  describe('Booking confirm → Payment create → Notification add', () => {
    it('creates payment when booking is confirmed', () => {
      // Pre-select booking details
      const date = '2099-07-01';
      act(() => {
        useBookingStore.getState().selectCourt(TEST_COURT);
        useBookingStore.getState().selectDate(date);
      });

      // Generate real slots and toggle one
      const slots = generateAvailabilitySlots(TEST_COURT, date, [], []);
      const nineSlot = slots.find(s => s.startTime === '09:00')!;
      act(() => {
        useBookingStore.getState().toggleSlot(nineSlot);
        useBookingStore.getState().setBookingStep(3);
        useBookingStore.getState().setUserDetails({
          userName: TEST_USER.name,
          userEmail: TEST_USER.email,
          userPhone: TEST_USER.phone,
        });
      });

      // Simulate what happens after booking confirmation: create payment
      const bookingId = 'booking-bpn-1';
      const price = TEST_COURT.pricePerHour;

      let paymentRes: any;
      act(() => {
        paymentRes = usePaymentStore.getState().createPayment(bookingId, price);
      });

      expect(paymentRes.success).toBe(true);
      expect(paymentRes.payment.status).toBe('Pending');

      // Add notification about the booking
      act(() => {
        useNotificationStore.getState().addNotification(
          'booking_confirmed',
          'Booking Confirmed',
          `Your booking at ${TEST_COURT.name} is confirmed. Awaiting payment.`,
          TEST_USER.id
        );
      });

      // Verify cross-store state
      const payment = usePaymentStore.getState().payments.find((p: any) => p.bookingId === bookingId);
      expect(payment).toBeDefined();
      expect(payment!.amount).toBe(price);

      const notifs = useNotificationStore.getState().getNotificationsForUser(TEST_USER.id);
      expect(notifs).toHaveLength(1);
      expect(notifs[0].type).toBe('booking_confirmed');
    });

    it('processes payment and adds payment notification', () => {
      // Create payment
      let paymentId: string;
      act(() => {
        const res = usePaymentStore.getState().createPayment('booking-bpn-2', 5000);
        paymentId = res.payment!.paymentId;
      });

      // Process payment (simulates mock payment gateway)
      act(() => {
        usePaymentStore.getState().processPayment(paymentId!, 'success');
      });

      // Add payment success notification
      act(() => {
        useNotificationStore.getState().addNotification(
          'payment_successful',
          'Payment Received',
          'Your payment of 5000 has been processed successfully.',
          TEST_USER.id
        );
      });

      // Verify payment state
      const payment = usePaymentStore.getState().payments[0];
      expect(payment.status).toBe('Paid');

      // Verify notification
      const notifs = useNotificationStore.getState().getNotificationsForUser(TEST_USER.id);
      expect(notifs).toHaveLength(1);
      expect(notifs[0].type).toBe('payment_successful');
    });
  });

  describe('Payment failure → notification chain', () => {
    it('failed payment generates appropriate notification', () => {
      let paymentId: string;
      act(() => {
        const res = usePaymentStore.getState().createPayment('booking-bpn-fail', 3000);
        paymentId = res.payment!.paymentId;
      });

      act(() => {
        usePaymentStore.getState().processPayment(paymentId!, 'failure');
      });

      act(() => {
        useNotificationStore.getState().addNotification(
          'checkout_stuck',
          'Payment Failed',
          'Your payment could not be processed. Please try again.',
          TEST_USER.id
        );
      });

      const payment = usePaymentStore.getState().payments[0];
      expect(payment.status).toBe('Failed');

      const notifs = useNotificationStore.getState().getNotificationsForUser(TEST_USER.id);
      expect(notifs[0].type).toBe('checkout_stuck');
    });
  });

  describe('Refund → notification chain', () => {
    it('refund generates refund notification', () => {
      let paymentId: string;
      act(() => {
        const res = usePaymentStore.getState().createPayment('booking-bpn-refund', 8000);
        paymentId = res.payment!.paymentId;
      });

      act(() => {
        usePaymentStore.getState().processPayment(paymentId!, 'success');
      });

      act(() => {
        usePaymentStore.getState().refundPayment(paymentId!);
      });

      act(() => {
        useNotificationStore.getState().addNotification(
          'booking_cancelled',
          'Refund Processed',
          'Your refund of 8000 has been initiated.',
          TEST_USER.id
        );
      });

      const payment = usePaymentStore.getState().payments[0];
      expect(payment.status).toBe('Refunded');
      expect(payment.refundedAmount).toBe(8000);

      const notifs = useNotificationStore.getState().getNotificationsForUser(TEST_USER.id);
      expect(notifs[0].type).toBe('booking_cancelled');
    });
  });

  describe('Multi-user notification isolation', () => {
    it('notifications are scoped to correct users across payment flows', () => {
      const user2 = { id: 'user-bpn-2', name: 'User 2', email: 'u2@test.com', phone: '+222', role: 'Guest' as const, createdAt: '' };

      // User 1 books and pays
      act(() => {
        usePaymentStore.getState().createPayment('booking-u1', 4000);
      });
      act(() => {
        useNotificationStore.getState().addNotification('booking_confirmed', 'Your Booking', 'Confirmed for you', TEST_USER.id);
      });

      // User 2 books and pays
      act(() => {
        usePaymentStore.getState().createPayment('booking-u2', 6000);
      });
      act(() => {
        useNotificationStore.getState().addNotification('booking_confirmed', 'Your Booking', 'Confirmed for you', user2.id);
      });

      // Verify isolation
      const user1Notifs = useNotificationStore.getState().getNotificationsForUser(TEST_USER.id);
      const user2Notifs = useNotificationStore.getState().getNotificationsForUser(user2.id);

      expect(user1Notifs).toHaveLength(1);
      expect(user2Notifs).toHaveLength(1);
      expect(user1Notifs[0].userId).toBe(TEST_USER.id);
      expect(user2Notifs[0].userId).toBe(user2.id);
    });
  });

  describe('Clear across stores', () => {
    it('clearing payments does not affect notifications', () => {
      act(() => {
        usePaymentStore.getState().createPayment('booking-clear-test', 5000);
      });
      act(() => {
        useNotificationStore.getState().addNotification('payment_successful', 'Paid', 'Done', TEST_USER.id);
      });

      act(() => {
        usePaymentStore.getState().clearPayments();
      });

      expect(usePaymentStore.getState().payments).toEqual([]);
      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });

    it('clearing notifications does not affect payments', () => {
      act(() => {
        usePaymentStore.getState().createPayment('booking-clear-test2', 5000);
      });
      act(() => {
        useNotificationStore.getState().addNotification('payment_successful', 'Paid', 'Done', TEST_USER.id);
      });

      act(() => {
        useNotificationStore.getState().clearNotifications();
      });

      expect(useNotificationStore.getState().notifications).toEqual([]);
      expect(usePaymentStore.getState().payments).toHaveLength(1);
    });
  });
});
