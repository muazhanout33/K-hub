/**
 * @file consecutive-slots-and-court-change.test.ts
 *
 * Verifies the fixes for:
 * 1. Clearing selectedSlots on 23P01 / booking conflict so store is not trapped.
 * 2. toggleSlot rejecting non-consecutive slots cleanly via nonConsecutiveSlotTick.
 * 3. Court and date switches after a conflict send strictly new payload.
 * 4. selectedDate sync from CourtDetailsPage to useBookingStore.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { Court, TimeSlot } from '@/types';

// Mock server actions
const mockCreateBookingAction = vi.fn();
vi.mock('@/app/actions/booking.actions', () => ({
  createBookingAction: (...args: any[]) => mockCreateBookingAction(...args),
  cancelBookingAction: vi.fn(),
  confirmBookingStatusAction: vi.fn(),
  expireStaleBookingsAction: vi.fn(),
  getBookingStatusAction: vi.fn(),
}));

vi.mock('@/features/payment/usePaymentStore', () => ({
  usePaymentStore: {
    getState: () => ({
      pendingConfirmation: null,
      beginConfirmation: vi.fn(),
      clearConfirmation: vi.fn(),
    }),
  },
}));

vi.mock('@/features/booking/useBlockedPeriodStore', () => ({
  useBlockedPeriodStore: {
    getState: () => ({
      getBlockedPeriodsForCourtDate: () => [],
    }),
  },
}));

const COURT_1: Court = {
  id: 'a1b2c3d4-0001-4000-8000-000000000001',
  name: 'Court 1',
  sportType: 'Padel',
  surface: 'Turf',
  isIndoor: true,
  capacity: 4,
  pricePerHour: 400,
  rating: 4.9,
  reviewCount: 10,
  image: '/img1.jpg',
  gallery: [],
  description: 'Court 1 desc',
  features: [],
  rules: [],
  status: 'Available',
  workingHours: { open: '07:00', close: '00:00' },
  slotDurationMinutes: 60,
};

const COURT_2: Court = {
  id: 'a1b2c3d4-0002-4000-8000-000000000002',
  name: 'Court 2',
  sportType: 'Football',
  surface: 'Grass',
  isIndoor: false,
  capacity: 10,
  pricePerHour: 300,
  rating: 4.8,
  reviewCount: 15,
  image: '/img2.jpg',
  gallery: [],
  description: 'Court 2 desc',
  features: [],
  rules: [],
  status: 'Available',
  workingHours: { open: '07:00', close: '00:00' },
  slotDurationMinutes: 60,
};

describe('Booking Conflict Recovery & Multi-Court/Date Switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBookingStore.setState({
      selectedCourt: null,
      selectedDate: '2026-11-10',
      selectedSlots: [],
      userName: 'Player One',
      userEmail: 'player@example.com',
      userPhone: '+201000000000',
      bookings: [],
      maxHoursReachedTick: 0,
      nonConsecutiveSlotTick: 0,
    });
  });

  it('Step 1 & 2: User encounters 23P01 conflict, selectedSlots is cleared, store is not trapped', async () => {
    const store = useBookingStore.getState();
    store.selectCourt(COURT_1);
    store.selectDate('2099-05-10');

    const slot1: TimeSlot = {
      id: 'slot-c1-2099-05-10-10:00',
      courtId: COURT_1.id,
      date: '2099-05-10',
      startTime: '10:00',
      endTime: '11:00',
      price: 400,
      status: 'Available',
    };

    store.toggleSlot(slot1);
    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);

    // Simulate 23P01 conflict from server
    mockCreateBookingAction.mockResolvedValueOnce({
      success: false,
      error: 'This court slot has already been booked by another player. Please select a different slot.',
    });

    const result = await useBookingStore.getState().confirmBooking();

    // 1. Result reflects the conflict
    expect(result.success).toBe(false);
    expect(result.error).toContain('already been booked by another player');

    // 2. Conflicting slot is cleared from store
    expect(useBookingStore.getState().selectedSlots).toEqual([]);
  });

  it('Step 3: User B selects Court 2 and different date, payload strictly contains NEW court and date', async () => {
    const store = useBookingStore.getState();

    // Setup initial conflict on Court 1, Date 1
    store.selectCourt(COURT_1);
    store.selectDate('2099-05-10');
    store.toggleSlot({
      id: 'slot-c1-2099-05-10-10:00',
      courtId: COURT_1.id,
      date: '2099-05-10',
      startTime: '10:00',
      endTime: '11:00',
      price: 400,
      status: 'Available',
    });

    mockCreateBookingAction.mockResolvedValueOnce({
      success: false,
      error: 'This court slot has already been booked by another player. Please select a different slot.',
    });

    await useBookingStore.getState().confirmBooking();
    expect(useBookingStore.getState().selectedSlots).toHaveLength(0);

    // Now User B switches to Court 2 on Date 2 (2099-05-11)
    useBookingStore.getState().selectCourt(COURT_2);
    useBookingStore.getState().selectDate('2099-05-11');

    const newSlot: TimeSlot = {
      id: 'slot-c2-2099-05-11-14:00',
      courtId: COURT_2.id,
      date: '2099-05-11',
      startTime: '14:00',
      endTime: '15:00',
      price: 300,
      status: 'Available',
    };

    useBookingStore.getState().toggleSlot(newSlot);
    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);
    expect(useBookingStore.getState().selectedSlots[0].id).toBe('slot-c2-2099-05-11-14:00');

    // Mock successful creation for the new court/date
    mockCreateBookingAction.mockResolvedValueOnce({
      success: true,
      booking: {
        id: 'new-bk-123',
        bookingNumber: 'KH-123456',
        courtId: COURT_2.id,
        courtName: COURT_2.name,
        courtImage: COURT_2.image,
        sportType: COURT_2.sportType,
        date: '2099-05-11',
        startTime: '14:00',
        endTime: '15:00',
        durationMinutes: 60,
        totalPrice: 300,
        status: 'Reserved',
        bookingSource: 'ONLINE',
        createdAt: new Date().toISOString(),
      },
    });

    const secondAttempt = await useBookingStore.getState().confirmBooking();
    expect(secondAttempt.success).toBe(true);

    // Verify the EXACT payload passed to createBookingAction
    expect(mockCreateBookingAction).toHaveBeenLastCalledWith({
      courtId: COURT_2.id, // Strictly Court 2, NOT Court 1
      date: '2099-05-11',   // Strictly Date 2, NOT Date 1
      startTime: '14:00',  // Strictly 14:00, NOT 10:00
      endTime: '15:00',    // Strictly 15:00, NOT 11:00
      durationMinutes: 60,
      totalPrice: 300,
      userName: 'Player One',
      userEmail: 'player@example.com',
      userPhone: '+201000000000',
    });
  });

  it('Step 4: Repeated on same court with new date, payload strictly contains new date/time', async () => {
    const store = useBookingStore.getState();

    // First attempt on Court 1, Date 1 fails
    store.selectCourt(COURT_1);
    store.selectDate('2099-05-10');
    store.toggleSlot({
      id: 'slot-c1-2099-05-10-10:00',
      courtId: COURT_1.id,
      date: '2099-05-10',
      startTime: '10:00',
      endTime: '11:00',
      price: 400,
      status: 'Available',
    });

    mockCreateBookingAction.mockResolvedValueOnce({
      success: false,
      error: 'This court slot has already been booked by another player.',
    });
    await useBookingStore.getState().confirmBooking();

    // Now user switches to Date 3 on the SAME court
    useBookingStore.getState().selectDate('2099-05-12');
    const slotDate3: TimeSlot = {
      id: 'slot-c1-2099-05-12-16:00',
      courtId: COURT_1.id,
      date: '2099-05-12',
      startTime: '16:00',
      endTime: '17:00',
      price: 400,
      status: 'Available',
    };

    useBookingStore.getState().toggleSlot(slotDate3);

    mockCreateBookingAction.mockResolvedValueOnce({
      success: true,
      booking: {
        id: 'bk-same-court-new-date',
        bookingNumber: 'KH-999888',
        courtId: COURT_1.id,
        date: '2099-05-12',
        startTime: '16:00',
        endTime: '17:00',
        durationMinutes: 60,
        totalPrice: 400,
        status: 'Reserved',
      },
    });

    const result = await useBookingStore.getState().confirmBooking();
    expect(result.success).toBe(true);

    expect(mockCreateBookingAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        courtId: COURT_1.id,
        date: '2099-05-12',
        startTime: '16:00',
        endTime: '17:00',
      })
    );
  });

  it('Step 5: toggleSlot rejects non-consecutive slots and signals nonConsecutiveSlotTick', () => {
    const store = useBookingStore.getState();
    store.selectCourt(COURT_1);
    store.selectDate('2026-11-10');

    const slot10: TimeSlot = {
      id: 'slot-c1-2026-11-10-10:00',
      courtId: COURT_1.id,
      date: '2026-11-10',
      startTime: '10:00',
      endTime: '11:00',
      price: 400,
      status: 'Available',
    };

    const slot14: TimeSlot = {
      id: 'slot-c1-2026-11-10-14:00',
      courtId: COURT_1.id,
      date: '2026-11-10',
      startTime: '14:00',
      endTime: '15:00',
      price: 400,
      status: 'Available',
    };

    store.toggleSlot(slot10);
    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);
    expect(useBookingStore.getState().nonConsecutiveSlotTick).toBe(0);

    // Click non-consecutive slot 14:00
    store.toggleSlot(slot14);

    // Selected slots remains just [slot10], 14:00 is not appended
    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);
    expect(useBookingStore.getState().selectedSlots[0].id).toBe(slot10.id);

    // Tick incremented so UI warns the user
    expect(useBookingStore.getState().nonConsecutiveSlotTick).toBe(1);
  });

  it('Step 6: toggleSlot automatically discards mismatched court/date slots from previous state', () => {
    const store = useBookingStore.getState();
    store.selectCourt(COURT_1);
    store.selectDate('2026-11-10');

    // Simulate stale slot from Court 1
    useBookingStore.setState({
      selectedCourt: COURT_2,
      selectedDate: '2026-11-12',
      selectedSlots: [
        {
          id: 'slot-c1-2026-11-10-10:00',
          courtId: COURT_1.id,
          date: '2026-11-10',
          startTime: '10:00',
          endTime: '11:00',
          price: 400,
          status: 'Available',
        },
      ],
    });

    // User clicks a slot on Court 2, Date 2026-11-12
    const c2Slot: TimeSlot = {
      id: 'slot-c2-2026-11-12-09:00',
      courtId: COURT_2.id,
      date: '2026-11-12',
      startTime: '09:00',
      endTime: '10:00',
      price: 300,
      status: 'Available',
    };

    useBookingStore.getState().toggleSlot(c2Slot);

    // Stale Court 1 slot is discarded; Court 2 slot is cleanly selected
    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);
    expect(useBookingStore.getState().selectedSlots[0].courtId).toBe(COURT_2.id);
    expect(useBookingStore.getState().selectedSlots[0].date).toBe('2026-11-12');
  });
});
