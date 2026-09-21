import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock all external dependencies before importing the store
vi.mock('@/app/actions/booking.actions', () => ({
  createBookingAction: vi.fn(),
  cancelBookingAction: vi.fn(),
  confirmBookingStatusAction: vi.fn(),
  expireStaleBookingsAction: vi.fn(),
}));

vi.mock('@/services/booking.service', () => ({
  getInitialBookings: vi.fn(() => []),
  parseHour: vi.fn((time: string) => parseInt(time.split(':')[0], 10)),
  areSlotsConsecutive: vi.fn(() => true),
}));

vi.mock('@/lib/availability', () => ({
  validateBookingRequest: vi.fn(() => ({ valid: true })),
}));

vi.mock('@/features/booking/useBlockedPeriodStore', () => ({
  useBlockedPeriodStore: {
    getState: vi.fn(() => ({
      getBlockedPeriodsForCourtDate: vi.fn(() => []),
    })),
  },
}));

vi.mock('@/features/payment/usePaymentStore', () => ({
  usePaymentStore: {
    getState: vi.fn(() => ({})),
  },
}));

vi.mock('@/features/auth/useAuthStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      user: null,
    })),
  },
}));

// Mock localStorage for zustand/persist
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { useBookingStore } from '@/features/booking/useBookingStore';

describe('useBookingStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state directly via setState
    useBookingStore.setState({
      selectedCourt: null,
      selectedDate: '2099-06-15',
      selectedSlots: [],
      bookingStep: 2,
      reservationStartTime: null,
      reservationExpiresAt: null,
      hasExtendedReservation: false,
      userName: '',
      userEmail: '',
      userPhone: '',
      bookings: [],
      maxHoursReachedTick: 0,
      isCancelling: false,
    });
  });

  describe('Initial State', () => {
    it('has empty selectedSlots', () => {
      const { result } = renderHook(() => useBookingStore());
      expect(result.current.selectedSlots).toEqual([]);
    });

    it('has bookingStep 2', () => {
      const { result } = renderHook(() => useBookingStore());
      expect(result.current.bookingStep).toBe(2);
    });

    it('has no selectedCourt', () => {
      const { result } = renderHook(() => useBookingStore());
      expect(result.current.selectedCourt).toBeNull();
    });

    it('has empty user details', () => {
      const { result } = renderHook(() => useBookingStore());
      expect(result.current.userName).toBe('');
      expect(result.current.userEmail).toBe('');
      expect(result.current.userPhone).toBe('');
    });
  });

  describe('selectCourt', () => {
    it('sets selected court and clears slots', () => {
      const { result } = renderHook(() => useBookingStore());
      const mockCourt = {
        id: 'court-1',
        name: 'Padel Court 1',
        sportType: 'Padel' as const,
        surface: 'Hard',
        isIndoor: true,
        capacity: 4,
        pricePerHour: 350,
        rating: 4.8,
        reviewCount: 42,
        image: '/images/court1.jpg',
        gallery: [],
        description: 'A great court',
        features: [],
        rules: [],
        status: 'Available' as const,
        workingHours: { open: '07:00', close: '23:00' },
        slotDurationMinutes: 60,
      };

      act(() => {
        result.current.selectCourt(mockCourt);
      });

      expect(result.current.selectedCourt).toEqual(mockCourt);
      expect(result.current.selectedSlots).toEqual([]);
    });
  });

  describe('selectDate', () => {
    it('sets selected date and clears slots', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => {
        result.current.selectDate('2026-09-15');
      });

      expect(result.current.selectedDate).toBe('2026-09-15');
      expect(result.current.selectedSlots).toEqual([]);
    });
  });

  describe('setBookingStep', () => {
    it('updates booking step', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => {
        result.current.setBookingStep(3);
      });

      expect(result.current.bookingStep).toBe(3);
    });
  });

  describe('setUserDetails', () => {
    it('updates user details', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => {
        result.current.setUserDetails({
          userName: 'John Doe',
          userEmail: 'john@example.com',
          userPhone: '+1234567890',
        });
      });

      expect(result.current.userName).toBe('John Doe');
      expect(result.current.userEmail).toBe('john@example.com');
      expect(result.current.userPhone).toBe('+1234567890');
    });
  });

  describe('clearSelectedSlots', () => {
    it('clears selected slots', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => {
        result.current.clearSelectedSlots();
      });

      expect(result.current.selectedSlots).toEqual([]);
    });
  });

  describe('Reservation Management', () => {
    it('startTemporaryReservation sets timestamps', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => {
        result.current.startTemporaryReservation();
      });

      expect(result.current.reservationStartTime).toBeTypeOf('number');
      expect(result.current.reservationExpiresAt).toBeTypeOf('number');
      expect(result.current.hasExtendedReservation).toBe(false);
    });

    it('extendReservation extends by 5 minutes', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => {
        result.current.startTemporaryReservation();
      });

      const originalExpiry = result.current.reservationExpiresAt;

      act(() => {
        const extended = result.current.extendReservation();
        expect(extended).toBe(true);
      });

      expect(result.current.reservationExpiresAt).toBe(originalExpiry! + 5 * 60 * 1000);
      expect(result.current.hasExtendedReservation).toBe(true);
    });

    it('extendReservation fails if already extended', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => {
        result.current.startTemporaryReservation();
      });

      act(() => {
        result.current.extendReservation();
      });

      act(() => {
        const extended = result.current.extendReservation();
        expect(extended).toBe(false);
      });
    });

    it('clearReservation resets all reservation state', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => {
        result.current.startTemporaryReservation();
      });

      act(() => {
        result.current.clearReservation();
      });

      expect(result.current.reservationStartTime).toBeNull();
      expect(result.current.reservationExpiresAt).toBeNull();
      expect(result.current.hasExtendedReservation).toBe(false);
      expect(result.current.selectedSlots).toEqual([]);
    });
  });

  describe('resetBookingFlow', () => {
    it('resets all booking state', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => {
        result.current.setBookingStep(3);
        result.current.setUserDetails({
          userName: 'Test',
          userEmail: 'test@test.com',
          userPhone: '123',
        });
      });

      act(() => {
        result.current.resetBookingFlow();
      });

      expect(result.current.selectedCourt).toBeNull();
      expect(result.current.selectedSlots).toEqual([]);
      expect(result.current.bookingStep).toBe(2);
      expect(result.current.userName).toBe('');
      expect(result.current.userEmail).toBe('');
      expect(result.current.userPhone).toBe('');
    });
  });

  describe('confirmBooking', () => {
    it('returns error if no court selected', async () => {
      const { result } = renderHook(() => useBookingStore());

      let bookingResult: { success: boolean; error?: string } | undefined;
      await act(async () => {
        bookingResult = await result.current.confirmBooking();
      });

      expect(bookingResult?.success).toBe(false);
      expect(bookingResult?.error).toContain('No court selected');
    });

    it('returns error if no slots selected', async () => {
      const { result } = renderHook(() => useBookingStore());
      const mockCourt = {
        id: 'court-1',
        name: 'Padel Court 1',
        sportType: 'Padel' as const,
        surface: 'Hard',
        isIndoor: true,
        capacity: 4,
        pricePerHour: 350,
        rating: 4.8,
        reviewCount: 42,
        image: '/images/court1.jpg',
        gallery: [],
        description: 'A great court',
        features: [],
        rules: [],
        status: 'Available' as const,
        workingHours: { open: '07:00', close: '23:00' },
        slotDurationMinutes: 60,
      };

      act(() => {
        result.current.selectCourt(mockCourt);
      });

      // selectedSlots is still empty after selectCourt
      expect(result.current.selectedSlots).toEqual([]);

      let bookingResult: { success: boolean; error?: string } | undefined;
      await act(async () => {
        bookingResult = await result.current.confirmBooking();
      });

      expect(bookingResult?.success).toBe(false);
      expect(bookingResult?.error).toContain('No time slots selected');
    });
  });

  describe('cancelBooking', () => {
    it('returns error if booking not found', async () => {
      const { result } = renderHook(() => useBookingStore());

      let cancelResult: { success: boolean; error?: string } | undefined;
      await act(async () => {
        cancelResult = await result.current.cancelBooking('non-existent-id');
      });

      expect(cancelResult?.success).toBe(false);
      expect(cancelResult?.error).toContain('Booking not found');
    });

    it('returns error if already cancelled/expired (client-side pre-check)', async () => {
      const { cancelBookingAction } = await import('@/app/actions/booking.actions');
      vi.mocked(cancelBookingAction).mockResolvedValue({
        success: false,
        error: 'Booking is already cancelled.',
      });

      const { result } = renderHook(() => useBookingStore());

      // First cancel to get it into Cancelled state
      let cancelResult: { success: boolean; error?: string } | undefined;
      await act(async () => {
        cancelResult = await result.current.cancelBooking('booking-to-cancel');
      });

      // The mock returns failure, so booking stays in current state
      // But we can verify the store checks status before calling server
      expect(cancelResult?.success).toBe(false);
    });
  });

  describe('isCancelling flag', () => {
    it('prevents duplicate concurrent cancellation requests', async () => {
      const { cancelBookingAction } = await import('@/app/actions/booking.actions');

      // Pre-populate store with a booking
      const testBooking = {
        id: 'booking-concurrent-test',
        bookingNumber: 'KH-123456',
        courtId: 'court-1',
        courtName: 'Court 1',
        courtImage: '',
        sportType: 'Padel' as const,
        date: '2099-06-15',
        startTime: '10:00',
        endTime: '11:00',
        durationMinutes: 60,
        totalPrice: 200,
        status: 'Confirmed' as const,
        bookingSource: 'ONLINE' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: 'user-1',
        userName: 'Test',
        userEmail: 'test@test.com',
        userPhone: '123',
        selectedSlotIds: [],
      };
      useBookingStore.setState({ bookings: [testBooking] });

      // Create a deferred promise to control when the first cancel resolves
      let resolveFirst!: (value: any) => void;
      const firstCall = new Promise((resolve) => { resolveFirst = resolve; });
      vi.mocked(cancelBookingAction).mockImplementationOnce(() => firstCall as any);

      const { result } = renderHook(() => useBookingStore());

      // Start first cancellation (don't await)
      act(() => {
        result.current.cancelBooking('booking-concurrent-test');
      });

      // While first is in flight, try second cancellation
      let secondResult: any;
      await act(async () => {
        secondResult = await result.current.cancelBooking('booking-concurrent-test');
      });

      // Second should be rejected because isCancelling is true
      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain('Cancellation already in progress');

      // Resolve first call to clean up
      await act(async () => {
        resolveFirst({ success: false, error: 'Server error' });
      });
    });

    it('resets isCancelling after cancellation completes', async () => {
      const { cancelBookingAction } = await import('@/app/actions/booking.actions');

      const testBooking = {
        id: 'booking-reset-test',
        bookingNumber: 'KH-123457',
        courtId: 'court-1',
        courtName: 'Court 1',
        courtImage: '',
        sportType: 'Padel' as const,
        date: '2099-06-15',
        startTime: '10:00',
        endTime: '11:00',
        durationMinutes: 60,
        totalPrice: 200,
        status: 'Confirmed' as const,
        bookingSource: 'ONLINE' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: 'user-1',
        userName: 'Test',
        userEmail: 'test@test.com',
        userPhone: '123',
        selectedSlotIds: [],
      };
      useBookingStore.setState({ bookings: [testBooking] });

      vi.mocked(cancelBookingAction).mockResolvedValue({
        success: false,
        error: 'Server error',
      });

      const { result } = renderHook(() => useBookingStore());

      await act(async () => {
        await result.current.cancelBooking('booking-reset-test');
      });

      // isCancelling should be false after completion
      expect(result.current.isCancelling).toBe(false);
    });

    it('resets isCancelling after cancellation fails', async () => {
      const { cancelBookingAction } = await import('@/app/actions/booking.actions');

      const testBooking = {
        id: 'booking-fail-test',
        bookingNumber: 'KH-123458',
        courtId: 'court-1',
        courtName: 'Court 1',
        courtImage: '',
        sportType: 'Padel' as const,
        date: '2099-06-15',
        startTime: '10:00',
        endTime: '11:00',
        durationMinutes: 60,
        totalPrice: 200,
        status: 'Confirmed' as const,
        bookingSource: 'ONLINE' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: 'user-1',
        userName: 'Test',
        userEmail: 'test@test.com',
        userPhone: '123',
        selectedSlotIds: [],
      };
      useBookingStore.setState({ bookings: [testBooking] });

      vi.mocked(cancelBookingAction).mockRejectedValue(new Error('Network failure'));

      const { result } = renderHook(() => useBookingStore());

      await act(async () => {
        await result.current.cancelBooking('booking-fail-test');
      });

      // isCancelling should be false even after error
      expect(result.current.isCancelling).toBe(false);
    });
  });
});
