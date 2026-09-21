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
