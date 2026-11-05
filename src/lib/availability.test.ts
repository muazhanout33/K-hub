import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  timeToMinutes,
  minutesToTime,
  isMidnightCrossover,
  isWithinWorkingHours,
  isEndTimeWithinWorkingHours,
  generateAvailabilitySlots,
  isSlotBookedByBooking,
  isSlotBlocked,
  validateBookingRequest,
  getSlotId,
  isHoldActive,
  getSlotBookingStatus,
  getSlotBookingDetails,
} from './availability';
import { Booking, BlockedPeriod, Court, WorkingHours } from '@/types';

// Mock timezone for past-slot tests
vi.mock('./timezone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./timezone')>();
  return {
    ...actual,
    isSlotPast: vi.fn(() => false),
  };
});

import { isSlotPast } from './timezone';

// ── timeToMinutes ──

describe('timeToMinutes', () => {
  it('converts midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('converts 09:30', () => {
    expect(timeToMinutes('09:30')).toBe(570);
  });

  it('converts 23:59', () => {
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('converts 01:00', () => {
    expect(timeToMinutes('01:00')).toBe(60);
  });
});

// ── minutesToTime ──

describe('minutesToTime', () => {
  it('converts 0 to 00:00', () => {
    expect(minutesToTime(0)).toBe('00:00');
  });

  it('converts 570 to 09:30', () => {
    expect(minutesToTime(570)).toBe('09:30');
  });

  it('converts 1439 to 23:59', () => {
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('round-trips with timeToMinutes', () => {
    const times = ['00:00', '06:15', '12:00', '18:45', '23:59'];
    for (const t of times) {
      expect(minutesToTime(timeToMinutes(t))).toBe(t);
    }
  });
});

// ── isMidnightCrossover ──

describe('isMidnightCrossover', () => {
  it('returns false when close > open (normal hours)', () => {
    expect(isMidnightCrossover({ open: '09:00', close: '17:00' })).toBe(false);
  });

  it('returns true when close < open (past midnight)', () => {
    expect(isMidnightCrossover({ open: '09:00', close: '02:00' })).toBe(true);
  });

  it('returns false when close equals open', () => {
    expect(isMidnightCrossover({ open: '09:00', close: '09:00' })).toBe(false);
  });
});

// ── isWithinWorkingHours ──

describe('isWithinWorkingHours', () => {
  const normalHours: WorkingHours = { open: '09:00', close: '17:00' };
  const crossoverHours: WorkingHours = { open: '09:00', close: '02:00' };

  it('returns true for time within normal hours', () => {
    expect(isWithinWorkingHours('12:00', normalHours)).toBe(true);
  });

  it('returns true for opening time', () => {
    expect(isWithinWorkingHours('09:00', normalHours)).toBe(true);
  });

  it('returns false for closing time (half-open interval)', () => {
    expect(isWithinWorkingHours('17:00', normalHours)).toBe(false);
  });

  it('returns false for time before opening', () => {
    expect(isWithinWorkingHours('08:00', normalHours)).toBe(false);
  });

  it('returns true for time after midnight in crossover hours', () => {
    expect(isWithinWorkingHours('00:30', crossoverHours)).toBe(true);
  });

  it('returns true for time at open in crossover hours', () => {
    expect(isWithinWorkingHours('09:00', crossoverHours)).toBe(true);
  });

  it('returns false for time between close and open in crossover hours', () => {
    expect(isWithinWorkingHours('05:00', crossoverHours)).toBe(false);
  });
});

// ── isEndTimeWithinWorkingHours ──

describe('isEndTimeWithinWorkingHours', () => {
  const normalHours: WorkingHours = { open: '09:00', close: '17:00' };
  const crossoverHours: WorkingHours = { open: '09:00', close: '02:00' };

  it('returns true for end time within normal hours', () => {
    expect(isEndTimeWithinWorkingHours('2026-09-15', '09:00', '17:00', normalHours)).toBe(true);
  });

  it('returns true for end time before closing', () => {
    expect(isEndTimeWithinWorkingHours('2026-09-15', '09:00', '16:00', normalHours)).toBe(true);
  });

  it('returns false for end time after closing', () => {
    expect(isEndTimeWithinWorkingHours('2026-09-15', '09:00', '18:00', normalHours)).toBe(false);
  });

  it('returns true for end time at close in crossover (start after open)', () => {
    expect(isEndTimeWithinWorkingHours('2026-09-15', '20:00', '02:00', crossoverHours)).toBe(true);
  });
});

// ── isSlotBookedByBooking ──

describe('isSlotBookedByBooking', () => {
  const bookings: Booking[] = [
    {
      id: 'b1',
      bookingNumber: 'KH-001',
      courtId: 'court-1',
      courtName: 'Court 1',
      courtImage: '',
      sportType: 'Padel',
      date: '2026-09-15',
      startTime: '10:00',
      endTime: '12:00',
      durationMinutes: 120,
      totalPrice: 200,
      status: 'Confirmed',
      bookingSource: 'ONLINE',
      createdAt: '',
      updatedAt: '',
      userId: 'u1',
      userName: 'A',
      userEmail: '',
      userPhone: '',
      selectedSlotIds: [],
    },
  ];

  it('returns true for overlapping booking', () => {
    expect(isSlotBookedByBooking('court-1', '2026-09-15', '11:00', '13:00', bookings)).toBe(true);
  });

  it('returns false for non-overlapping booking', () => {
    expect(isSlotBookedByBooking('court-1', '2026-09-15', '12:00', '14:00', bookings)).toBe(false);
  });

  it('returns false for different court', () => {
    expect(isSlotBookedByBooking('court-2', '2026-09-15', '10:00', '12:00', bookings)).toBe(false);
  });

  it('returns false for different date', () => {
    expect(isSlotBookedByBooking('court-1', '2026-09-16', '10:00', '12:00', bookings)).toBe(false);
  });

  it('returns false for Cancelled bookings', () => {
    const cancelled = [{ ...bookings[0], status: 'Cancelled' as const }];
    expect(isSlotBookedByBooking('court-1', '2026-09-15', '10:00', '12:00', cancelled)).toBe(false);
  });
});

// ── isSlotBlocked ──

describe('isSlotBlocked', () => {
  const blocked: BlockedPeriod[] = [
    {
      id: 'bp1',
      courtId: 'court-1',
      date: '2026-09-15',
      startTime: '14:00',
      endTime: '18:00',
      reason: 'Maintenance',
      createdAt: '',
    },
  ];

  it('returns true for overlapping blocked period', () => {
    expect(isSlotBlocked('2026-09-15', '15:00', '19:00', blocked)).toBe(true);
  });

  it('returns false for non-overlapping blocked period', () => {
    expect(isSlotBlocked('2026-09-15', '18:00', '20:00', blocked)).toBe(false);
  });

  it('returns false for different date', () => {
    expect(isSlotBlocked('2026-09-16', '14:00', '18:00', blocked)).toBe(false);
  });
});

// ── validateBookingRequest ──

describe('validateBookingRequest', () => {
  const court: Court = {
    id: 'court-1',
    name: 'Court 1',
    sportType: 'Padel',
    surface: 'Artificial Turf',
    isIndoor: false,
    capacity: 4,
    image: '',
    pricePerHour: 200,
    rating: 4.5,
    reviewCount: 10,
    gallery: [],
    status: 'Available',
    workingHours: { open: '09:00', close: '17:00' },
    slotDurationMinutes: 60,
    description: '',
    features: [],
    rules: [],
  };

  it('returns invalid if court is undefined', () => {
    const result = validateBookingRequest(undefined, '2026-09-15', '10:00', '11:00', [], []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Court not found');
  });

  it('returns invalid if court status is Maintenance', () => {
    const result = validateBookingRequest(
      { ...court, status: 'Maintenance' },
      '2026-09-15', '10:00', '11:00', [], []
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('returns valid for Available court with no conflicts', () => {
    const result = validateBookingRequest(court, '2099-01-01', '10:00', '11:00', [], []);
    expect(result.valid).toBe(true);
  });

  it('returns valid for Starts Soon status', () => {
    const result = validateBookingRequest(
      { ...court, status: 'Starts Soon' },
      '2099-01-01', '10:00', '11:00', [], []
    );
    expect(result.valid).toBe(true);
  });
});

// ── getSlotId ──

describe('getSlotId', () => {
  it('generates correct slot ID', () => {
    expect(getSlotId('court-1', '2026-09-15', '10:00')).toBe('slot-court-1-2026-09-15-10:00');
  });
});

// ── validateBookingRequest edge cases (coverage gaps) ──

describe('validateBookingRequest edge cases', () => {
  const court: Court = {
    id: 'court-1',
    name: 'Court 1',
    sportType: 'Padel',
    surface: 'Artificial Turf',
    isIndoor: false,
    capacity: 4,
    image: '',
    pricePerHour: 200,
    rating: 4.5,
    reviewCount: 10,
    gallery: [],
    status: 'Available',
    workingHours: { open: '09:00', close: '17:00' },
    slotDurationMinutes: 60,
    description: '',
    features: [],
    rules: [],
  };

  beforeEach(() => {
    vi.mocked(isSlotPast).mockReturnValue(false);
  });

  it('rejects slot when isSlotPast returns true (past slot)', () => {
    vi.mocked(isSlotPast).mockReturnValue(true);
    const result = validateBookingRequest(court, '2026-09-15', '10:00', '11:00', [], []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('past');
  });

  it('rejects start time before working hours', () => {
    const result = validateBookingRequest(court, '2099-01-01', '08:00', '09:00', [], []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside working hours');
  });

  it('rejects end time at closing (half-open interval)', () => {
    // 09:00–17:00 working hours; slot 09:00–17:00 → endTime 17:00 is NOT < close (17:00), so valid
    // Actually: isEndTimeWithinWorkingHours checks end <= close for normal hours → 17:00 <= 17:00 = true
    // The real boundary: slot 08:00–09:00 would be rejected by isWithinWorkingHours first
    // Slot 16:00–17:00: start=16:00 within hours, endTime=17:00 <= 17:00 = valid
    // Slot 16:00–17:30: endTime=17:30 > 17:00 = invalid
    const result = validateBookingRequest(court, '2099-01-01', '16:00', '17:30', [], []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds court closing time');
  });

  it('accepts slot ending exactly at closing time', () => {
    const result = validateBookingRequest(court, '2099-01-01', '16:00', '17:00', [], []);
    expect(result.valid).toBe(true);
  });

  it('rejects blocked slot', () => {
    const blocked: BlockedPeriod[] = [
      {
        id: 'bp1',
        courtId: 'court-1',
        date: '2099-01-01',
        startTime: '14:00',
        endTime: '16:00',
        reason: 'Maintenance',
        createdAt: '',
      },
    ];
    const result = validateBookingRequest(court, '2099-01-01', '15:00', '16:00', [], blocked);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('blocked');
  });

  it('rejects conflicting booking', () => {
    const bookings: Booking[] = [
      {
        id: 'b1',
        bookingNumber: 'KH-001',
        courtId: 'court-1',
        courtName: 'Court 1',
        courtImage: '',
        sportType: 'Padel',
        date: '2099-01-01',
        startTime: '10:00',
        endTime: '12:00',
        durationMinutes: 120,
        totalPrice: 400,
        status: 'Confirmed',
        bookingSource: 'ONLINE',
        createdAt: '',
        updatedAt: '',
        userId: 'u1',
        userName: 'A',
        userEmail: '',
        userPhone: '',
        selectedSlotIds: [],
      },
    ];
    const result = validateBookingRequest(court, '2099-01-01', '11:00', '12:00', bookings, []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('conflicts');
  });

  it('accepts adjacent (non-overlapping) bookings', () => {
    const bookings: Booking[] = [
      {
        id: 'b1',
        bookingNumber: 'KH-001',
        courtId: 'court-1',
        courtName: 'Court 1',
        courtImage: '',
        sportType: 'Padel',
        date: '2099-01-01',
        startTime: '10:00',
        endTime: '11:00',
        durationMinutes: 60,
        totalPrice: 200,
        status: 'Confirmed',
        bookingSource: 'ONLINE',
        createdAt: '',
        updatedAt: '',
        userId: 'u1',
        userName: 'A',
        userEmail: '',
        userPhone: '',
        selectedSlotIds: [],
      },
    ];
    const result = validateBookingRequest(court, '2099-01-01', '11:00', '12:00', bookings, []);
    expect(result.valid).toBe(true);
  });
});

// ── isSlotBookedByBooking edge case (Reserved status) ──

describe('isSlotBookedByBooking edge cases', () => {
  it('returns true for Reserved status bookings', () => {
    const bookings: Booking[] = [
      {
        id: 'b1',
        bookingNumber: 'KH-001',
        courtId: 'court-1',
        courtName: 'Court 1',
        courtImage: '',
        sportType: 'Padel',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '12:00',
        durationMinutes: 120,
        totalPrice: 200,
        status: 'Reserved',
        bookingSource: 'ONLINE',
        createdAt: '',
        updatedAt: '',
        userId: 'u1',
        userName: 'A',
        userEmail: '',
        userPhone: '',
        selectedSlotIds: [],
      },
    ];
    expect(isSlotBookedByBooking('court-1', '2026-09-15', '11:00', '13:00', bookings)).toBe(true);
  });
});


// ── Midnight Boundary Bug Regression Tests ──────────────────────────────────
//
// Root Cause: When a booking ends exactly at midnight (endTime = "00:00"),
// timeToMinutes("00:00") returns 0. The overlap check `slotStart < bEnd`
// becomes `slotStart < 0` which is ALWAYS FALSE — making the slot appear
// Available on the frontend even though the database GiST constraint would
// reject a booking attempt for the same slot.
//
// Fix: endTimeToMinutes("00:00") = 1440 (treating midnight as end-of-day).
// ─────────────────────────────────────────────────────────────────────────────

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b-mid',
    bookingNumber: 'KH-MID',
    courtId: 'court-1',
    courtName: 'Court 1',
    courtImage: '',
    sportType: 'Padel',
    date: '2099-06-15',
    startTime: '23:00',
    endTime: '00:00',
    durationMinutes: 60,
    totalPrice: 150,
    status: 'Confirmed',
    bookingSource: 'ONLINE',
    createdAt: '',
    updatedAt: '',
    userId: 'u1',
    userName: 'User A',
    userEmail: 'a@test.com',
    userPhone: '+201000000001',
    selectedSlotIds: [],
    ...overrides,
  };
}

describe('isSlotBookedByBooking — midnight boundary (regression for 00:00 end-time bug)', () => {
  // ─── Single-hour midnight booking: 23:00–00:00 ───────────────────────────

  it('marks 23:00 slot as Booked when a 23:00–00:00 booking exists (THE CRITICAL BUG)', () => {
    const bookings: Booking[] = [makeBooking({ startTime: '23:00', endTime: '00:00' })];
    expect(isSlotBookedByBooking('court-1', '2099-06-15', '23:00', '00:00', bookings)).toBe(true);
  });

  it('does NOT mark 22:00 slot as Booked for a 23:00–00:00 booking', () => {
    const bookings: Booking[] = [makeBooking({ startTime: '23:00', endTime: '00:00' })];
    expect(isSlotBookedByBooking('court-1', '2099-06-15', '22:00', '23:00', bookings)).toBe(false);
  });

  // ─── Two-hour midnight booking: 22:00–00:00 ──────────────────────────────

  it('marks 22:00 slot as Booked when a 22:00–00:00 booking exists', () => {
    const bookings: Booking[] = [makeBooking({ startTime: '22:00', endTime: '00:00' })];
    expect(isSlotBookedByBooking('court-1', '2099-06-15', '22:00', '23:00', bookings)).toBe(true);
  });

  it('marks 23:00 slot as Booked when a 22:00–00:00 booking exists', () => {
    const bookings: Booking[] = [makeBooking({ startTime: '22:00', endTime: '00:00' })];
    expect(isSlotBookedByBooking('court-1', '2099-06-15', '23:00', '00:00', bookings)).toBe(true);
  });

  it('does NOT mark 21:00 slot as Booked for a 22:00–00:00 booking', () => {
    const bookings: Booking[] = [makeBooking({ startTime: '22:00', endTime: '00:00' })];
    expect(isSlotBookedByBooking('court-1', '2099-06-15', '21:00', '22:00', bookings)).toBe(false);
  });

  // ─── Reserved status also blocked ────────────────────────────────────────

  it('marks 23:00 slot as Booked for a Reserved 23:00–00:00 hold', () => {
    const bookings: Booking[] = [makeBooking({ startTime: '23:00', endTime: '00:00', status: 'Reserved' })];
    expect(isSlotBookedByBooking('court-1', '2099-06-15', '23:00', '00:00', bookings)).toBe(true);
  });

  // ─── Court & date isolation unaffected ────────────────────────────────────

  it('does NOT affect a different court', () => {
    const bookings: Booking[] = [makeBooking({ startTime: '23:00', endTime: '00:00', courtId: 'court-1' })];
    expect(isSlotBookedByBooking('court-2', '2099-06-15', '23:00', '00:00', bookings)).toBe(false);
  });

  it('does NOT affect a different date', () => {
    const bookings: Booking[] = [makeBooking({ startTime: '23:00', endTime: '00:00', date: '2099-06-15' })];
    expect(isSlotBookedByBooking('court-1', '2099-06-16', '23:00', '00:00', bookings)).toBe(false);
  });

  // ─── Normal daytime bookings still work ───────────────────────────────────

  it('still correctly detects normal 10:00–11:00 bookings', () => {
    const bookings: Booking[] = [makeBooking({ startTime: '10:00', endTime: '11:00', date: '2099-06-15' })];
    expect(isSlotBookedByBooking('court-1', '2099-06-15', '10:00', '11:00', bookings)).toBe(true);
    expect(isSlotBookedByBooking('court-1', '2099-06-15', '11:00', '12:00', bookings)).toBe(false);
  });

  // ─── Back-to-back bookings at midnight boundary ───────────────────────────

  it('allows back-to-back booking starting exactly at midnight (00:00–01:00) after a 23:00–00:00 booking', () => {
    const bookings: Booking[] = [makeBooking({ startTime: '23:00', endTime: '00:00', date: '2099-06-15' })];
    // A 00:00–01:00 slot on the NEXT session date — not the same session date, so no conflict
    expect(isSlotBookedByBooking('court-1', '2099-06-15', '00:00', '01:00', bookings)).toBe(false);
  });
});

describe('generateAvailabilitySlots — midnight boundary (regression for 00:00 end-time bug)', () => {
  const court: Court = {
    id: 'court-mid',
    name: 'Midnight Court',
    image: '',
    sportType: 'Padel',
    surface: 'Artificial Turf',
    isIndoor: false,
    capacity: 4,
    pricePerHour: 150,
    rating: 5,
    reviewCount: 1,
    gallery: [],
    description: '',
    features: [],
    rules: [],
    status: 'Available',
    workingHours: { open: '07:00', close: '00:00' }, // courts that close at midnight
    slotDurationMinutes: 60,
  };

  it('renders the 23:00 slot as Booked when a 23:00–00:00 Confirmed booking exists', () => {
    const bookings: Booking[] = [
      makeBooking({
        courtId: 'court-mid',
        date: '2099-07-20',
        startTime: '23:00',
        endTime: '00:00',
        status: 'Confirmed',
      }),
    ];
    const slots = generateAvailabilitySlots(court, '2099-07-20', bookings, []);
    const slot23 = slots.find((s) => s.startTime === '23:00');
    expect(slot23).toBeDefined();
    expect(slot23?.status).toBe('Booked');
  });

  it('renders the 23:00 slot as Reserved when a 23:00–00:00 Reserved hold exists', () => {
    const bookings: Booking[] = [
      makeBooking({
        courtId: 'court-mid',
        date: '2099-07-20',
        startTime: '23:00',
        endTime: '00:00',
        status: 'Reserved',
      }),
    ];
    const slots = generateAvailabilitySlots(court, '2099-07-20', bookings, []);
    const slot23 = slots.find((s) => s.startTime === '23:00');
    expect(slot23?.status).toBe('Reserved');
  });

  it('renders the 22:00 slot as Available when only a 23:00–00:00 booking exists', () => {
    const bookings: Booking[] = [
      makeBooking({
        courtId: 'court-mid',
        date: '2099-07-20',
        startTime: '23:00',
        endTime: '00:00',
        status: 'Confirmed',
      }),
    ];
    const slots = generateAvailabilitySlots(court, '2099-07-20', bookings, []);
    const slot22 = slots.find((s) => s.startTime === '22:00');
    expect(slot22?.status).toBe('Available');
  });
});

describe('Hold Expiration & getSlotBookingStatus business logic', () => {
  const court: Court = {
    id: 'court-hold',
    name: 'Hold Court',
    image: '',
    sportType: 'Padel',
    surface: 'Turf',
    isIndoor: false,
    capacity: 4,
    pricePerHour: 100,
    rating: 5,
    reviewCount: 0,
    gallery: [],
    description: '',
    features: [],
    rules: [],
    status: 'Available',
    workingHours: { open: '08:00', close: '22:00' },
    slotDurationMinutes: 60,
  };

  it('releases slot when a Reserved hold is older than 10 minutes (expired hold)', () => {
    const now = Date.now();
    const staleCreatedAt = new Date(now - 11 * 60 * 1000).toISOString(); // 11 mins ago
    const bookings: Booking[] = [
      makeBooking({
        courtId: 'court-hold',
        date: '2099-08-01',
        startTime: '10:00',
        endTime: '11:00',
        status: 'Reserved',
        createdAt: staleCreatedAt,
      }),
    ];

    expect(isHoldActive(bookings[0], now)).toBe(false);
    expect(getSlotBookingStatus('court-hold', '2099-08-01', '10:00', '11:00', bookings, now)).toBe(null);
    expect(isSlotBookedByBooking('court-hold', '2099-08-01', '10:00', '11:00', bookings, now)).toBe(false);

    const slots = generateAvailabilitySlots(court, '2099-08-01', bookings, []);
    const slot = slots.find((s) => s.startTime === '10:00');
    expect(slot?.status).toBe('Available');
  });

  it('keeps slot as Reserved when a hold was created 5 minutes ago', () => {
    const now = Date.now();
    const freshCreatedAt = new Date(now - 5 * 60 * 1000).toISOString(); // 5 mins ago
    const bookings: Booking[] = [
      makeBooking({
        courtId: 'court-hold',
        date: '2099-08-01',
        startTime: '10:00',
        endTime: '11:00',
        status: 'Reserved',
        createdAt: freshCreatedAt,
      }),
    ];

    expect(isHoldActive(bookings[0], now)).toBe(true);
    expect(getSlotBookingStatus('court-hold', '2099-08-01', '10:00', '11:00', bookings, now)).toBe('Reserved');
    expect(isSlotBookedByBooking('court-hold', '2099-08-01', '10:00', '11:00', bookings, now)).toBe(true);

    const slots = generateAvailabilitySlots(court, '2099-08-01', bookings, []);
    const slot = slots.find((s) => s.startTime === '10:00');
    expect(slot?.status).toBe('Reserved');
  });

  it('treats Cancelled and Expired bookings as Available', () => {
    const bookings: Booking[] = [
      makeBooking({
        courtId: 'court-hold',
        date: '2099-08-01',
        startTime: '10:00',
        endTime: '11:00',
        status: 'Cancelled',
      }),
      makeBooking({
        courtId: 'court-hold',
        date: '2099-08-01',
        startTime: '11:00',
        endTime: '12:00',
        status: 'Expired',
      }),
    ];

    expect(getSlotBookingStatus('court-hold', '2099-08-01', '10:00', '11:00', bookings)).toBe(null);
    expect(getSlotBookingStatus('court-hold', '2099-08-01', '11:00', '12:00', bookings)).toBe(null);

    const slots = generateAvailabilitySlots(court, '2099-08-01', bookings, []);
    expect(slots.find((s) => s.startTime === '10:00')?.status).toBe('Available');
    expect(slots.find((s) => s.startTime === '11:00')?.status).toBe('Available');
  });

  it('correctly attributes ownership: isOwn true for user who created hold, false for other user', () => {
    const userA = 'user-a-123';
    const userB = 'user-b-456';
    const bookings: Booking[] = [
      makeBooking({
        courtId: 'court-hold',
        date: '2099-08-01',
        startTime: '14:00',
        endTime: '15:00',
        status: 'Reserved',
        userId: userA,
      }),
      makeBooking({
        courtId: 'court-hold',
        date: '2099-08-01',
        startTime: '16:00',
        endTime: '17:00',
        status: 'Confirmed',
        userId: userA,
      }),
    ];

    // Details check
    const holdDetailsA = getSlotBookingDetails('court-hold', '2099-08-01', '14:00', '15:00', bookings, userA);
    const holdDetailsB = getSlotBookingDetails('court-hold', '2099-08-01', '14:00', '15:00', bookings, userB);
    expect(holdDetailsA).toEqual({ status: 'Reserved', isOwn: true, bookingId: 'b-mid' });
    expect(holdDetailsB).toEqual({ status: 'Reserved', isOwn: false, bookingId: 'b-mid' });

    // Grid slots for User A
    const slotsA = generateAvailabilitySlots(court, '2099-08-01', bookings, [], userA);
    const slot14A = slotsA.find((s) => s.startTime === '14:00');
    const slot16A = slotsA.find((s) => s.startTime === '16:00');
    expect(slot14A?.status).toBe('Reserved');
    expect(slot14A?.isOwn).toBe(true);
    expect(slot16A?.status).toBe('Booked');
    expect(slot16A?.isOwn).toBe(true);

    // Grid slots for User B
    const slotsB = generateAvailabilitySlots(court, '2099-08-01', bookings, [], userB);
    const slot14B = slotsB.find((s) => s.startTime === '14:00');
    const slot16B = slotsB.find((s) => s.startTime === '16:00');
    expect(slot14B?.status).toBe('Reserved');
    expect(slot14B?.isOwn).toBe(false);
    expect(slot16B?.status).toBe('Booked');
    expect(slot16B?.isOwn).toBe(false);
  });

  it('correctly handles partial overlaps without blocking adjacent slots', () => {
    // Booking spans 10:30 to 12:30 (e.g. 2 hours starting on half-hour)
    const bookings: Booking[] = [
      makeBooking({
        courtId: 'court-hold',
        date: '2099-08-01',
        startTime: '10:30',
        endTime: '12:30',
        status: 'Confirmed',
      }),
    ];

    // Slots: 09:00-10:00 (free), 10:00-11:00 (overlaps 10:30-11:00 -> blocked),
    // 11:00-12:00 (overlaps -> blocked), 12:00-13:00 (overlaps 12:00-12:30 -> blocked),
    // 13:00-14:00 (free)
    expect(isSlotBookedByBooking('court-hold', '2099-08-01', '09:00', '10:00', bookings)).toBe(false);
    expect(isSlotBookedByBooking('court-hold', '2099-08-01', '10:00', '11:00', bookings)).toBe(true);
    expect(isSlotBookedByBooking('court-hold', '2099-08-01', '11:00', '12:00', bookings)).toBe(true);
    expect(isSlotBookedByBooking('court-hold', '2099-08-01', '12:00', '13:00', bookings)).toBe(true);
    expect(isSlotBookedByBooking('court-hold', '2099-08-01', '13:00', '14:00', bookings)).toBe(false);
  });
});
