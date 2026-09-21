import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toMinutes, isSlotPast, isBookingFullyPast, addMinutesToDate } from './timezone';

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
