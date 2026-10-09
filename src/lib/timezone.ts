/**
 * Africa/Cairo timezone utilities.
 *
 * All booking date/time operations MUST go through this module
 * to guarantee correct behaviour regardless of the server's local tz.
 *
 * Cairo observes DST: UTC+3 from the last Friday of April to the last
 * Thursday of October, UTC+2 the rest of the year (reinstated in 2023).
 * Never hard-code a fixed offset — always use Intl with 'Africa/Cairo'.
 *
 * Storage convention (Model B): booking_range / blocked_range store
 * Cairo WALL-CLOCK digits annotated '+00'. Comparisons against those
 * ranges must use wall-clock digits too (see cairoExpiryNowRange),
 * never a true UTC instant.
 */

const CAIRO_TZ = 'Africa/Cairo';

/** Cancellation window: bookings may only be cancelled strictly more than
 * this many hours before the slot start (Cairo wall-clock).
 * Single source of truth for client pre-checks and server enforcement. */
export const CANCELLATION_WINDOW_HOURS = 2;

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

// ── Wall-clock "now" (canonical comparisons) ────

export interface CairoWallClock {
  /** YYYY-MM-DD in Africa/Cairo. */
  date: string;
  /** HH:mm in Africa/Cairo. */
  time: string;
}

/** Current date and time as Cairo wall-clock strings. */
export function cairoWallClockNow(): CairoWallClock {
  return { date: cairoToday(), time: cairoCurrentTime() };
}

/**
 * Adds days to a YYYY-MM-DD date string using UTC arithmetic.
 * Host-timezone independent.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().split('T')[0];
}

/**
 * True when the slot start is strictly more than `windowHours` before the
 * current Cairo wall-clock time. `slotDate`/`slotTime` must be the stored
 * wall-clock start (the same digits written into booking_range).
 *
 * Shared by the client pre-check and the authoritative server action so
 * both always agree, regardless of host timezone.
 */
export function isSlotCancellable(
  slotDate: string,
  slotTime: string,
  windowHours: number = CANCELLATION_WINDOW_HOURS,
  now: CairoWallClock = cairoWallClockNow()
): boolean {
  return toMinutes(slotDate, slotTime) - toMinutes(now.date, now.time) > windowHours * 60;
}

/**
 * A degenerate tstzrange literal ("[now, now]") built from the current
 * Cairo wall-clock, matching the stored booking_range convention
 * (wall-clock digits annotated '+00'). Use for expiry comparisons only —
 * never as a true UTC instant.
 */
export function cairoExpiryNowRange(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const bound = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}+00`;
  return `["${bound}","${bound}"]`;
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
