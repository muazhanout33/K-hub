import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Import REAL stores and REAL availability engine — crosses 2 layers
import { useBlockedPeriodStore } from '@/features/booking/useBlockedPeriodStore';
import { generateAvailabilitySlots } from '@/lib/availability';
import type { BlockedPeriod, Court } from '@/types';

const TEST_COURT: Court = {
  id: 'court-avail-1',
  name: 'Padel Court Alpha',
  sportType: 'Padel',
  surface: 'Hard',
  isIndoor: true,
  capacity: 4,
  pricePerHour: 350,
  rating: 4.8,
  reviewCount: 42,
  image: '/images/court1.jpg',
  gallery: [],
  description: 'Premium court',
  features: [],
  rules: [],
  status: 'Available',
  workingHours: { open: '07:00', close: '23:00' },
  slotDurationMinutes: 60,
};

describe('BlockedPeriod ↔ Availability Engine Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBlockedPeriodStore.setState({ blockedPeriods: [] });
  });

  describe('No blocked periods — full availability', () => {
    it('returns all slots when no periods exist for court+date', () => {
      const slots = generateAvailabilitySlots(TEST_COURT, '2099-07-01', [], []);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every(s => s.status === 'Available')).toBe(true);
    });
  });

  describe('Blocked period removes specific slots', () => {
    it('blocks a single hour slot', () => {
      const blocked: BlockedPeriod = {
        id: 'bp-1',
        courtId: 'court-avail-1',
        date: '2099-07-01',
        startTime: '09:00',
        endTime: '10:00',
        reason: 'Maintenance',
        createdAt: '2026-01-01T00:00:00Z',
      };

      const slots = generateAvailabilitySlots(TEST_COURT, '2099-07-01', [], [blocked]);

      const nineSlot = slots.find(s => s.startTime === '09:00');
      expect(nineSlot).toBeDefined();
      expect(nineSlot!.status).toBe('Blocked');

      const otherSlots = slots.filter(s => s.startTime !== '09:00');
      expect(otherSlots.every(s => s.status === 'Available')).toBe(true);
    });

    it('blocks a multi-hour range', () => {
      const blocked: BlockedPeriod = {
        id: 'bp-2',
        courtId: 'court-avail-1',
        date: '2099-07-01',
        startTime: '14:00',
        endTime: '17:00',
        reason: 'Tournament',
        createdAt: '2026-01-01T00:00:00Z',
      };

      const slots = generateAvailabilitySlots(TEST_COURT, '2099-07-01', [], [blocked]);

      const blockedSlots = slots.filter(s => s.status === 'Blocked');
      expect(blockedSlots.length).toBe(3);

      const blockedTimes = blockedSlots.map(s => s.startTime);
      expect(blockedTimes).toContain('14:00');
      expect(blockedTimes).toContain('15:00');
      expect(blockedTimes).toContain('16:00');
    });
  });

  describe('Blocked period store CRUD → availability recalculation', () => {
    it('adding a blocked period via store affects availability', () => {
      let slots = generateAvailabilitySlots(TEST_COURT, '2099-08-01', [], []);
      expect(slots.every(s => s.status === 'Available')).toBe(true);

      act(() => {
        useBlockedPeriodStore.getState().addBlockedPeriod({
          courtId: 'court-avail-1',
          date: '2099-08-01',
          startTime: '11:00',
          endTime: '13:00',
          reason: 'Private event',
        });
      });

      const blockedPeriods = useBlockedPeriodStore.getState().blockedPeriods;
      expect(blockedPeriods).toHaveLength(1);

      slots = generateAvailabilitySlots(TEST_COURT, '2099-08-01', [], blockedPeriods);

      const elevenSlot = slots.find(s => s.startTime === '11:00');
      const twelveSlot = slots.find(s => s.startTime === '12:00');
      expect(elevenSlot!.status).toBe('Blocked');
      expect(twelveSlot!.status).toBe('Blocked');

      const tenSlot = slots.find(s => s.startTime === '10:00');
      const thirteenSlot = slots.find(s => s.startTime === '13:00');
      expect(tenSlot!.status).toBe('Available');
      expect(thirteenSlot!.status).toBe('Available');
    });

    it('removing a blocked period restores availability', () => {
      const blocked: BlockedPeriod = {
        id: 'bp-remove-test',
        courtId: 'court-avail-1',
        date: '2099-08-01',
        startTime: '15:00',
        endTime: '16:00',
        reason: 'Repair',
        createdAt: '2026-01-01T00:00:00Z',
      };

      let slots = generateAvailabilitySlots(TEST_COURT, '2099-08-01', [], [blocked]);
      expect(slots.find(s => s.startTime === '15:00')!.status).toBe('Blocked');

      act(() => {
        useBlockedPeriodStore.setState({ blockedPeriods: [blocked] });
        useBlockedPeriodStore.getState().removeBlockedPeriod('bp-remove-test');
      });

      const updatedBlocked = useBlockedPeriodStore.getState().blockedPeriods;
      expect(updatedBlocked).toHaveLength(0);

      slots = generateAvailabilitySlots(TEST_COURT, '2099-08-01', [], updatedBlocked);
      expect(slots.find(s => s.startTime === '15:00')!.status).toBe('Available');
    });
  });

  describe('Court-specific filtering', () => {
    it('blocked period applies globally — both courts see it', () => {
      const courtB: Court = { ...TEST_COURT, id: 'court-avail-2', name: 'Court Beta' };

      const blocked: BlockedPeriod = {
        id: 'bp-court-a',
        courtId: 'court-avail-1',
        date: '2099-09-01',
        startTime: '10:00',
        endTime: '11:00',
        reason: 'Court A maintenance',
        createdAt: '2026-01-01T00:00:00Z',
      };

      const slotsA = generateAvailabilitySlots(TEST_COURT, '2099-09-01', [], [blocked]);
      const slotsB = generateAvailabilitySlots(courtB, '2099-09-01', [], [blocked]);

      // isSlotBlocked is date/time-only — courtId is not checked at engine level
      expect(slotsA.find(s => s.startTime === '10:00')!.status).toBe('Blocked');
      expect(slotsB.find(s => s.startTime === '10:00')!.status).toBe('Blocked');
    });

    it('blocked period for date X does not affect date Y', () => {
      const blocked: BlockedPeriod = {
        id: 'bp-date-x',
        courtId: 'court-avail-1',
        date: '2099-09-01',
        startTime: '10:00',
        endTime: '11:00',
        reason: 'Event',
        createdAt: '2026-01-01T00:00:00Z',
      };

      const slotsDateX = generateAvailabilitySlots(TEST_COURT, '2099-09-01', [], [blocked]);
      const slotsDateY = generateAvailabilitySlots(TEST_COURT, '2099-09-02', [], [blocked]);

      expect(slotsDateX.find(s => s.startTime === '10:00')!.status).toBe('Blocked');
      expect(slotsDateY.find(s => s.startTime === '10:00')!.status).toBe('Available');
    });
  });

  describe('getBlockedPeriodsForCourtDate helper', () => {
    it('filters blocked periods by court and date', () => {
      const periods: BlockedPeriod[] = [
        { id: '1', courtId: 'court-1', date: '2099-10-01', startTime: '09:00', endTime: '10:00', reason: 'A', createdAt: '' },
        { id: '2', courtId: 'court-2', date: '2099-10-01', startTime: '09:00', endTime: '10:00', reason: 'B', createdAt: '' },
        { id: '3', courtId: 'court-1', date: '2099-10-02', startTime: '09:00', endTime: '10:00', reason: 'C', createdAt: '' },
        { id: '4', courtId: 'court-1', date: '2099-10-01', startTime: '14:00', endTime: '15:00', reason: 'D', createdAt: '' },
      ];

      useBlockedPeriodStore.setState({ blockedPeriods: periods });

      const result = useBlockedPeriodStore.getState().getBlockedPeriodsForCourtDate('court-1', '2099-10-01');
      expect(result).toHaveLength(2);
      expect(result.map(p => p.id).sort()).toEqual(['1', '4']);
    });
  });

  describe('Multiple blocked periods — cumulative effect', () => {
    it('two separate blocked ranges both appear as Blocked', () => {
      const blocked: BlockedPeriod[] = [
        { id: 'bp-am', courtId: 'court-avail-1', date: '2099-11-01', startTime: '08:00', endTime: '10:00', reason: 'Morning', createdAt: '' },
        { id: 'bp-pm', courtId: 'court-avail-1', date: '2099-11-01', startTime: '16:00', endTime: '18:00', reason: 'Evening', createdAt: '' },
      ];

      const slots = generateAvailabilitySlots(TEST_COURT, '2099-11-01', [], blocked);

      const blockedSlots = slots.filter(s => s.status === 'Blocked');
      const blockedTimes = blockedSlots.map(s => s.startTime).sort();

      expect(blockedTimes).toEqual(['08:00', '09:00', '16:00', '17:00']);

      const availableSlots = slots.filter(s => s.status === 'Available');
      const availableTimes = availableSlots.map(s => s.startTime).sort();
      expect(availableTimes).toContain('10:00');
      expect(availableTimes).toContain('12:00');
      expect(availableTimes).toContain('15:00');
    });
  });
});
