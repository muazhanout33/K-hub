import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { useBookingStore } from '@/features/booking/useBookingStore';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { generateAvailabilitySlots } from '@/lib/availability';
import { calculateBookingPrice } from '@/lib/pricing';
import { MOCK_COURTS } from '@/lib/mock-data';

vi.mock('@/app/actions/booking.actions', () => ({
  createBookingAction: vi.fn(),
  cancelBookingAction: vi.fn(),
  confirmBookingStatusAction: vi.fn(),
  expireStaleBookingsAction: vi.fn(),
}));

const bookingActions = vi.mocked(await import('@/app/actions/booking.actions'));

const TEST_COURT = MOCK_COURTS[0];

function resetAllStores() {
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
  usePaymentStore.setState({
    payments: [],
    lastIdempotencyKey: null,
  });
  useAuthStore.setState({
    user: { id: 'user-bf-1', name: 'John Doe', email: 'john@test.com', phone: '+1234567890', role: 'Guest', createdAt: '2026-01-01T00:00:00Z' },
    isAuthenticated: true,
  });
}

describe('Booking Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllStores();
  });

  describe('Step 1: Court selection → date → slot selection', () => {
    it('selects a court and initializes empty slots', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => { result.current.selectCourt(TEST_COURT); });

      expect(result.current.selectedCourt?.id).toBe(TEST_COURT.id);
      expect(result.current.selectedSlots).toHaveLength(0);
    });

    it('toggles slots on and off', () => {
      const { result } = renderHook(() => useBookingStore());
      const futureDate = '2099-12-01';

      act(() => { result.current.selectCourt(TEST_COURT); });
      act(() => { result.current.selectDate(futureDate); });

      const slots = generateAvailabilitySlots(TEST_COURT, futureDate, [], []);
      const nineSlot = slots.find(s => s.startTime === '09:00')!;
      const tenSlot = slots.find(s => s.startTime === '10:00')!;

      act(() => { result.current.toggleSlot(nineSlot); });
      expect(result.current.selectedSlots).toHaveLength(1);
      expect(result.current.selectedSlots[0].startTime).toBe('09:00');

      act(() => { result.current.toggleSlot(tenSlot); });
      expect(result.current.selectedSlots).toHaveLength(2);

      act(() => { result.current.toggleSlot(nineSlot); });
      expect(result.current.selectedSlots).toHaveLength(1);
      expect(result.current.selectedSlots[0].startTime).toBe('10:00');
    });
  });

  describe('Step 2: Pricing calculation from selected slots', () => {
    it('price from store slots matches manual calculation', () => {
      const { result } = renderHook(() => useBookingStore());
      const futureDate = '2099-12-01';

      act(() => { result.current.selectCourt(TEST_COURT); });
      act(() => { result.current.selectDate(futureDate); });

      const slots = generateAvailabilitySlots(TEST_COURT, futureDate, [], []);
      const nineSlot = slots.find(s => s.startTime === '09:00')!;
      const tenSlot = slots.find(s => s.startTime === '10:00')!;

      act(() => {
        result.current.toggleSlot(nineSlot);
        result.current.toggleSlot(tenSlot);
      });

      const durationMinutes = result.current.selectedSlots.length * 60;
      const expectedPrice = calculateBookingPrice(TEST_COURT.pricePerHour, durationMinutes);

      expect(expectedPrice).toBe(TEST_COURT.pricePerHour * 2);
    });
  });

  describe('Step 3: User details', () => {
    it('sets user details in store', () => {
      const { result } = renderHook(() => useBookingStore());

      act(() => {
        result.current.setUserDetails({
          userName: 'Jane Smith',
          userEmail: 'jane@test.com',
          userPhone: '+9876543210',
        });
      });

      expect(result.current.userName).toBe('Jane Smith');
      expect(result.current.userEmail).toBe('jane@test.com');
      expect(result.current.userPhone).toBe('+9876543210');
    });
  });

  describe('Step 4: confirmBooking delegates to server action', () => {
    it('calls createBookingAction with correct payload', async () => {
      const mockBooking = {
        id: 'booking-new-1',
        bookingNumber: 'KB-20990615-001',
        courtId: TEST_COURT.id,
        courtName: TEST_COURT.name,
        courtImage: TEST_COURT.image,
        sportType: TEST_COURT.sportType,
        userId: 'user-bf-1',
        userName: 'John Doe',
        userEmail: 'john@test.com',
        userPhone: '+1234567890',
        date: '2099-06-15',
        startTime: '09:00',
        endTime: '11:00',
        durationMinutes: 120,
        totalPrice: 800,
        status: 'Reserved' as const,
        bookingSource: 'ONLINE' as const,
        selectedSlotIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      bookingActions.createBookingAction.mockResolvedValue({ success: true, booking: mockBooking });

      const { result } = renderHook(() => useBookingStore());
      const futureDate = '2099-06-15';

      act(() => { result.current.selectCourt(TEST_COURT); });
      act(() => { result.current.selectDate(futureDate); });

      const slots = generateAvailabilitySlots(TEST_COURT, futureDate, [], []);
      const nineSlot = slots.find(s => s.startTime === '09:00')!;
      const tenSlot = slots.find(s => s.startTime === '10:00')!;

      act(() => {
        result.current.toggleSlot(nineSlot);
        result.current.toggleSlot(tenSlot);
        result.current.setUserDetails({
          userName: 'John Doe',
          userEmail: 'john@test.com',
          userPhone: '+1234567890',
        });
      });

      const bookingResult = await act(() => result.current.confirmBooking());

      expect(bookingResult.success).toBe(true);
      expect(bookingActions.createBookingAction).toHaveBeenCalledWith(
        expect.objectContaining({
          courtId: TEST_COURT.id,
          date: futureDate,
          totalPrice: expect.any(Number),
        })
      );
    });
  });

  describe('Full lifecycle: select → price → confirm → reset', () => {
    it('completes the full booking flow and resets', async () => {
      const mockBooking = {
        id: 'booking-full-1',
        bookingNumber: 'KB-20991201-001',
        courtId: TEST_COURT.id,
        courtName: TEST_COURT.name,
        courtImage: TEST_COURT.image,
        sportType: TEST_COURT.sportType,
        userId: 'user-bf-1',
        userName: 'John Doe',
        userEmail: 'john@test.com',
        userPhone: '+1234567890',
        date: '2099-12-01',
        startTime: '09:00',
        endTime: '11:00',
        durationMinutes: 120,
        totalPrice: 800,
        status: 'Reserved' as const,
        bookingSource: 'ONLINE' as const,
        selectedSlotIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      bookingActions.createBookingAction.mockResolvedValue({ success: true, booking: mockBooking });

      const { result } = renderHook(() => useBookingStore());
      const futureDate = '2099-12-01';

      act(() => { result.current.selectCourt(TEST_COURT); });
      act(() => { result.current.selectDate(futureDate); });

      const slots = generateAvailabilitySlots(TEST_COURT, futureDate, [], []);
      const nineSlot = slots.find(s => s.startTime === '09:00')!;
      const tenSlot = slots.find(s => s.startTime === '10:00')!;

      act(() => {
        result.current.toggleSlot(nineSlot);
        result.current.toggleSlot(tenSlot);
      });
      expect(result.current.selectedSlots).toHaveLength(2);

      const durationMinutes = result.current.selectedSlots.length * 60;
      const expectedPrice = calculateBookingPrice(TEST_COURT.pricePerHour, durationMinutes);

      act(() => {
        result.current.setUserDetails({
          userName: 'John Doe',
          userEmail: 'john@test.com',
          userPhone: '+1234567890',
        });
      });

      const bookingResult = await act(() => result.current.confirmBooking());
      expect(bookingResult.success).toBe(true);

      expect(result.current.bookings).toHaveLength(1);
      expect(result.current.selectedSlots).toHaveLength(0);
      expect(result.current.bookingStep).toBe(4);
    });
  });
});
