/**
 * Africa/Cairo timezone utilities.
 *
 * All booking date/time operations MUST go through this module
 * to guarantee correct behaviour regardless of the server's local tz.
 *
 * Cairo = UTC+2 (no DST).
 */

const CAIRO_TZ = 'Africa/Cairo';

// ── Formatting helpers ──────────────────────────

/** Returns today's date as YYYY-MM-DD in Africa/Cairo. */
export function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CAIRO_TZ }).format(new Date());
}

/** Returns the current hour (0-23) in Africa/Cairo. */
export function cairoCurrentHour(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TZ,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  return parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
}

/** Returns current time as HH:mm in Africa/Cairo. */
export function cairoCurrentTime(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TZ,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === 'hour')!.value.padStart(2, '0');
  const m = parts.find((p) => p.type === 'minute')!.value.padStart(2, '0');
  return `${h}:${m}`;
}

/** Returns the current Date object (useful for "now" comparisons). */
export function cairoNow(): Date {
  return new Date();
}

// ── Slot time helpers ──────────────────────────

/**
 * Converts a "YYYY-MM-DD" + "HH:mm" pair into a comparable number
 * (minutes since epoch-day start in Cairo local time).
 *
 * Useful for overlap detection and past-slot checks.
 */
export function toMinutes(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return ((y * 366 + m * 31 + d) * 24 + h) * 60 + min;
}

/**
 * Checks if a slot (date + startTime) is in the past relative to Africa/Cairo.
 * A slot is "past" if its start time is before the current Cairo time.
 */
export function isSlotPast(date: string, startTime: string): boolean {
  const today = cairoToday();
  if (date < today) return true;
  if (date > today) return false;
  // Same day — compare times
  const nowParts = cairoCurrentTime().split(':').map(Number);
  const slotParts = startTime.split(':').map(Number);
  return slotParts[0] < nowParts[0] || (slotParts[0] === nowParts[0] && slotParts[1] < nowParts[1]);
}

/**
 * Checks if a booking's end time has fully passed (for expiry checks).
 */
export function isBookingFullyPast(date: string, endTime: string): boolean {
  const today = cairoToday();
  if (date < today) return true;
  if (date > today) return false;
  const nowParts = cairoCurrentTime().split(':').map(Number);
  const endParts = endTime.split(':').map(Number);
  return endParts[0] < nowParts[0] || (endParts[0] === nowParts[0] && endParts[1] <= nowParts[1]);
}

/**
 * Adds minutes to a time string, handling midnight crossover.
 * Returns { date, time } adjusted for day overflow.
 */
export function addMinutesToDate(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const totalMin = h * 60 + min + minutes;
  const extraDays = Math.floor(totalMin / (24 * 60));
  const finalMin = totalMin % (24 * 60);
  const finalH = Math.floor(finalMin / 60);
  const finalM = finalMin % 60;

  const dt = new Date(y, m - 1, d + extraDays);
  const newDate = dt.toLocaleDateString('en-CA');
  return { date: newDate, time: `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}` };
}
