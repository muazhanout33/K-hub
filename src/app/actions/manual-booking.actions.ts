'use server';

import { createClient } from '@/lib/supabase/server';
import { BookingResult, Booking } from '@/types';
import { formatTstzrange, mapDbBookingToBooking } from '@/lib/mappers';
import { DbBooking } from '@/types/database.types';
import { getCourtInfoForBooking } from '@/services/court.service';
import { calculateBookingPrice } from '@/lib/pricing';
import { isSlotPast } from '@/lib/timezone';
import { isWithinWorkingHours, isEndTimeWithinWorkingHours } from '@/lib/availability';
import { MAX_BOOKING_HOURS } from '@/lib/dates';
import { broadcastAvailabilityChange } from '@/app/actions/booking.actions';

// ── Types ────────────────────────────────────────

export interface WalkInCustomer {
  mode: 'walkIn';
  name: string;
  phone: string;
  /** Optional — stored as '' when absent (bookings.user_email is NOT NULL TEXT). */
  email?: string;
}

export interface ExistingCustomer {
  mode: 'existing';
  existingUserId: string;
}

export type ManualBookingCustomer = ExistingCustomer | WalkInCustomer;

export interface ManualBookingPayload {
  courtId: string;
  /** YYYY-MM-DD, Cairo wall-clock (Model B). */
  date: string;
  /** HH:mm, Cairo wall-clock. */
  startTime: string;
  /** Whole minutes, 60..MAX_BOOKING_HOURS*60. endTime is derived server-side. */
  durationMinutes: number;
  /** Existing registered customer XOR walk-in contact — never both. */
  customer: ManualBookingCustomer;
}

// ── Validation helpers ───────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const PHONE_RE = /^\+?[\d\s-]{7,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value);
}

function isValidTimeString(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

/** Derives end time (HH:mm) from start + duration, wrapping past midnight. */
function deriveEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

/**
 * Runtime check of the discriminated union (mirrors the TS type).
 * Returns an error string, or null when the customer object is valid.
 */
function validateCustomerShape(customer: unknown): string | null {
  if (typeof customer !== 'object' || customer === null) {
    return 'Customer is required.';
  }
  const c = customer as Record<string, unknown>;
  if (c.mode === 'existing') {
    if (typeof c.existingUserId !== 'string' || c.existingUserId.trim() === '') {
      return 'existingUserId is required for an existing customer.';
    }
    if (c.name !== undefined || c.phone !== undefined) {
      return 'Provide either an existing customer or walk-in contact, never both.';
    }
    return null;
  }
  if (c.mode === 'walkIn') {
    if (typeof c.name !== 'string' || c.name.trim().length < 2 || c.name.trim().length > 100) {
      return 'Walk-in name is required (2-100 characters).';
    }
    if (typeof c.phone !== 'string' || !PHONE_RE.test(c.phone.trim())) {
      return 'Walk-in phone is required (7-20 digits, optional +).';
    }
    if (c.email !== undefined && c.email !== '' && (typeof c.email !== 'string' || !EMAIL_RE.test(c.email.trim()))) {
      return 'Walk-in email is invalid.';
    }
    if (c.existingUserId !== undefined) {
      return 'Provide either an existing customer or walk-in contact, never both.';
    }
    return null;
  }
  return 'Customer mode must be "existing" or "walkIn".';
}

// The hand-written Database generic resolves insert payloads to `never[]`
// (same limitation that forces `as any` across existing actions). Narrow
// structural types keep this file lint-clean without weakening anything.
type BookingsInsertRow = {
  booking_number: string;
  user_id: string | null;
  court_id: string;
  booking_range: string;
  duration_minutes: number;
  total_price: number;
  status: 'Confirmed';
  booking_source: 'WALK_IN';
  user_name: string;
  user_email: string;
  user_phone: string;
};

type InsertResult<T> = { data: T | null; error: { code?: string; message: string } | null };

// ── Server Action ────────────────────────────────

/**
 * Server Action: Admin-only manual/walk-in booking creation.
 *
 * - Authorization: server-side Admin role re-check (A3 pattern); RLS `is_admin()`
 *   permits the INSERT (no service-role key, no RLS changes).
 * - Identity: existing customer → user_id = profiles.id (revalidated server-side,
 *   Suspended rejected); walk-in → user_id = NULL + contact snapshot.
 * - booking_source and status are server-derived ('WALK_IN' / 'Confirmed') —
 *   Confirmed = completed at the desk (payments are mock-only platform-wide;
 *   see docs/c1c2-manual-booking-audit.md lifecycle finding). No payments row.
 * - Price recomputed server-side; conflict protection = GiST
 *   prevent_double_booking (23P01 → friendly error) + blocked-period ov check.
 * - Notifications are only created when user_id is NOT NULL
 *   (notifications.user_id NOT NULL).
 */
export async function createManualBookingAction(
  payload: ManualBookingPayload
): Promise<BookingResult> {
  try {
    const supabase = await createClient();

    // ── A3: server-side Admin role re-check (fail closed) ──
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Authentication required.' };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile || (profile as { role: string }).role !== 'Admin') {
      return { success: false, error: 'Admin access required.' };
    }

    // ── Payload validation ──
    if (typeof payload?.courtId !== 'string' || payload.courtId.trim() === '') {
      return { success: false, error: 'Court is required.' };
    }
    if (!isValidDateString(payload.date)) {
      return { success: false, error: 'Date must be YYYY-MM-DD.' };
    }
    if (!isValidTimeString(payload.startTime)) {
      return { success: false, error: 'Start time must be HH:mm.' };
    }
    const maxDuration = MAX_BOOKING_HOURS * 60;
    if (
      !Number.isInteger(payload.durationMinutes) ||
      payload.durationMinutes < 60 ||
      payload.durationMinutes > maxDuration
    ) {
      return {
        success: false,
        error: `Duration must be a whole number of minutes between 60 and ${maxDuration}.`,
      };
    }

    const customerError = validateCustomerShape(payload.customer);
    if (customerError) {
      return { success: false, error: customerError };
    }

    // ── Customer resolution ──
    let userId: string | null = null;
    let userName: string;
    let userEmail: string;
    let userPhone: string;

    if (payload.customer.mode === 'existing') {
      const { data: customerProfile, error: customerError2 } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone_number, status')
        .eq('id', payload.customer.existingUserId)
        .maybeSingle();

      if (customerError2) {
        return { success: false, error: 'Unable to look up customer.' };
      }
      if (!customerProfile) {
        return { success: false, error: 'Customer not found.' };
      }
      const cp = customerProfile as {
        id: string;
        full_name: string;
        email: string;
        phone_number: string | null;
        status: string;
      };
      if (cp.status === 'Suspended') {
        return { success: false, error: 'Customer account is suspended.' };
      }

      userId = cp.id;
      userName = cp.full_name;
      userEmail = cp.email;
      userPhone = cp.phone_number ?? '';
    } else {
      const walkIn = payload.customer as WalkInCustomer;
      userName = walkIn.name.trim();
      userPhone = walkIn.phone.trim();
      userEmail = (walkIn.email ?? '').trim();
    }

    // ── Court validation (parity with createBookingAction) ──
    const { data: courtRow, error: courtError } = await supabase
      .from('courts')
      .select('id, price_per_hour, status, working_hours_open, working_hours_close')
      .eq('id', payload.courtId)
      .is('deleted_at', null)
      .maybeSingle();

    if (courtError || !courtRow) {
      return { success: false, error: 'Court not found.' };
    }

    const court = courtRow as {
      id: string;
      price_per_hour: number;
      status: string;
      working_hours_open: string;
      working_hours_close: string;
    };
    if (court.status !== 'Available' && court.status !== 'Starts Soon') {
      return { success: false, error: `Court is not available (status: ${court.status}).` };
    }

    const workingHours = {
      open: court.working_hours_open.slice(0, 5),
      close: court.working_hours_close.slice(0, 5),
    };
    if (!isWithinWorkingHours(payload.startTime, workingHours)) {
      return {
        success: false,
        error: `Start time ${payload.startTime} is outside working hours (${workingHours.open}-${workingHours.close}).`,
      };
    }
    const endTime = deriveEndTime(payload.startTime, payload.durationMinutes);
    if (
      !isEndTimeWithinWorkingHours(payload.date, payload.startTime, endTime, workingHours)
    ) {
      return {
        success: false,
        error: `End time ${endTime} exceeds court closing time (${workingHours.close}).`,
      };
    }

    // ── Past-slot check (wall-clock, Model B) ──
    if (isSlotPast(payload.date, payload.startTime)) {
      return { success: false, error: 'Cannot book a slot in the past.' };
    }

    // ── Blocked-period overlap check (parity with createBookingAction) ──
    const bookingRange = formatTstzrange(payload.date, payload.startTime, endTime);
    const { data: blockedPeriods, error: blockedError } = await supabase
      .from('blocked_periods')
      .select('id, reason')
      .eq('court_id', payload.courtId)
      .filter('blocked_range', 'ov', bookingRange);

    if (blockedError) {
      console.error('Blocked periods query failed:', blockedError.message);
    } else if (blockedPeriods && blockedPeriods.length > 0) {
      const reason = (blockedPeriods[0] as { reason: string }).reason || 'Maintenance';
      return { success: false, error: `This time slot is blocked: ${reason}.` };
    }

    // ── Server-side price (never trust client) ──
    const totalPrice = calculateBookingPrice(court.price_per_hour, payload.durationMinutes);

    // ── Insert (server-derived source + status; NULL user_id for walk-ins) ──
    // booking_number is a 6-digit random suffix (parity with online path);
    // retry on the UNIQUE constraint (23505) up to 3 attempts.
    let insertError: { code?: string; message: string } | null = null;
    let inserted: DbBooking | null = null;
    let bookingNumber = '';

    for (let attempt = 0; attempt < 3; attempt++) {
      bookingNumber = `KH-${Math.floor(100000 + Math.random() * 900000)}`;
      const bookingsWriter = supabase.from('bookings') as unknown as {
        insert(row: BookingsInsertRow): {
          select(cols: '*'): { single(): Promise<InsertResult<DbBooking>> };
        };
      };
      const { data, error } = await bookingsWriter
        .insert({
          booking_number: bookingNumber,
          user_id: userId,
          court_id: payload.courtId,
          booking_range: bookingRange,
          duration_minutes: payload.durationMinutes,
          total_price: totalPrice,
          status: 'Confirmed',
          booking_source: 'WALK_IN',
          user_name: userName,
          user_email: userEmail,
          user_phone: userPhone,
        })
        .select('*')
        .single();

      if (!error) {
        inserted = data as DbBooking;
        insertError = null;
        break;
      }
      insertError = { code: error.code, message: error.message };
      if (error.code !== '23505') break;
    }

    if (insertError || !inserted) {
      if (insertError?.code === '23P01' || insertError?.message.includes('prevent_double_booking')) {
        return {
          success: false,
          error: 'This court slot has already been booked. Please select a different slot.',
        };
      }
      if (insertError?.code === '23505') {
        return { success: false, error: 'Could not allocate a unique booking number. Please try again.' };
      }
      return { success: false, error: insertError?.message ?? 'Failed to create booking.' };
    }

    const courtInfo = await getCourtInfoForBooking(payload.courtId);
    const newBooking: Booking = mapDbBookingToBooking(inserted, courtInfo);

    // ── Notification only for account holders (NULL walk-ins are skipped) ──
    if (userId) {
      const notificationsWriter = supabase.from('notifications') as unknown as {
        insert(row: {
          user_id: string;
          type: string;
          title: string;
          message: string;
          related_booking_id: string;
          is_read: boolean;
          dedupe_key: string;
        }): PromiseLike<unknown>;
      };
      await notificationsWriter.insert({
        user_id: userId,
        type: 'booking_confirmed',
        title: 'Booking Confirmed',
        message: `Your booking ${bookingNumber} for ${payload.date} at ${payload.startTime} has been confirmed.`,
        related_booking_id: newBooking.id,
        is_read: false,
        dedupe_key: `booking_confirmed:${newBooking.id}`,
      });
    }

    void broadcastAvailabilityChange(payload.courtId, payload.date);

    return { success: true, booking: newBooking };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create manual booking';
    return { success: false, error: message };
  }
}
