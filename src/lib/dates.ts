/**
 * Centralized date utility for the K-HUB booking platform.
 *
 * All dates use Africa/Cairo timezone (UTC+2, no DST).
 * Uses Intl.DateTimeFormat for consistent timezone handling.
 *
 * Working hours are now per-court (Court.workingHours) — not global.
 * See Court interface in types/index.ts for the WorkingHours type.
 *
 * Calendar generation shows today through the end of the next month,
 * seamlessly crossing month and year boundaries.
 */

import { cairoToday, cairoCurrentHour, cairoCurrentTime } from '@/lib/timezone';

// ──────────────────────────────────────────────
// CONSTANTS (kept for backward compatibility)
// ──────────────────────────────────────────────

/**
 * DEPRECATED — use court.workingHours instead.
 * Kept only for backward-compatible exports that external consumers may depend on.
 */
export const MAX_BOOKING_HOURS = 4;

/** DEPRECATED — use court.workingHours.open instead. */
export const CLUB_OPEN_HOUR = 7;

/** DEPRECATED — use court.workingHours.close instead. */
export const CLUB_CLOSE_HOUR = 0;

// ──────────────────────────────────────────────
// CORE DATE HELPERS (delegate to timezone.ts)
// ──────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD in Africa/Cairo. */
export function getToday(): string {
  return cairoToday();
}

/** Returns current hour (0-23) in Africa/Cairo. */
export function getCurrentHour(): number {
  return cairoCurrentHour();
}

/** Returns current time as HH:mm in Africa/Cairo. */
export function getCurrentTime(): string {
  return cairoCurrentTime();
}

// ──────────────────────────────────────────────
// CALENDAR GENERATION
// ──────────────────────────────────────────────

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  /** Short day name: Mon, Tue, etc. */
  dayName: string;
  /** Day of month: 7, 14, etc. */
  dayNumber: number;
  /** Short month name: Jan, Feb, etc. */
  monthName: string;
  /** Full display: "Friday" */
  dayFullName: string;
  /** Whether this date is today */
  isToday: boolean;
  /** Month grouping key: "2026-08" */
  monthKey: string;
}

export interface CalendarMonth {
  /** Month grouping key: "2026-08" */
  key: string;
  /** Display label: "August 2026" */
  label: string;
  /** Days in this month (from today or start of month through end) */
  days: CalendarDay[];
}

/**
 * Generates calendar days from today through the end of the next month.
 *
 * Behavior:
 * - First day is always today (never past dates)
 * - Continues through the rest of the current month
 * - Then shows the entire next month
 * - Handles year transitions (Dec → Jan)
 * - Month lengths (28/29/30/31) calculated dynamically
 *
 * Example (today = Aug 7):
 *   Aug 7, 8, 9, ... Aug 31 | Sep 1, 2, ... Sep 30
 *
 * Example (today = Dec 25):
 *   Dec 25, 26, ... Dec 31 | Jan 1, 2, ... Jan 31
 */
export function generateCalendarDays(): CalendarMonth[] {
  const today = new Date();
  const todayStr = getToday();

  // Calculate the end date: last day of the next month
  const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0); // day 0 = last day of month+1

  const months: CalendarMonth[] = [];
  const current = new Date(today);

  while (current <= endDate) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthLabel = current.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    // Calculate last day of this month
    const lastDay = new Date(year, month + 1, 0).getDate();

    // Start from today's day for the current month, or day 1 for subsequent months
    const startDay = month === today.getMonth() && year === today.getFullYear()
      ? today.getDate()
      : 1;

    const days: CalendarDay[] = [];

    for (let day = startDay; day <= lastDay; day++) {
      const d = new Date(year, month, day);
      const dateStr = d.toLocaleDateString('en-CA');

      days.push({
        date: dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumber: day,
        monthName: d.toLocaleDateString('en-US', { month: 'short' }),
        dayFullName: d.toLocaleDateString('en-US', { weekday: 'long' }),
        isToday: dateStr === todayStr,
        monthKey,
      });
    }

    months.push({ key: monthKey, label: monthLabel, days });

    // Move to first day of next month
    current.setMonth(current.getMonth() + 1, 1);
  }

  return months;
}

// ──────────────────────────────────────────────
// DATE COMPARISON HELPERS
// ──────────────────────────────────────────────

/** Checks if a YYYY-MM-DD date string is today. */
export function isToday(date: string): boolean {
  return date === getToday();
}

/** Checks if a YYYY-MM-DD date string is in the past (before today). */
export function isPastDate(date: string): boolean {
  return date < getToday();
}

/**
 * Checks if a YYYY-MM-DD date string is bookable (today or later).
 * No artificial upper bound — calendar handles visible range.
 */
export function isBookableDate(date: string): boolean {
  return date >= getToday();
}

// ──────────────────────────────────────────────
// FORMATTING
// ──────────────────────────────────────────────

/** Format for section headers: "Fri, Aug 7" */
export function formatDisplayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Format for date selector button: "Aug 7" */
export function formatShortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format for month header: "August 2026" */
export function formatMonthYear(date: string): string {
  const [year, month] = date.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
