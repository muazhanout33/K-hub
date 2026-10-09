import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toMinutes,
  isSlotPast,
  isBookingFullyPast,
  addMinutesToDate,
  addDaysToDateString,
  isSlotCancellable,
  cairoWallClockNow,
  cairoExpiryNowRange,
  cairoToday,
  cairoCurrentTime,
  CANCELLATION_WINDOW_HOURS,
} from './timezone';

describe('toMinutes', () => {
  it('converts date+time to a comparable number', () => {
    const result = toMinutes('2026-09-15', '10:30');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });

  it('earlier date produces smaller value', () => {
    const earlier = toMinutes('2026-01-01', '00:00');
    const later = toMinutes('2026-12-31', '23:59');
    expect(earlier).toBeLessThan(later);
  });

  it('same date, earlier time produces smaller value', () => {
    const morning = toMinutes('2026-09-15', '08:00');
    const evening = toMinutes('2026-09-15', '20:00');
    expect(morning).toBeLessThan(evening);
  });

  it('midnight is the smallest value for a given date', () => {
    const midnight = toMinutes('2026-09-15', '00:00');
    const later = toMinutes('2026-09-15', '00:01');
    expect(midnight).toBeLessThan(later);
  });
});

describe('isSlotPast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for a date in the past', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 10, 0, 0)));
    expect(isSlotPast('2026-09-14', '10:00')).toBe(true);
  });

  it('returns false for a date in the future', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 10, 0, 0)));
    expect(isSlotPast('2026-09-16', '10:00')).toBe(false);
  });

  it('returns true for today with clearly earlier time', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 18, 0, 0)));
    expect(isSlotPast('2026-09-15', '08:00')).toBe(true);
  });

  it('returns false for today with clearly later time', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 8, 0, 0)));
    expect(isSlotPast('2026-09-15', '18:00')).toBe(false);
  });

  it('returns false for a clearly later time today', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 8, 0, 0)));
    expect(isSlotPast('2026-09-15', '20:00')).toBe(false);
  });

  it('returns true for a clearly earlier time today', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 20, 0, 0)));
    expect(isSlotPast('2026-09-15', '08:00')).toBe(true);
  });
});

describe('isBookingFullyPast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for a date in the past', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 10, 0, 0)));
    expect(isBookingFullyPast('2026-09-14', '18:00')).toBe(true);
  });

  it('returns false for a date in the future', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 10, 0, 0)));
    expect(isBookingFullyPast('2026-09-16', '10:00')).toBe(false);
  });

  it('returns true for today with end time clearly before now', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 18, 0, 0)));
    expect(isBookingFullyPast('2026-09-15', '08:00')).toBe(true);
  });

  it('returns false for today with end time clearly after now', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 8, 0, 0)));
    expect(isBookingFullyPast('2026-09-15', '18:00')).toBe(false);
  });

  it('returns true when end time equals current time', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 10, 0, 0)));
    expect(isBookingFullyPast('2026-09-15', '12:00')).toBe(true);
  });
});

describe('addMinutesToDate', () => {
  it('adds minutes within the same day', () => {
    const result = addMinutesToDate('2026-09-15', '10:00', 90);
    expect(result.time).toBe('11:30');
    expect(result.date).toBe('2026-09-15');
  });

  it('handles midnight crossover', () => {
    const result = addMinutesToDate('2026-09-15', '23:30', 60);
    expect(result.time).toBe('00:30');
    expect(result.date).toBe('2026-09-16');
  });

  it('adds zero minutes unchanged', () => {
    const result = addMinutesToDate('2026-09-15', '10:00', 0);
    expect(result.time).toBe('10:00');
    expect(result.date).toBe('2026-09-15');
  });

  it('handles crossing multiple days', () => {
    const result = addMinutesToDate('2026-09-15', '10:00', 24 * 60);
    expect(result.date).toBe('2026-09-16');
    expect(result.time).toBe('10:00');
  });
});

describe('addDaysToDateString', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysToDateString('2026-11-30', 1)).toBe('2026-12-01');
  });

  it('subtracts days across a year boundary', () => {
    expect(addDaysToDateString('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('adds zero days unchanged', () => {
    expect(addDaysToDateString('2026-08-25', 0)).toBe('2026-08-25');
  });
});

describe('CANCELLATION_WINDOW_HOURS', () => {
  it('is 2 hours', () => {
    expect(CANCELLATION_WINDOW_HOURS).toBe(2);
  });
});

describe('isSlotCancellable (exact cancellation boundaries)', () => {
  const SLOT = { date: '2026-12-01', time: '14:00' };

  it('allows when more than 2 hours remain (2h 1s before)', () => {
    expect(isSlotCancellable(SLOT.date, SLOT.time, 2, { date: '2026-12-01', time: '11:59' })).toBe(true);
  });

  it('blocks at exactly 2 hours before start', () => {
    expect(isSlotCancellable(SLOT.date, SLOT.time, 2, { date: '2026-12-01', time: '12:00' })).toBe(false);
  });

  it('blocks at less than 2 hours before start (1h 59m)', () => {
    expect(isSlotCancellable(SLOT.date, SLOT.time, 2, { date: '2026-12-01', time: '12:01' })).toBe(false);
  });

  it('blocks at the start time', () => {
    expect(isSlotCancellable(SLOT.date, SLOT.time, 2, { date: '2026-12-01', time: '14:00' })).toBe(false);
  });

  it('blocks after the start time', () => {
    expect(isSlotCancellable(SLOT.date, SLOT.time, 2, { date: '2026-12-01', time: '14:01' })).toBe(false);
  });

  it('allows a next-day slot from the evening before', () => {
    expect(isSlotCancellable('2026-12-02', '08:00', 2, { date: '2026-12-01', time: '23:00' })).toBe(true);
  });

  it('blocks a next-day slot at exactly the window across midnight', () => {
    // 01:30 next day minus 23:30 = exactly 120 minutes
    expect(isSlotCancellable('2026-12-02', '01:30', 2, { date: '2026-12-01', time: '23:30' })).toBe(false);
  });

  it('allows a next-day slot 1 minute past the window across midnight', () => {
    expect(isSlotCancellable('2026-12-02', '01:31', 2, { date: '2026-12-01', time: '23:30' })).toBe(true);
  });

  it('blocks a past-day slot', () => {
    expect(isSlotCancellable('2026-11-30', '14:00', 2, { date: '2026-12-01', time: '08:00' })).toBe(false);
  });

  it('uses live Cairo wall-clock now by default (fake timers)', () => {
    vi.useFakeTimers();
    try {
      // 09:00 UTC = 11:00 Cairo (UTC+2, winter). Slot 14:00 → exactly 3h → allowed.
      vi.setSystemTime(new Date('2026-12-01T09:00:00Z'));
      expect(isSlotCancellable('2026-12-01', '14:00')).toBe(true);
      // 12:00 UTC = 14:00 Cairo → at start → blocked.
      vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
      expect(isSlotCancellable('2026-12-01', '14:00')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cairoWallClockNow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns Cairo wall-clock date and time (winter, UTC+2)', () => {
    vi.setSystemTime(new Date('2026-12-01T22:30:00Z'));
    expect(cairoWallClockNow()).toEqual({ date: '2026-12-02', time: '00:30' });
  });

  it('returns Cairo wall-clock date and time (summer DST, UTC+3)', () => {
    vi.setSystemTime(new Date('2026-07-01T10:00:00Z'));
    expect(cairoWallClockNow()).toEqual({ date: '2026-07-01', time: '13:00' });
  });
});

describe('cairoExpiryNowRange', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('builds a degenerate range from Cairo wall-clock digits annotated +00', () => {
    vi.setSystemTime(new Date('2026-12-01T09:00:00Z'));
    expect(cairoExpiryNowRange()).toBe('["2026-12-01 11:00:00+00","2026-12-01 11:00:00+00"]');
  });

  it('wall-clock bound sits before a future stored end and after a past stored end', () => {
    // Stored range end (Model B): "2026-12-01 15:00:00+00"
    const storedEnd = '2026-12-01 15:00:00+00';
    const bound = () => cairoExpiryNowRange().match(/"([^"]+)"/)![1];

    // 14:59:59 Cairo → not yet past the 15:00 end
    vi.setSystemTime(new Date('2026-12-01T12:59:59Z'));
    expect(bound() < storedEnd).toBe(true);
    // 15:00:00 Cairo → at end → .lt degenerate range marks it expired (upper <= now)
    vi.setSystemTime(new Date('2026-12-01T13:00:00Z'));
    expect(bound() === storedEnd).toBe(true);
    // 15:00:01 Cairo → past end
    vi.setSystemTime(new Date('2026-12-01T13:00:01Z'));
    expect(bound() > storedEnd).toBe(true);
  });
});

describe('DST transitions (Africa/Cairo)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('spring-forward 2026: clocks jump 00:00 → 01:00 on the last Friday of April', () => {
    // Transition at 2026-04-24 00:00 Cairo = 2026-04-23 22:00Z (UTC+2 → UTC+3)
    vi.setSystemTime(new Date('2026-04-23T21:30:00Z'));
    expect(cairoToday()).toBe('2026-04-23');
    expect(cairoCurrentTime()).toBe('23:30');
    vi.setSystemTime(new Date('2026-04-23T22:30:00Z'));
    expect(cairoToday()).toBe('2026-04-24');
    expect(cairoCurrentTime()).toBe('01:30'); // 00:00–00:59 does not exist
  });

  it('fall-back 2026: the 23:00–23:59 hour repeats on the last Thursday of October', () => {
    // Transition at 2026-10-30 00:00 Cairo = 2026-10-29 21:00Z (UTC+3 → UTC+2);
    // local 23:00–23:59 of Oct 29 occurs twice.
    vi.setSystemTime(new Date('2026-10-29T20:30:00Z'));
    expect(cairoToday()).toBe('2026-10-29');
    expect(cairoCurrentTime()).toBe('23:30'); // first pass (DST, UTC+3)
    vi.setSystemTime(new Date('2026-10-29T21:30:00Z'));
    expect(cairoToday()).toBe('2026-10-29');
    expect(cairoCurrentTime()).toBe('23:30'); // repeated hour (standard, UTC+2)
  });

  it('cancellation window is correct across the spring-forward transition', () => {
    // Cairo 2026-04-24 03:30 (= 00:30Z). Slot at 04:30 → 1h away → blocked.
    vi.setSystemTime(new Date('2026-04-24T00:30:00Z'));
    expect(isSlotCancellable('2026-04-24', '04:30')).toBe(false);
    // Slot at 06:30 → 3h away → allowed.
    expect(isSlotCancellable('2026-04-24', '06:30')).toBe(true);
  });
});
