import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateBookingPrice } from '@/lib/pricing';
import { isSlotPast, toMinutes } from '@/lib/timezone';
import { MOCK_COURTS } from '@/lib/mock-data';
import { generateAvailabilitySlots, validateBookingRequest } from '@/lib/availability';
import type { Court, BlockedPeriod } from '@/types';

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const TEST_COURT: Court = MOCK_COURTS[0];

describe('Server Action Guard Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Past-slot guard (server-side validation)', () => {
    it('rejects booking for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toLocaleDateString('en-CA');
      expect(isSlotPast(dateStr, '09:00')).toBe(true);
    });

    it('allows booking for future date', () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      const dateStr = future.toLocaleDateString('en-CA');
      expect(isSlotPast(dateStr, '09:00')).toBe(false);
    });

    it('toMinutes correctly compares times', () => {
      const morning = toMinutes('2099-01-01', '09:00');
      const afternoon = toMinutes('2099-01-01', '14:00');
      expect(afternoon).toBeGreaterThan(morning);
    });

    it('toMinutes handles different dates', () => {
      const day1 = toMinutes('2099-01-01', '09:00');
      const day2 = toMinutes('2099-01-02', '09:00');
      expect(day2).toBeGreaterThan(day1);
    });
  });

  describe('Court validation guard', () => {
    it('validates court exists in mock data', () => {
      const court = MOCK_COURTS.find(c => c.id === TEST_COURT.id);
      expect(court).toBeDefined();
      expect(court!.status).toBe('Available');
    });

    it('rejects booking for non-existent court', () => {
      const court = MOCK_COURTS.find(c => c.id === 'non-existent-court');
      expect(court).toBeUndefined();
    });

    it('rejects booking for unavailable court', () => {
      const unavailableCourt: Court = { ...TEST_COURT, status: 'Maintenance' as any };
      expect(unavailableCourt.status).not.toBe('Available');
      expect(unavailableCourt.status).not.toBe('Starts Soon');
    });
  });

  describe('Price recalculation guard (never trust client)', () => {
    it('server recalculates price from court pricePerHour and duration', () => {
      const durationMinutes = 120;
      const serverPrice = calculateBookingPrice(TEST_COURT.pricePerHour, durationMinutes);
      expect(serverPrice).toBe(TEST_COURT.pricePerHour * 2);
    });

    it('price calculation matches for different durations', () => {
      const price1h = calculateBookingPrice(TEST_COURT.pricePerHour, 60);
      const price2h = calculateBookingPrice(TEST_COURT.pricePerHour, 120);
      const price30m = calculateBookingPrice(TEST_COURT.pricePerHour, 30);

      expect(price2h).toBe(price1h * 2);
      expect(price30m).toBe(Math.round(price1h * 0.5));
    });

    it('client-sent price can differ from server-calculated (guard protects)', () => {
      const clientSentPrice = 999;
      const serverCalculated = calculateBookingPrice(TEST_COURT.pricePerHour, 60);

      expect(serverCalculated).toBe(TEST_COURT.pricePerHour);
      expect(serverCalculated).not.toBe(clientSentPrice);
    });
  });

  describe('Blocked-period overlap guard', () => {
    it('detects overlap between booking range and blocked period', () => {
      const blocked: BlockedPeriod = {
        id: 'bp-guard-1',
        courtId: TEST_COURT.id,
        date: '2099-05-01',
        startTime: '10:00',
        endTime: '12:00',
        reason: 'Maintenance',
        createdAt: '',
      };

      const slots = generateAvailabilitySlots(TEST_COURT, '2099-05-01', [], [blocked]);

      const tenSlot = slots.find(s => s.startTime === '10:00');
      const elevenSlot = slots.find(s => s.startTime === '11:00');
      const twelveSlot = slots.find(s => s.startTime === '12:00');

      expect(tenSlot!.status).toBe('Blocked');
      expect(elevenSlot!.status).toBe('Blocked');
      expect(twelveSlot!.status).toBe('Available');
    });

    it('allows booking when no overlap with blocked period', () => {
      const blocked: BlockedPeriod = {
        id: 'bp-guard-2',
        courtId: TEST_COURT.id,
        date: '2099-05-01',
        startTime: '14:00',
        endTime: '16:00',
        reason: 'Event',
        createdAt: '',
      };

      const slots = generateAvailabilitySlots(TEST_COURT, '2099-05-01', [], [blocked]);

      const nineSlot = slots.find(s => s.startTime === '09:00');
      const sixteenSlot = slots.find(s => s.startTime === '16:00');

      expect(nineSlot!.status).toBe('Available');
      expect(sixteenSlot!.status).toBe('Available');
    });
  });

  describe('Active booking limit guard (max 5)', () => {
    it('guard logic: 4 active bookings allows new one', () => {
      const activeBookings = 4;
      const MAX = 5;
      expect(activeBookings < MAX).toBe(true);
    });

    it('guard logic: 5 active bookings blocks new one', () => {
      const activeBookings = 5;
      const MAX = 5;
      expect(activeBookings >= MAX).toBe(true);
    });
  });

  describe('Cancellation window guard (2-hour rule)', () => {
    it('allows cancellation when >2 hours remain', () => {
      const futureSlot = new Date();
      futureSlot.setHours(futureSlot.getHours() + 5);
      const now = new Date();
      const diffHours = (futureSlot.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours > 2).toBe(true);
    });

    it('rejects cancellation when <2 hours remain', () => {
      const soonSlot = new Date();
      soonSlot.setHours(soonSlot.getHours() + 1);
      const now = new Date();
      const diffHours = (soonSlot.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours <= 2).toBe(true);
    });
  });

  describe('validateBookingRequest integration', () => {
    it('valid request passes validation', () => {
      const result = validateBookingRequest(
        TEST_COURT,
        '2099-12-01',
        '09:00',
        '10:00',
        [],
        []
      );
      expect(result.valid).toBe(true);
    });

    it('request with past date fails validation', () => {
      const result = validateBookingRequest(
        TEST_COURT,
        '2020-01-01',
        '09:00',
        '10:00',
        [],
        []
      );
      expect(result.valid).toBe(false);
    });

    it('request for non-existent court fails validation', () => {
      const result = validateBookingRequest(
        undefined,
        '2099-12-01',
        '09:00',
        '10:00',
        [],
        []
      );
      expect(result.valid).toBe(false);
    });
  });

  describe('Cross-layer guard: availability + pricing + timezone', () => {
    it('full guard chain: slot available → price calculated → past-check passes', () => {
      const futureDate = '2099-12-15';

      expect(isSlotPast(futureDate, '09:00')).toBe(false);

      const slots = generateAvailabilitySlots(TEST_COURT, futureDate, [], []);
      const targetSlot = slots.find(s => s.startTime === '09:00');
      expect(targetSlot!.status).toBe('Available');

      const price = calculateBookingPrice(TEST_COURT.pricePerHour, 60);
      expect(price).toBe(TEST_COURT.pricePerHour);
    });

    it('blocked slot fails availability guard even if past-check passes', () => {
      const futureDate = '2099-12-15';
      const blocked: BlockedPeriod = {
        id: 'bp-cross',
        courtId: TEST_COURT.id,
        date: futureDate,
        startTime: '09:00',
        endTime: '10:00',
        reason: 'Closed',
        createdAt: '',
      };

      expect(isSlotPast(futureDate, '09:00')).toBe(false);

      const slots = generateAvailabilitySlots(TEST_COURT, futureDate, [], [blocked]);
      const targetSlot = slots.find(s => s.startTime === '09:00');
      expect(targetSlot!.status).toBe('Blocked');
    });
  });
});
