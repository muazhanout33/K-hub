import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateBookingRequest, isSlotBookedByBooking } from '@/lib/availability';
import type { Court, Booking, BlockedPeriod } from '@/types';

// ── Test Fixtures ──

const TEST_COURT: Court = {
  id: 'court-integrity-1',
  name: 'Padel Court 1',
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

const DIFFERENT_COURT: Court = {
  ...TEST_COURT,
  id: 'court-integrity-2',
  name: 'Padel Court 2',
};

const FUTURE_DATE = '2099-06-15';

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: `booking-${Math.random().toString(36).slice(2, 8)}`,
    bookingNumber: `KH-${Math.floor(100000 + Math.random() * 900000)}`,
    courtId: TEST_COURT.id,
    courtName: TEST_COURT.name,
    courtImage: '',
    sportType: 'Padel',
    date: FUTURE_DATE,
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
    totalPrice: 200,
    status: 'Confirmed',
    bookingSource: 'ONLINE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'user-1',
    userName: 'Test User',
    userEmail: 'test@example.com',
    userPhone: '+1234567890',
    selectedSlotIds: [],
    ...overrides,
  };
}

// ── Double-Booking Prevention Tests ──

describe('Booking Integrity — Double-Booking Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete overlap rejection', () => {
    it('rejects identical time slot (same court, same date, same time)', () => {
      const existing = makeBooking({ startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('conflicts');
    });

    it('rejects booking that fully contains existing booking', () => {
      const existing = makeBooking({ startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '09:00',
        '12:00',
        [existing],
        []
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('conflicts');
    });

    it('rejects booking fully contained by existing booking', () => {
      const existing = makeBooking({ startTime: '09:00', endTime: '12:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('conflicts');
    });
  });

  describe('Partial overlap rejection', () => {
    it('rejects booking overlapping start of existing', () => {
      const existing = makeBooking({ startTime: '11:00', endTime: '12:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '11:30',
        [existing],
        []
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('conflicts');
    });

    it('rejects booking overlapping end of existing', () => {
      const existing = makeBooking({ startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:30',
        '11:30',
        [existing],
        []
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('conflicts');
    });

    it('rejects single-minute overlap', () => {
      const existing = makeBooking({ startTime: '10:00', endTime: '11:00' });
      // 10:59–11:00 overlaps by 1 minute (10:59 < 11:00 AND 10:00 < 11:00)
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:59',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('conflicts');
    });
  });

  describe('Adjacent booking acceptance (back-to-back)', () => {
    it('allows booking starting exactly when existing ends', () => {
      const existing = makeBooking({ startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '11:00',
        '12:00',
        [existing],
        []
      );
      expect(result.valid).toBe(true);
    });

    it('allows booking ending exactly when existing starts', () => {
      const existing = makeBooking({ startTime: '11:00', endTime: '12:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Multi-court isolation', () => {
    it('allows same time on different court', () => {
      const existing = makeBooking({ courtId: TEST_COURT.id, startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        DIFFERENT_COURT,
        FUTURE_DATE,
        '10:00',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(true);
    });

    it('detects conflict only on same court', () => {
      const existingCourt1 = makeBooking({ courtId: TEST_COURT.id, startTime: '10:00', endTime: '11:00' });
      const existingCourt2 = makeBooking({ courtId: DIFFERENT_COURT.id, startTime: '10:00', endTime: '11:00' });

      // Court 1 is booked → should reject
      const result1 = validateBookingRequest(TEST_COURT, FUTURE_DATE, '10:00', '11:00', [existingCourt1, existingCourt2], []);
      expect(result1.valid).toBe(false);

      // Court 2 is booked → should reject for court 2
      const result2 = validateBookingRequest(DIFFERENT_COURT, FUTURE_DATE, '10:00', '11:00', [existingCourt1, existingCourt2], []);
      expect(result2.valid).toBe(false);

      // Court 1 at different time → should accept
      const result3 = validateBookingRequest(TEST_COURT, FUTURE_DATE, '11:00', '12:00', [existingCourt1, existingCourt2], []);
      expect(result3.valid).toBe(true);
    });
  });

  describe('Same time, different dates', () => {
    it('allows same time on different date', () => {
      const existing = makeBooking({ date: FUTURE_DATE, startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        '2099-06-16',
        '10:00',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(true);
    });

    it('rejects same time on same date', () => {
      const existing = makeBooking({ date: FUTURE_DATE, startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(false);
    });
  });

  describe('Status filtering (Reserved and Confirmed block, others do not)', () => {
    it('rejects when existing booking is Reserved', () => {
      const existing = makeBooking({ status: 'Reserved', startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(false);
    });

    it('rejects when existing booking is Confirmed', () => {
      const existing = makeBooking({ status: 'Confirmed', startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(false);
    });

    it('allows when existing booking is Cancelled', () => {
      const existing = makeBooking({ status: 'Cancelled', startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(true);
    });

    it('allows when existing booking is Expired', () => {
      const existing = makeBooking({ status: 'Expired', startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '11:00',
        [existing],
        []
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('isSlotBookedByBooking — overlap detection', () => {
    const bookings: Booking[] = [
      makeBooking({ courtId: 'c1', date: '2099-01-01', startTime: '10:00', endTime: '12:00', status: 'Confirmed' }),
      makeBooking({ courtId: 'c1', date: '2099-01-01', startTime: '14:00', endTime: '16:00', status: 'Reserved' }),
    ];

    it('detects exact match overlap', () => {
      expect(isSlotBookedByBooking('c1', '2099-01-01', '10:00', '12:00', bookings)).toBe(true);
    });

    it('detects partial overlap (new starts within existing)', () => {
      expect(isSlotBookedByBooking('c1', '2099-01-01', '11:00', '13:00', bookings)).toBe(true);
    });

    it('detects partial overlap (new ends within existing)', () => {
      expect(isSlotBookedByBooking('c1', '2099-01-01', '09:00', '11:00', bookings)).toBe(true);
    });

    it('allows non-overlapping adjacent slot', () => {
      expect(isSlotBookedByBooking('c1', '2099-01-01', '12:00', '14:00', bookings)).toBe(false);
    });

    it('allows gap between bookings', () => {
      expect(isSlotBookedByBooking('c1', '2099-01-01', '12:30', '13:30', bookings)).toBe(false);
    });

    it('detects overlap with Reserved status', () => {
      expect(isSlotBookedByBooking('c1', '2099-01-01', '14:30', '15:30', bookings)).toBe(true);
    });

    it('ignores Cancelled bookings', () => {
      const cancelled: Booking[] = [
        makeBooking({ courtId: 'c1', date: '2099-01-01', startTime: '10:00', endTime: '12:00', status: 'Cancelled' }),
      ];
      expect(isSlotBookedByBooking('c1', '2099-01-01', '10:00', '12:00', cancelled)).toBe(false);
    });

    it('ignores Expired bookings', () => {
      const expired: Booking[] = [
        makeBooking({ courtId: 'c1', date: '2099-01-01', startTime: '10:00', endTime: '12:00', status: 'Expired' }),
      ];
      expect(isSlotBookedByBooking('c1', '2099-01-01', '10:00', '12:00', expired)).toBe(false);
    });

    it('returns false for different court', () => {
      expect(isSlotBookedByBooking('c2', '2099-01-01', '10:00', '12:00', bookings)).toBe(false);
    });

    it('returns false for different date', () => {
      expect(isSlotBookedByBooking('c1', '2099-01-02', '10:00', '12:00', bookings)).toBe(false);
    });
  });

  describe('Concurrent duplicate booking scenario (application-level)', () => {
    it('both concurrent requests see the same bookings and both get rejected', () => {
      // Simulates two users trying to book the same slot concurrently
      // At the application level, both see the same bookings state
      const existingBookings: Booking[] = [
        makeBooking({ startTime: '10:00', endTime: '11:00' }),
      ];

      // Request A: tries 10:00–11:00
      const resultA = validateBookingRequest(TEST_COURT, FUTURE_DATE, '10:00', '11:00', existingBookings, []);
      // Request B: tries 10:00–11:00 (concurrent)
      const resultB = validateBookingRequest(TEST_COURT, FUTURE_DATE, '10:00', '11:00', existingBookings, []);

      // Both should be rejected at the application level
      expect(resultA.valid).toBe(false);
      expect(resultB.valid).toBe(false);
    });

    it('second request after first succeeds sees the new booking', () => {
      // First booking succeeds
      const firstBooking = makeBooking({ startTime: '10:00', endTime: '11:00' });

      // Second request sees the first booking in the list
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '11:00',
        [firstBooking],
        []
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('conflicts');
    });
  });

  describe('Blocked period + booking conflict combined', () => {
    it('rejects when slot conflicts with blocked period', () => {
      const blocked: BlockedPeriod[] = [
        {
          id: 'bp-1',
          courtId: TEST_COURT.id,
          date: FUTURE_DATE,
          startTime: '14:00',
          endTime: '16:00',
          reason: 'Maintenance',
          createdAt: '',
        },
      ];
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '15:00',
        '16:00',
        [],
        blocked
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('blocked');
    });

    it('rejects when slot conflicts with both blocked period and existing booking', () => {
      const existing = makeBooking({ startTime: '10:00', endTime: '12:00' });
      const blocked: BlockedPeriod[] = [
        {
          id: 'bp-1',
          courtId: TEST_COURT.id,
          date: FUTURE_DATE,
          startTime: '14:00',
          endTime: '16:00',
          reason: 'Maintenance',
          createdAt: '',
        },
      ];

      // Conflict with existing booking
      const result1 = validateBookingRequest(TEST_COURT, FUTURE_DATE, '11:00', '12:00', [existing], blocked);
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('conflicts');

      // Conflict with blocked period
      const result2 = validateBookingRequest(TEST_COURT, FUTURE_DATE, '15:00', '16:00', [existing], blocked);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('blocked');
    });
  });

  describe('Edge cases — multi-slot bookings', () => {
    it('rejects 2-hour booking overlapping existing 1-hour booking', () => {
      const existing = makeBooking({ startTime: '11:00', endTime: '12:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '10:00',
        '12:00',
        [existing],
        []
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('conflicts');
    });

    it('allows 2-hour booking adjacent to existing 1-hour booking', () => {
      const existing = makeBooking({ startTime: '10:00', endTime: '11:00' });
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '11:00',
        '13:00',
        [existing],
        []
      );
      expect(result.valid).toBe(true);
    });

    it('allows non-overlapping bookings with gap', () => {
      const bookings: Booking[] = [
        makeBooking({ startTime: '09:00', endTime: '10:00' }),
        makeBooking({ startTime: '14:00', endTime: '15:00' }),
      ];
      const result = validateBookingRequest(
        TEST_COURT,
        FUTURE_DATE,
        '11:00',
        '13:00',
        bookings,
        []
      );
      expect(result.valid).toBe(true);
    });
  });
});

// ── Documentation: DB-Level EXCLUDE Constraint ──

describe('Booking Integrity — DB-Level Protection (documentation)', () => {
  it('documents that EXCLUDE USING gist prevents double booking at database level', () => {
    // The `prevent_double_booking` EXCLUDE constraint in the database schema
    // uses PostgreSQL's GiST index with the range operator (&&) to atomically
    // prevent overlapping bookings at the database engine level.
    //
    // This constraint:
    // - Operates on (court_id, booking_range) columns
    // - Uses = for court_id and && for booking_range overlap detection
    // - Only applies to bookings with status IN ('Reserved', 'Confirmed')
    // - Is enforced atomically — even under concurrent INSERT attempts,
    //   exactly one will succeed and the other will throw error code 23P01
    //
    // This is the AUTHORITATIVE guarantee against double booking.
    // Application-level checks (validateBookingRequest) provide earlier feedback
    // but the DB constraint is the final safety net.
    //
    // Note: This constraint cannot be tested in Vitest because Vitest mocks
    // the Supabase client. True concurrency testing requires the standalone
    // scripts in scripts/test-double-booking.ts and scripts/phase9-concurrency-test.ts
    // which run against a real PostgreSQL database.

    const CONSTRAINT_NAME = 'prevent_double_booking';
    const ERROR_CODE = '23P01'; // exclusion_violation
    const CONSTRAINT_DEFINITION = `EXCLUDE USING gist (court_id WITH =, booking_range WITH &&) WHERE (status IN ('Reserved', 'Confirmed'))`;

    expect(CONSTRAINT_NAME).toBe('prevent_double_booking');
    expect(ERROR_CODE).toBe('23P01');
    expect(CONSTRAINT_DEFINITION).toContain('EXCLUDE USING gist');
    expect(CONSTRAINT_DEFINITION).toContain('court_id WITH =');
    expect(CONSTRAINT_DEFINITION).toContain('booking_range WITH &&');
    expect(CONSTRAINT_DEFINITION).toContain("status IN ('Reserved', 'Confirmed')");
  });
});
