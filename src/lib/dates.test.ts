import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getToday,
  getCurrentHour,
  getCurrentTime,
  isToday,
  isPastDate,
  isBookableDate,
  formatDisplayDate,
  formatShortDate,
  formatMonthYear,
  generateCalendarDays,
  MAX_BOOKING_HOURS,
} from '@/lib/dates';

describe('Date Constants', () => {
  it('MAX_BOOKING_HOURS is 4', () => {
    expect(MAX_BOOKING_HOURS).toBe(4);
  });
});

describe('getToday', () => {
  it('returns date in YYYY-MM-DD format', () => {
    const today = getToday();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a valid date', () => {
    const today = getToday();
    const date = new Date(today);
    expect(date.getTime()).not.toBeNaN();
  });
});

describe('getCurrentHour', () => {
  it('returns a number between 0 and 23', () => {
    const hour = getCurrentHour();
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });
});

describe('getCurrentTime', () => {
  it('returns time in HH:mm format', () => {
    const time = getCurrentTime();
    expect(time).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('isToday', () => {
  it('returns true for today', () => {
    const today = getToday();
    expect(isToday(today)).toBe(true);
  });

  it('returns false for yesterday', () => {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    const yesterday = today.toISOString().split('T')[0];
    expect(isToday(yesterday)).toBe(false);
  });

  it('returns false for tomorrow', () => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const tomorrow = today.toISOString().split('T')[0];
    expect(isToday(tomorrow)).toBe(false);
  });
});

describe('isPastDate', () => {
  it('returns true for yesterday', () => {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    const yesterday = today.toISOString().split('T')[0];
    expect(isPastDate(yesterday)).toBe(true);
  });

  it('returns false for today', () => {
    const today = getToday();
    expect(isPastDate(today)).toBe(false);
  });

  it('returns false for tomorrow', () => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const tomorrow = today.toISOString().split('T')[0];
    expect(isPastDate(tomorrow)).toBe(false);
  });
});

describe('isBookableDate', () => {
  it('returns true for today', () => {
    const today = getToday();
    expect(isBookableDate(today)).toBe(true);
  });

  it('returns true for tomorrow', () => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const tomorrow = today.toISOString().split('T')[0];
    expect(isBookableDate(tomorrow)).toBe(true);
  });

  it('returns false for yesterday', () => {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    const yesterday = today.toISOString().split('T')[0];
    expect(isBookableDate(yesterday)).toBe(false);
  });
});

describe('formatDisplayDate', () => {
  it('formats date correctly', () => {
    const result = formatDisplayDate('2026-08-15');
    expect(result).toContain('Aug');
    expect(result).toContain('15');
  });
});

describe('formatShortDate', () => {
  it('formats date correctly', () => {
    const result = formatShortDate('2026-08-15');
    expect(result).toContain('Aug');
    expect(result).toContain('15');
  });
});

describe('formatMonthYear', () => {
  it('formats month and year correctly', () => {
    const result = formatMonthYear('2026-08-15');
    expect(result).toContain('August');
    expect(result).toContain('2026');
  });
});

describe('generateCalendarDays', () => {
  it('returns at least one month', () => {
    const months = generateCalendarDays();
    expect(months.length).toBeGreaterThanOrEqual(1);
  });

  it('first month has days', () => {
    const months = generateCalendarDays();
    expect(months[0].days.length).toBeGreaterThan(0);
  });

  it('first day is today', () => {
    const months = generateCalendarDays();
    const today = getToday();
    expect(months[0].days[0].date).toBe(today);
    expect(months[0].days[0].isToday).toBe(true);
  });

  it('days have valid format', () => {
    const months = generateCalendarDays();
    const firstDay = months[0].days[0];
    expect(firstDay.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(firstDay.dayName).toBeDefined();
    expect(firstDay.dayNumber).toBeGreaterThan(0);
    expect(firstDay.monthName).toBeDefined();
    expect(firstDay.monthKey).toMatch(/^\d{4}-\d{2}$/);
  });

  it('months are in order', () => {
    const months = generateCalendarDays();
    for (let i = 1; i < months.length; i++) {
      expect(months[i].key > months[i - 1].key || 
             months[i].key === months[i - 1].key).toBe(true);
    }
  });
});
