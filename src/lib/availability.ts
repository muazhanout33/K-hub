/**
 * Availability Engine — core business logic for the K-HUB booking platform.
 *
 * This module is framework-free (no React, no Next.js) and contains all
 * rules for determining whether a specific court can be booked at a
 * specific date and time.
 *
 * Rules enforced:
 * 1. Working hours — configurable per court
 * 2. Midnight crossover — close < open means past-midnight operation
 * 3. Blocked periods — admin-defined unavailable windows
 * 4. Past slots — never bookable (Africa/Cairo timezone)
 * 5. Conflict detection — no overlapping bookings
 * 6. No buffer — back-to-back bookings allowed
 * 7. Slot duration — configurable per court (default 60 min)
 */

import { Booking, BlockedPeriod, Court, TimeSlot, SlotStatus, WorkingHours } from '@/types';
import { isSlotPast, cairoToday, cairoCurrentTime } from '@/lib/timezone';

// ── Constants ──────────────────────────────────

// ── Constants ──────────────────────────────────

const DEFAULT_SLOT_DURATION = 60; // minutes

// ── Working Hours Helpers ──────────────────────

/**
 * Parses a time string "HH:mm" into minutes since midnight.
 * "09:30" → 570, "00:00" → 0, "02:00" → 120
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converts minutes since midnight back to "HH:mm".
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Determines whether a court operates past midnight.
 * Returns true when close < open (e.g. open "09:00", close "02:00").
 */
export function isMidnightCrossover(workingHours: WorkingHours): boolean {
  return timeToMinutes(workingHours.close) < timeToMinutes(workingHours.open);
}

/**
 * Checks whether a given time (in minutes) falls within the court's working hours.
 *
 * Normal hours (open < close): time must be in [open, close)
 * Midnight crossover (open > close): time must be in [open, 24h) OR [0, close)
 */
export function isWithinWorkingHours(time: string, workingHours: WorkingHours): boolean {
  const t = timeToMinutes(time);
  const open = timeToMinutes(workingHours.open);
  const close = timeToMinutes(workingHours.close);

  if (open < close) {
    // Normal: 09:00–17:00
    return t >= open && t < close;
  }
  // Midnight crossover: 09:00–02:00
  return t >= open || t < close;
}

/**
 * Checks if a proposed booking endTime exceeds the court's closing time.
 * For midnight crossover, handles day boundary correctly.
 *
 * Returns true if the booking is valid (does NOT exceed closing).
 */
export function isEndTimeWithinWorkingHours(
  date: string,
  startTime: string,
  endTime: string,
  workingHours: WorkingHours
): boolean {
  const open = timeToMinutes(workingHours.open);
  const close = timeToMinutes(workingHours.close);
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (open < close) {
    // Normal hours: end must be <= close
    return end <= close;
  }

  // Midnight crossover
  // If start is in the "after midnight" zone (before close), end must also be <= close
  if (start < close) {
    return end <= close;
  }
  // If start is in the "before midnight" zone (>= open), end can be up to close (next day)
  // endTime could be 00:00 (next day) which is <= close
  return end <= close || end >= start;
}

// ── Slot Generation ────────────────────────────

/**
 * Generates all possible time slots for a court on a given date,
 * respecting the court's working hours and slot duration.
 *
 * For midnight crossover courts, slots that fall after midnight are
 * assigned to the *same* booking date (the date the user selected).
 *
 * @param court - The court with workingHours and slotDurationMinutes
 * @param date - The booking date (YYYY-MM-DD)
 * @param bookings - Existing confirmed/reserved bookings for conflict detection
 * @param blockedPeriods - Admin-defined blocked periods
 * @returns Array of TimeSlot objects with correct status
 */
export function generateAvailabilitySlots(
  court: Court,
  date: string,
  bookings: Booking[],
  blockedPeriods: BlockedPeriod[]
): TimeSlot[] {
  const wh = court.workingHours;
  const duration = court.slotDurationMinutes || DEFAULT_SLOT_DURATION;
  const openMinutes = timeToMinutes(wh.open);
  const closeMinutes = timeToMinutes(wh.close);
  const today = cairoToday();
  const isToday = date === today;
  const currentMinutes = isToday ? (() => {
    const [h, m] = cairoCurrentTime().split(':').map(Number);
    return h * 60 + m;
  })() : -1;

  const slots: TimeSlot[] = [];

  if (openMinutes < closeMinutes) {
    // ── Normal hours (e.g. 07:00–23:00) ──
    for (let t = openMinutes; t + duration <= closeMinutes; t += duration) {
      const startTime = minutesToTime(t);
      const endTime = minutesToTime(t + duration);
      const slot = buildSlot(court.id, date, startTime, endTime, court.pricePerHour, isToday, currentMinutes, bookings, blockedPeriods);
      slots.push(slot);
    }
  } else {
    // ── Midnight crossover (e.g. 09:00–02:00) ──
    // Part 1: from open to 24:00 (24 * 60 = 1440)
    for (let t = openMinutes; t + duration <= 1440; t += duration) {
      const startTime = minutesToTime(t);
      const endTime = minutesToTime(t + duration);
      const slot = buildSlot(court.id, date, startTime, endTime, court.pricePerHour, isToday, currentMinutes, bookings, blockedPeriods);
      slots.push(slot);
    }
    // Part 2: from 00:00 to close
    for (let t = 0; t + duration <= closeMinutes; t += duration) {
      const startTime = minutesToTime(t);
      const endTime = minutesToTime(t + duration);
      const slot = buildSlot(court.id, date, startTime, endTime, court.pricePerHour, isToday, currentMinutes, bookings, blockedPeriods);
      slots.push(slot);
    }
  }

  return slots;
}

function buildSlot(
  courtId: string,
  date: string,
  startTime: string,
  endTime: string,
  pricePerHour: number,
  isToday: boolean,
  currentMinutes: number,
  bookings: Booking[],
  blockedPeriods: BlockedPeriod[]
): TimeSlot {
  const slotId = `slot-${courtId}-${date}-${startTime}`;

  let status: SlotStatus = 'Available';

  // Check past
  if (isToday) {
    const startMins = timeToMinutes(startTime);
    if (startMins < currentMinutes) {
      status = 'Past';
    }
  }
  // Also check if the date itself is past
  if (date < today()) {
    status = 'Past';
  }

  // Check blocked (only if not already past)
  if (status === 'Available') {
    if (isSlotBlocked(date, startTime, endTime, blockedPeriods)) {
      status = 'Blocked';
    }
  }

  // Check booked (only if not already past/blocked)
  if (status === 'Available') {
    if (isSlotBookedByBooking(courtId, date, startTime, endTime, bookings)) {
      status = 'Booked';
    }
  }

  return {
    id: slotId,
    courtId,
    date,
    startTime,
    endTime,
    price: pricePerHour,
    status,
  };
}

function today(): string {
  return cairoToday();
}

// ── Conflict Detection ─────────────────────────

/**
 * Checks if a time range overlaps with any existing booking.
 * Uses minute-level precision for accurate overlap detection.
 *
 * Two ranges [a, b) and [c, d) overlap if a < d AND c < b.
 */
export function isSlotBookedByBooking(
  courtId: string,
  date: string,
  startTime: string,
  endTime: string,
  bookings: Booking[]
): boolean {
  const slotStart = timeToMinutes(startTime);
  const slotEnd = timeToMinutes(endTime);

  return bookings.some((b) => {
    if (b.courtId !== courtId) return false;
    if (b.date !== date) return false;
    if (b.status !== 'Confirmed' && b.status !== 'Reserved') return false;

    const bStart = timeToMinutes(b.startTime);
    const bEnd = timeToMinutes(b.endTime);

    // Overlap: slotStart < bEnd AND bStart < slotEnd
    return slotStart < bEnd && bStart < slotEnd;
  });
}

/**
 * Checks if a time range overlaps with any blocked period.
 */
export function isSlotBlocked(
  date: string,
  startTime: string,
  endTime: string,
  blockedPeriods: BlockedPeriod[]
): boolean {
  const slotStart = timeToMinutes(startTime);
  const slotEnd = timeToMinutes(endTime);

  return blockedPeriods.some((bp) => {
    if (bp.date !== date) return false;

    const bpStart = timeToMinutes(bp.startTime);
    const bpEnd = timeToMinutes(bp.endTime);

    return slotStart < bpEnd && bpStart < slotEnd;
  });
}

// ── Full Validation ────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Full server-side validation for a booking request.
 * Checks every rule defined in the business requirements.
 */
export function validateBookingRequest(
  court: Court | undefined,
  date: string,
  startTime: string,
  endTime: string,
  bookings: Booking[],
  blockedPeriods: BlockedPeriod[]
): ValidationResult {
  // 1. Court exists and is active
  if (!court) {
    return { valid: false, error: 'Court not found.' };
  }
  if (court.status !== 'Available' && court.status !== 'Starts Soon') {
    return { valid: false, error: `Court is not available (status: ${court.status}).` };
  }

  // 2. Slot is not in the past
  if (isSlotPast(date, startTime)) {
    return { valid: false, error: 'Cannot book a slot in the past.' };
  }

  // 3. Time is within working hours
  if (!isWithinWorkingHours(startTime, court.workingHours)) {
    return {
      valid: false,
      error: `Start time ${startTime} is outside working hours (${court.workingHours.open}–${court.workingHours.close}).`,
    };
  }

  // 4. Booking does not exceed closing time
  if (!isEndTimeWithinWorkingHours(date, startTime, endTime, court.workingHours)) {
    return {
      valid: false,
      error: `End time ${endTime} exceeds court closing time (${court.workingHours.close}).`,
    };
  }

  // 5. Slot is not blocked
  if (isSlotBlocked(date, startTime, endTime, blockedPeriods)) {
    return { valid: false, error: 'This time slot is blocked for maintenance.' };
  }

  // 6. Slot does not conflict with another booking
  if (isSlotBookedByBooking(court.id, date, startTime, endTime, bookings)) {
    return { valid: false, error: 'This time slot conflicts with an existing booking.' };
  }

  return { valid: true };
}

// ── Slot ID Helpers (for backward compat) ──────

/**
 * Generates a slot ID matching the existing format.
 */
export function getSlotId(courtId: string, date: string, startTime: string): string {
  return `slot-${courtId}-${date}-${startTime}`;
}
