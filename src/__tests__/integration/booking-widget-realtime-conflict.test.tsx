/**
 * @file booking-widget-realtime-conflict.test.tsx
 *
 * Verifies the fix for:
 * 1. User's own booking/hold creation does NOT trigger "A slot you selected was just booked by another player."
 * 2. Another player's booking/hold DOES trigger "A slot you selected was just booked by another player."
 * 3. Another player's booking automatically deselects the conflicting slot from selectedSlots.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { BookingWidget } from '@/features/booking/BookingWidget';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { toast } from 'sonner';
import { Court, TimeSlot, Booking } from '@/types';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ fill, priority, ...props }: any) => <img {...props} />,
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock Supabase client
const mockRemoveChannel = vi.fn();
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

// Mock useAllBookingsForDate hook
let mockPublicBookings: Booking[] = [];
const mockRefetch = vi.fn();
vi.mock('@/hooks/useAllBookingsForDate', () => ({
  useAllBookingsForDate: () => ({
    bookings: mockPublicBookings,
    loading: false,
    error: null,
    refetch: mockRefetch,
  }),
}));

const TEST_COURT: Court = {
  id: 'court-100',
  name: 'Center Padel Court',
  sportType: 'Padel',
  surface: 'Turf',
  isIndoor: true,
  capacity: 4,
  pricePerHour: 400,
  rating: 4.9,
  reviewCount: 15,
  image: '/images/courts/padel-1.jpg',
  gallery: [],
  description: 'Padel court description',
  features: ['Lighting'],
  rules: [],
  status: 'Available',
  workingHours: { open: '08:00', close: '23:00' },
  slotDurationMinutes: 60,
};

const TEST_DATE = '2026-11-10';

const TEST_SLOT: TimeSlot = {
  id: 'slot-court-100-2026-11-10-18:00',
  courtId: 'court-100',
  date: TEST_DATE,
  startTime: '18:00',
  endTime: '19:00',
  price: 400,
  status: 'Available',
};

describe('BookingWidget Realtime Conflict Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublicBookings = [];

    // Set up auth user
    useAuthStore.setState({
      user: {
        id: 'user-alice-123',
        email: 'alice@example.com',
        name: 'Alice',
        role: 'user',
      },
    });

    // Set up booking store with selected court and slot
    useBookingStore.setState({
      selectedCourt: TEST_COURT,
      selectedDate: TEST_DATE,
      selectedSlots: [TEST_SLOT],
      bookings: [],
      bookingStep: 2,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT trigger conflict toast when current user creates their own hold', async () => {
    const { rerender } = render(<BookingWidget />);

    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();

    // Simulate store updating with current user's newly created hold
    const aliceHold: Booking = {
      id: 'booking-alice-hold-1',
      bookingNumber: 'WEGO-20261110-001',
      courtId: 'court-100',
      courtName: 'Center Padel Court',
      courtImage: '/images/courts/padel-1.jpg',
      sportType: 'Padel',
      date: TEST_DATE,
      startTime: '18:00',
      endTime: '19:00',
      durationMinutes: 60,
      totalPrice: 400,
      status: 'Reserved',
      bookingSource: 'ONLINE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: 'user-alice-123',
      userName: 'Alice',
      userEmail: 'alice@example.com',
      selectedSlotIds: ['slot-court-100-2026-11-10-18:00'],
      isOwn: true,
    };

    act(() => {
      useBookingStore.setState({
        bookings: [aliceHold],
      });
    });

    rerender(<BookingWidget />);

    // Assert: No conflict error message should be shown for user's own hold!
    expect(toast.error).not.toHaveBeenCalledWith('A slot you selected was just booked by another player.');

    // Assert: Slot remains selected for the user
    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);
  });

  it('triggers conflict toast and deselects slot when ANOTHER player books the slot', async () => {
    const { rerender } = render(<BookingWidget />);

    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();

    // Simulate another player (Bob) booking the same slot
    const bobBooking: Booking = {
      id: 'booking-bob-hold-2',
      bookingNumber: 'WEGO-20261110-002',
      courtId: 'court-100',
      courtName: 'Center Padel Court',
      courtImage: '/images/courts/padel-1.jpg',
      sportType: 'Padel',
      date: TEST_DATE,
      startTime: '18:00',
      endTime: '19:00',
      durationMinutes: 60,
      totalPrice: 400,
      status: 'Reserved',
      bookingSource: 'ONLINE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: 'user-bob-999',
      userName: 'Bob',
      userEmail: 'bob@example.com',
      selectedSlotIds: ['slot-court-100-2026-11-10-18:00'],
      isOwn: false,
    };

    // Update public bookings (as received via Supabase realtime refetch)
    mockPublicBookings = [bobBooking];

    act(() => {
      // Trigger update
      useBookingStore.setState({
        selectedCourt: { ...TEST_COURT },
      });
    });

    rerender(<BookingWidget />);

    // Assert: Toast error IS called because it belongs to ANOTHER player
    expect(toast.error).toHaveBeenCalledWith('A slot you selected was just booked by another player.');

    // Assert: Slot is deselected
    expect(useBookingStore.getState().selectedSlots).toHaveLength(0);
  });

  it('handles guest users correctly when another player books a slot', async () => {
    // Set guest user (unauthenticated)
    useAuthStore.setState({ user: null });
    useBookingStore.setState({
      selectedCourt: TEST_COURT,
      selectedDate: TEST_DATE,
      selectedSlots: [TEST_SLOT],
      bookings: [],
      bookingStep: 2,
    });

    const { rerender } = render(<BookingWidget />);

    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);

    // Another player books the slot
    const externalBooking: Booking = {
      id: 'booking-ext-3',
      bookingNumber: 'WEGO-20261110-003',
      courtId: 'court-100',
      courtName: 'Center Padel Court',
      courtImage: '/images/courts/padel-1.jpg',
      sportType: 'Padel',
      date: TEST_DATE,
      startTime: '18:00',
      endTime: '19:00',
      durationMinutes: 60,
      totalPrice: 400,
      status: 'Confirmed',
      bookingSource: 'ONLINE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: 'user-charlie-888',
      userName: 'Charlie',
      userEmail: 'charlie@example.com',
      selectedSlotIds: ['slot-court-100-2026-11-10-18:00'],
      isOwn: false,
    };

    mockPublicBookings = [externalBooking];

    act(() => {
      useBookingStore.setState({
        selectedCourt: { ...TEST_COURT },
      });
    });

    rerender(<BookingWidget />);

    expect(toast.error).toHaveBeenCalledWith('A slot you selected was just booked by another player.');
    expect(useBookingStore.getState().selectedSlots).toHaveLength(0);
  });

  it('does NOT trigger conflict toast when an authenticated guest user creates their own temporary hold', async () => {
    // Set guest user with role 'Guest'
    useAuthStore.setState({
      user: {
        id: 'guest-user-456',
        email: 'guest@example.com',
        name: 'Guest Player',
        role: 'Guest',
        phone: '+201000000000',
      },
    });

    useBookingStore.setState({
      selectedCourt: TEST_COURT,
      selectedDate: TEST_DATE,
      selectedSlots: [TEST_SLOT],
      bookings: [],
      bookingStep: 2,
    });

    const { rerender } = render(<BookingWidget />);

    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();

    // Guest user creates a temporary hold (Reserved status, userId stamped)
    const guestHold: Booking = {
      id: 'booking-guest-hold-456',
      bookingNumber: 'KH-882194',
      courtId: 'court-100',
      courtName: 'Center Padel Court',
      courtImage: '/images/courts/padel-1.jpg',
      sportType: 'Padel',
      date: TEST_DATE,
      startTime: '18:00',
      endTime: '19:00',
      durationMinutes: 60,
      totalPrice: 400,
      status: 'Reserved',
      bookingSource: 'ONLINE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: 'guest-user-456',
      userName: 'Guest Player',
      userEmail: 'guest@example.com',
      userPhone: '+201000000000',
      selectedSlotIds: ['slot-court-100-2026-11-10-18:00'],
      isOwn: true,
    };

    // 1. Local store updates with the newly created hold
    act(() => {
      useBookingStore.setState({
        bookings: [guestHold],
      });
    });

    rerender(<BookingWidget />);

    // Assert: No false conflict toast for the guest's own hold
    expect(toast.error).not.toHaveBeenCalledWith('A slot you selected was just booked by another player.');
    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);

    // 2. Realtime broadcast syncs public bookings containing this hold
    mockPublicBookings = [
      {
        ...guestHold,
        userName: '',
        userEmail: '',
        userPhone: '',
        isOwn: true,
      },
    ];

    act(() => {
      useBookingStore.setState({
        selectedCourt: { ...TEST_COURT },
      });
    });

    rerender(<BookingWidget />);

    // Assert: Still no conflict toast, and slot remains selected
    expect(toast.error).not.toHaveBeenCalledWith('A slot you selected was just booked by another player.');
    expect(useBookingStore.getState().selectedSlots).toHaveLength(1);
  });
});
