import { Booking, Court, TimeSlot } from '@/types';
import { GENERATE_TIME_SLOTS, INITIAL_USER_BOOKINGS } from '@/lib/mock-data';
import { getToday, getCurrentHour } from '@/lib/dates';

export function getInitialBookings(): Booking[] {
  return INITIAL_USER_BOOKINGS;
}

/**
 * Generates time slots for a given court/date, using the court's real pricePerHour.
 * Falls back to 0 if pricePerHour not provided (defensive).
 *
 * @param courtOrId - Court object (preferred) or court ID string. When a full Court
 *                    object is passed the MOCK_COURTS lookup is bypassed, allowing
 *                    real Supabase courts to generate slots correctly.
 */
export function generateTimeSlots(
  courtOrId: string | Court,
  date: string,
  pricePerHour: number,
  bookings: Booking[] = []
): TimeSlot[] {
  return GENERATE_TIME_SLOTS(courtOrId, date, pricePerHour, bookings);
}

// ── Helpers exported for useBookingStore & components ──

/** Parse "HH:mm" → integer hour. e.g. "08:00" → 8 */
export function parseHour(time: string): number {
  return parseInt(time.split(':')[0], 10);
}

/** Check whether slot IDs form a consecutive run. Requires sorted input. */
export function areSlotsConsecutive(slots: TimeSlot[]): boolean {
  if (slots.length <= 1) return true;
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 1; i < sorted.length; i++) {
    if (parseHour(sorted[i].startTime) - parseHour(sorted[i - 1].startTime) !== 1) {
      return false;
    }
  }
  return true;
}

/** Filter out past slots for today. Safe for any date. */
export function filterPastSlots(slots: TimeSlot[]): TimeSlot[] {
  const todayStr = getToday();
  const currentHour = getCurrentHour();
  return slots.map((slot) => {
    if (slot.date === todayStr && parseHour(slot.startTime) < currentHour) {
      return { ...slot, status: 'Past' as const };
    }
    return slot;
  });
}
