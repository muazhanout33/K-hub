import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock auth service (external I/O)
vi.mock('@/services/auth.service', () => ({
  getCurrentUser: vi.fn(),
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  updateUserProfile: vi.fn(),
}));

// Mock booking server actions (external I/O)
vi.mock('@/app/actions/booking.actions', () => ({
  createBookingAction: vi.fn(),
  cancelBookingAction: vi.fn(),
  confirmBookingStatusAction: vi.fn(),
  expireStaleBookingsAction: vi.fn(),
}));

// Mock booking service (external I/O)
vi.mock('@/services/booking.service', () => ({
  getInitialBookings: vi.fn(() => []),
  parseHour: vi.fn((time: string) => parseInt(time.split(':')[0], 10)),
  areSlotsConsecutive: vi.fn(() => true),
}));

// Mock availability (pure function, but used by booking store)
vi.mock('@/lib/availability', () => ({
  validateBookingRequest: vi.fn(() => ({ valid: true })),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Import REAL stores — this is what makes it an integration test
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';
import * as authService from '@/services/auth.service';

const TEST_USER = {
  id: 'user-integration-1',
  name: 'Integration User',
  email: 'integration@test.com',
  phone: '+1234567890',
  role: 'Guest' as const,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('Auth Cross-Store Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset all stores to clean state
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      _hasHydrated: false,
    });

    useBookingStore.setState({
      selectedCourt: null,
      selectedDate: '2099-06-15',
      selectedSlots: [],
      bookingStep: 2,
      userName: '',
      userEmail: '',
      userPhone: '',
      reservationStartTime: null,
      reservationExpiresAt: null,
      hasExtendedReservation: false,
    });

    usePaymentStore.setState({
      payments: [],
      lastIdempotencyKey: null,
    });

    useNotificationStore.setState({
      notifications: [],
      soundEnabled: true,
    });
  });

  describe('Logout cascades across all stores', () => {
    it('clears auth state on logout', async () => {
      vi.mocked(authService.logoutUser).mockResolvedValue(undefined);

      // Simulate logged-in state
      useAuthStore.setState({
        user: TEST_USER,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(authService.logoutUser).toHaveBeenCalled();
    });

    it('resets booking store when auth logs out', async () => {
      vi.mocked(authService.logoutUser).mockResolvedValue(undefined);

      // Pre-populate booking state
      useBookingStore.setState({
        selectedCourt: { id: 'court-1', name: 'Test Court', pricePerHour: 100, slotDurationMinutes: 60 } as any,
        selectedDate: '2099-06-15',
        selectedSlots: [
          { id: 'slot-1', courtId: 'court-1', date: '2099-06-15', startTime: '09:00', endTime: '10:00', price: 100, status: 'Available' as const },
          { id: 'slot-2', courtId: 'court-1', date: '2099-06-15', startTime: '10:00', endTime: '11:00', price: 100, status: 'Available' as const },
        ],
        bookingStep: 4,
        userName: 'Test User',
        userEmail: 'test@test.com',
        userPhone: '+1234567890',
      });

      useAuthStore.setState({
        user: TEST_USER,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.logout();
      });

      // Booking store should be reset
      const bookingState = useBookingStore.getState();
      expect(bookingState.selectedCourt).toBeNull();
      expect(bookingState.selectedSlots).toEqual([]);
      expect(bookingState.bookingStep).toBe(2);
      expect(bookingState.userName).toBe('');
    });

    it('clears payment store when auth logs out', async () => {
      vi.mocked(authService.logoutUser).mockResolvedValue(undefined);

      // Pre-populate payment state
      usePaymentStore.setState({
        payments: [{
          paymentId: 'pay-1',
          bookingId: 'booking-1',
          amount: 5000,
          currency: 'EGP',
          status: 'Paid' as const,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          idempotencyKey: 'idem-1',
        }],
        lastIdempotencyKey: 'key-1',
      });

      useAuthStore.setState({
        user: TEST_USER,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.logout();
      });

      const paymentState = usePaymentStore.getState();
      expect(paymentState.payments).toEqual([]);
      expect(paymentState.lastIdempotencyKey).toBeNull();
    });

    it('clears notification store when auth logs out', async () => {
      vi.mocked(authService.logoutUser).mockResolvedValue(undefined);

      // Pre-populate notification state
      useNotificationStore.setState({
        notifications: [{
          id: 'notif-1',
          type: 'new_booking',
          title: 'Test',
          message: 'Test notification',
          userId: 'user-1',
          isRead: false,
          createdAt: '2026-01-01T00:00:00Z',
        }],
      });

      useAuthStore.setState({
        user: TEST_USER,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.logout();
      });

      const notifState = useNotificationStore.getState();
      expect(notifState.notifications).toEqual([]);
    });
  });

  describe('Login populates auth and enables cross-store coordination', () => {
    it('login sets user that notification store can use for filtering', async () => {
      vi.mocked(authService.loginUser).mockResolvedValue({
        success: true,
        user: TEST_USER,
      });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('integration@test.com', 'password123');
      });

      expect(result.current.user?.id).toBe('user-integration-1');
      expect(result.current.isAuthenticated).toBe(true);

      // Notification store can now filter by this user
      act(() => {
        useNotificationStore.getState().addNotification(
          'new_booking',
          'Booking Confirmed',
          'Your court is booked',
          result.current.user!.id
        );
      });

      const userNotifs = useNotificationStore.getState().getNotificationsForUser('user-integration-1');
      expect(userNotifs).toHaveLength(1);
      expect(userNotifs[0].userId).toBe('user-integration-1');
    });

    it('login失败 does not affect other stores', async () => {
      vi.mocked(authService.loginUser).mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      // Pre-populate some state in other stores
      useNotificationStore.getState().addNotification(
        'new_booking',
        'Existing',
        'Existing notification',
        'user-other'
      );

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('wrong@test.com', 'wrongpass');
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);

      // Other stores unaffected
      const notifState = useNotificationStore.getState();
      expect(notifState.notifications).toHaveLength(1);
    });
  });

  describe('Auth state coordinates with booking user details', () => {
    it('auth user info can pre-fill booking user details', async () => {
      useAuthStore.setState({
        user: TEST_USER,
        isAuthenticated: true,
      });

      const authUser = useAuthStore.getState().user;

      // Pre-fill booking details from auth user
      act(() => {
        useBookingStore.getState().setUserDetails({
          userName: authUser!.name,
          userEmail: authUser!.email,
          userPhone: authUser!.phone,
        });
      });

      const bookingState = useBookingStore.getState();
      expect(bookingState.userName).toBe('Integration User');
      expect(bookingState.userEmail).toBe('integration@test.com');
      expect(bookingState.userPhone).toBe('+1234567890');
    });
  });
});
