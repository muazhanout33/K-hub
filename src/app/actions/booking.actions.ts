'use server';

import { createClient } from '@/lib/supabase/server';
import { BookingResult, CancellationResult, Booking } from '@/types';
import { formatTstzrange, parseTstzrangeStart, mapDbBookingToBooking } from '@/lib/mappers';
import { DbBooking } from '@/types/database.types';
import { getCourtInfoForBooking, getCourtInfoMap } from '@/services/court.service';
import { createNotification } from '@/services/notification.service';
import { calculateBookingPrice } from '@/lib/pricing';
import { isSlotPast, isSlotCancellable, CANCELLATION_WINDOW_HOURS, cairoExpiryNowRange, addDaysToDateString } from '@/lib/timezone';

export interface CreateBookingPayload {
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalPrice: number;
  userName: string;
  userEmail: string;
  userPhone: string;
}

/**
 * Server Action: Create a new booking in Supabase.
 * Respects RLS and PostgreSQL EXCLUDE USING gist (prevent_double_booking).
 */
export async function createBookingAction(
  payload: CreateBookingPayload
): Promise<BookingResult> {
  try {
    const supabase = await createClient();

    // Verify authenticated user
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Please sign in to book a court.' };
    }

    const userId = authData.user.id;

    // ── H2: Server-side court validation ──
    const { data: courtRow, error: courtError } = await supabase
      .from('courts')
      .select('id, price_per_hour, status')
      .eq('id', payload.courtId)
      .is('deleted_at', null)
      .maybeSingle();

    if (courtError || !courtRow) {
      return { success: false, error: 'Court not found.' };
    }

    const court = courtRow as { id: string; price_per_hour: number; status: string };
    if (court.status !== 'Available' && court.status !== 'Starts Soon') {
      return { success: false, error: `Court is not available (status: ${court.status}).` };
    }

    // ── M4: Server-side past-slot check (cannot book in the past) ──
    if (isSlotPast(payload.date, payload.startTime)) {
      return { success: false, error: 'Cannot book a slot in the past.' };
    }

    // ── FIX 5: Server-side blocked-period overlap check ──
    const bookingRange = formatTstzrange(payload.date, payload.startTime, payload.endTime);
    const { data: blockedPeriods, error: blockedError } = await supabase
      .from('blocked_periods')
      .select('id, reason')
      .eq('court_id', payload.courtId)
      .filter('blocked_range', 'ov', bookingRange);

    if (blockedError) {
      // Non-fatal: log but don't block the booking on query errors
      console.error('Blocked periods query failed:', blockedError.message);
    } else if (blockedPeriods && blockedPeriods.length > 0) {
      const reason = (blockedPeriods[0] as { reason: string }).reason || 'Maintenance';
      return {
        success: false,
        error: `This time slot is blocked: ${reason}.`,
      };
    }

    // ── L1: Per-user active booking limit (max 5 concurrent) ──
    const MAX_ACTIVE_BOOKINGS = 5;
    const { count: activeCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['Reserved', 'Confirmed']);

    if ((activeCount ?? 0) >= MAX_ACTIVE_BOOKINGS) {
      return {
        success: false,
        error: `You have reached the maximum of ${MAX_ACTIVE_BOOKINGS} active bookings. Please cancel an existing booking first.`,
      };
    }

    // ── H1: Server-side price recalculation (never trust client) ──
    const totalPrice = calculateBookingPrice(court.price_per_hour, payload.durationMinutes);

    const bookingNumber = `KH-${Math.floor(100000 + Math.random() * 900000)}`;

    // Insert into public.bookings table
    const { data, error } = await (supabase.from('bookings') as any)
      .insert({
        booking_number: bookingNumber,
        user_id: userId,
        court_id: payload.courtId,
        booking_range: bookingRange,
        duration_minutes: payload.durationMinutes,
        total_price: totalPrice,
        status: 'Reserved',
        booking_source: 'ONLINE',
        user_name: payload.userName,
        user_email: payload.userEmail,
        user_phone: payload.userPhone,
      })
      .select('*')
      .single();

    if (error) {
      // Handle PostgreSQL Exclusion Constraint Violation (23P01)
      if (error.code === '23P01' || error.message.includes('prevent_double_booking')) {
        return {
          success: false,
          error: 'This court slot has already been booked by another player. Please select a different slot.',
        };
      }
      return { success: false, error: error.message };
    }

    const courtInfo = await getCourtInfoForBooking(payload.courtId);
    const newBooking: Booking = mapDbBookingToBooking(data as DbBooking, courtInfo);

    // Create a notification for the user (owner = the booking's user).
    // Failures are logged and never fail the booking itself.
    const newBookingNotification = await createNotification({
      userId: newBooking.userId ?? userId,
      type: 'new_booking',
      title: 'Booking Reserved',
      message: `Your reservation ${bookingNumber} for ${payload.date} at ${payload.startTime} has been created.`,
      relatedBookingId: newBooking.id,
      dedupeKey: `new_booking:${newBooking.id}`,
    });
    if (!newBookingNotification.success) {
      console.error('Failed to create new_booking notification:', newBookingNotification.error);
    }

    return { success: true, booking: newBooking };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create booking';
    return { success: false, error: message };
  }
}

/**
 * Server Action: Cancel a booking in Supabase.
 * Enforces:
 * 1. Authentication
 * 2. Ownership (user_id match) or Admin role
 * 3. 2-hour cancellation window — slot must start at least 2 hours from now
 * 4. Booking must not already be Cancelled/Expired
 * 5. RLS enforced via anon key
 */
export async function cancelBookingAction(bookingId: string): Promise<CancellationResult> {
  try {
    const supabase = await createClient();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Authentication required.' };
    }

    // Fetch full booking data including booking_range for the 2-hour rule check
    const { data: existingBooking, error: fetchError } = await supabase
      .from('bookings')
      .select('id, user_id, status, booking_range')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchError || !existingBooking) {
      return { success: false, error: 'Booking not found or access denied.' };
    }

    const booking = existingBooking as { id: string; user_id: string | null; status: string; booking_range: string };

    // Already cancelled or expired — no-op, not an error
    if (booking.status === 'Cancelled' || booking.status === 'Expired') {
      return {
        success: false,
        error: `Booking is already ${booking.status.toLowerCase()}.`,
      };
    }

    // Ownership check (Admin bypass)
    const isOwner = booking.user_id === authData.user.id;

    if (!isOwner) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (!profile || (profile as any).role !== 'Admin') {
        return { success: false, error: 'You are not authorized to cancel this booking.' };
      }
    }

    // ── 2-Hour Cancellation Window (server-side enforcement) ──
    // Wall-clock semantics: booking_range stores Cairo wall-clock digits,
    // so the window compares Cairo wall-clock now against the stored start.
    // isSlotCancellable is shared with the client pre-check — the server
    // remains authoritative (this action is the enforcement point).
    const slotStart = parseTstzrangeStart(booking.booking_range);
    if (!slotStart) {
      return { success: false, error: 'Unable to parse booking time.' };
    }

    if (!isSlotCancellable(slotStart.date, slotStart.time, CANCELLATION_WINDOW_HOURS)) {
      return {
        success: false,
        error: 'CANCELLATION_TOO_LATE',
        refund: undefined,
      };
    }

    // Perform the update
    const { data, error } = await (supabase.from('bookings') as any)
      .update({
        status: 'Cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    const cancelledCourtInfo = await getCourtInfoForBooking(data.court_id);
    const cancelledBooking: Booking = mapDbBookingToBooking(data as DbBooking, cancelledCourtInfo);

    // Insert booking_cancelled notification for the booking OWNER
    // (an admin may cancel someone else's booking — notify the owner).
    // Failures are logged and never fail the cancellation itself.
    const cancelNotification = await createNotification({
      userId: cancelledBooking.userId ?? authData.user.id,
      type: 'booking_cancelled',
      title: 'Booking Cancelled',
      message: `Booking ${cancelledBooking.bookingNumber} has been cancelled.`,
      relatedBookingId: cancelledBooking.id,
      dedupeKey: `booking_cancelled:${cancelledBooking.id}`,
    });
    if (!cancelNotification.success) {
      console.error('Failed to create booking_cancelled notification:', cancelNotification.error);
    }

    return { success: true, booking: cancelledBooking, refund: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to cancel booking';
    return { success: false, error: message };
  }
}

/**
 * Server Action: Fetch all bookings for the Admin Dashboard.
 * Enforces:
 * 1. Authentication
 * 2. Admin role verification via database query
 * 3. Returns all bookings (no user_id filter)
 */
export async function getAdminBookingsAction(): Promise<{
  success: boolean;
  bookings?: Booking[];
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Authentication required.' };
    }

    // Verify admin role via database query (same pattern as cancelBookingAction)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile || (profile as any).role !== 'Admin') {
      return { success: false, error: 'Admin access required.' };
    }

    // Fetch ALL bookings (admin sees everything)
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const dbBookings = (data as DbBooking[]) || [];
    const courtMap = await getCourtInfoMap(dbBookings.map((b) => b.court_id));
    const bookings = dbBookings.map((b) =>
      mapDbBookingToBooking(b, courtMap.get(b.court_id))
    );

    return { success: true, bookings };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch admin bookings';
    return { success: false, error: message };
  }
}

// ── Admin Bookings page (Phase 2) ────────────────────────────────

const ADMIN_BOOKINGS_PAGE_SIZE = 25;

const BOOKING_STATUS_WHITELIST = ['Reserved', 'Confirmed', 'Cancelled', 'Expired'] as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminBookingsPageQuery {
  search?: string;
  status?: string | null;
  courtId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
}

export interface AdminBookingsPageResult {
  success: boolean;
  bookings?: Booking[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
}

/**
 * Server Action: Paginated, filterable booking listing for the Admin
 * Bookings page (`/admin/bookings`).
 *
 * Enforces: authentication + admin role re-check (parity with
 * getAdminBookingsAction). Validates every filter server-side (status
 * whitelist, ISO dates, from <= to, UUID court id, search sanitization
 * against PostgREST `.or()` syntax injection). Fixed offset pagination
 * (approved baseline: docs/admin-dashboard-audit-baseline.md §6.6).
 *
 * Date filter matches bookings whose stored day-span overlaps the
 * [dateFrom 00:00, dateTo+1 00:00) window (`booking_range ov`), so a
 * booking crossing midnight into the next day is still included when
 * either endpoint date is selected. Stored ranges are Cairo wall-clock
 * digits annotated '+00' (Model B); the day-span bound uses the same
 * wall-clock convention.
 *
 * Walk-in bookings (user_id NULL) are intentionally included — they are
 * part of the admin's operational book of record.
 */
export async function getAdminBookingsPageAction(
  query: AdminBookingsPageQuery = {}
): Promise<AdminBookingsPageResult> {
  try {
    const supabase = await createClient();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Authentication required.' };
    }

    // Admin role re-check (parity with getAdminBookingsAction)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile || (profile as { role?: string }).role !== 'Admin') {
      return { success: false, error: 'Admin access required.' };
    }

    // ── Input validation ──
    const page =
      query.page === undefined ? 1 : query.page;
    if (!Number.isInteger(page) || page < 1) {
      return { success: false, error: 'Invalid page number.' };
    }

    if (
      query.status != null &&
      query.status !== '' &&
      !BOOKING_STATUS_WHITELIST.includes(query.status as (typeof BOOKING_STATUS_WHITELIST)[number])
    ) {
      return { success: false, error: 'Invalid status filter.' };
    }

    if (query.courtId != null && query.courtId !== '' && !UUID_RE.test(query.courtId)) {
      return { success: false, error: 'Invalid court filter.' };
    }

    const dateFrom = query.dateFrom || null;
    const dateTo = query.dateTo || null;
    if ((dateFrom && !ISO_DATE_RE.test(dateFrom)) || (dateTo && !ISO_DATE_RE.test(dateTo))) {
      return { success: false, error: 'Invalid date filter.' };
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return { success: false, error: 'Start date must be on or before end date.' };
    }

    // Strip characters that would break/split PostgREST `.or()` syntax.
    // Commas separate conditions; parens group; quotes open values.
    // Also escape ILIKE wildcards so '%' and '_' are treated literally
    // (single backslash: postgres ILIKE default escape is '\'), and collapse
    // runs of whitespace for parity with the customers search.
    const search = (query.search || '')
      .replace(/[,()"'\\]/g, ' ')
      .replace(/[%_]/g, (c) => '\\' + c)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);

    // ── Query composition ──
    let request = supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(
        (page - 1) * ADMIN_BOOKINGS_PAGE_SIZE,
        page * ADMIN_BOOKINGS_PAGE_SIZE - 1
      );

    if (query.status) {
      request = request.eq('status', query.status);
    }
    if (query.courtId) {
      request = request.eq('court_id', query.courtId);
    }
    if (dateFrom && dateTo) {
      // Day-span overlap: [from 00:00, to+1 00:00)
      const dateToPlus1 = addDaysToDateString(dateTo, 1);
      request = request.filter(
        'booking_range',
        'ov',
        `[${dateFrom} 00:00:00+00, ${dateToPlus1} 00:00:00+00)`
      );
    } else if (dateFrom) {
      request = request.filter(
        'booking_range',
        'ov',
        `[${dateFrom} 00:00:00+00, ${addDaysToDateString(dateFrom, 1)} 00:00:00+00)`
      );
    } else if (dateTo) {
      request = request.filter(
        'booking_range',
        'ov',
        `[${dateTo} 00:00:00+00, ${addDaysToDateString(dateTo, 1)} 00:00:00+00)`
      );
    }
    if (search) {
      request = request.or(
        `booking_number.ilike.%${search}%,user_name.ilike.%${search}%,user_email.ilike.%${search}%,user_phone.ilike.%${search}%`
      );
    }

    const { data, error, count } = await request;

    if (error) {
      return { success: false, error: error.message };
    }

    const dbBookings = (data as DbBooking[]) || [];
    const courtMap = await getCourtInfoMap(dbBookings.map((b) => b.court_id));
    const bookings = dbBookings.map((b) =>
      mapDbBookingToBooking(b, courtMap.get(b.court_id))
    );

    return {
      success: true,
      bookings,
      total: count ?? dbBookings.length,
      page,
      pageSize: ADMIN_BOOKINGS_PAGE_SIZE,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bookings';
    return { success: false, error: message };
  }
}

/**
 * Server Action: Confirm a Reserved booking after payment succeeds.
 * Updates status from 'Reserved' → 'Confirmed' in Supabase.
 */
export async function confirmBookingStatusAction(
  bookingId: string
): Promise<BookingResult> {
  try {
    const supabase = await createClient();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Authentication required.' };
    }

    // Verify ownership or admin
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, user_id, status')
      .eq('id', bookingId)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: 'Booking not found.' };
    }

    const booking = existing as { id: string; user_id: string | null; status: string };
    if (booking.status !== 'Reserved') {
      return { success: false, error: `Booking is already ${booking.status.toLowerCase()}.` };
    }

    const isOwner = booking.user_id === authData.user.id;
    if (!isOwner) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (!profile || (profile as any).role !== 'Admin') {
        return { success: false, error: 'Not authorized.' };
      }
    }

    const { data, error } = await (supabase.from('bookings') as any)
      .update({ status: 'Confirmed' })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    const courtInfo = await getCourtInfoForBooking(data.court_id);
    const confirmed: Booking = mapDbBookingToBooking(data as DbBooking, courtInfo);

    // Create booking_confirmed notification for the booking OWNER.
    // Failures are logged and never fail the confirmation itself.
    const confirmedNotification = await createNotification({
      userId: confirmed.userId ?? authData.user.id,
      type: 'booking_confirmed',
      title: 'Booking Confirmed!',
      message: `Your booking ${confirmed.bookingNumber} is confirmed. See you on ${confirmed.date} at ${confirmed.startTime}!`,
      relatedBookingId: confirmed.id,
      dedupeKey: `booking_confirmed:${confirmed.id}`,
    });
    if (!confirmedNotification.success) {
      console.error('Failed to create booking_confirmed notification:', confirmedNotification.error);
    }

    // Create payment_successful notification for the booking OWNER.
    const paymentNotification = await createNotification({
      userId: confirmed.userId ?? authData.user.id,
      type: 'payment_successful',
      title: 'Payment Successful',
      message: `EGP ${confirmed.totalPrice} payment processed for booking ${confirmed.bookingNumber}.`,
      relatedBookingId: confirmed.id,
      dedupeKey: `payment_successful:${confirmed.id}`,
    });
    if (!paymentNotification.success) {
      console.error('Failed to create payment_successful notification:', paymentNotification.error);
    }

    return { success: true, booking: confirmed };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to confirm booking';
    return { success: false, error: message };
  }
}

/**
 * Server Action: Fetch a single booking's current status/data.
 *
 * Used by the confirmation page to recover durable booking context
 * after a refresh/redirect (e.g. when the local store is empty but a
 * payment/confirmation is pending). Enforces authentication and
 * ownership (or Admin role), like the other booking actions.
 */
export async function getBookingStatusAction(
  bookingId: string
): Promise<BookingResult> {
  try {
    const supabase = await createClient();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Authentication required.' };
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: 'Booking not found or access denied.' };
    }

    const row = data as DbBooking;

    // Ownership check (Admin bypass) — mirrors confirmBookingStatusAction
    const isOwner = row.user_id === authData.user.id;
    if (!isOwner) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (!profile || (profile as { role?: string }).role !== 'Admin') {
        return { success: false, error: 'Not authorized.' };
      }
    }

    const courtInfo = await getCourtInfoForBooking(row.court_id);
    const booking = mapDbBookingToBooking(row, courtInfo);
    return { success: true, booking };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch booking';
    return { success: false, error: message };
  }
}

/**
 * Server Action: Expire stale Reserved bookings in Supabase.
 * Marks all Reserved bookings whose booking_range end is in the past as 'Expired'.
 * Returns the count of expired bookings.
 * Enforces: Admin role only.
 */
export async function expireStaleBookingsAction(): Promise<{
  success: boolean;
  expiredCount: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, expiredCount: 0, error: 'Authentication required.' };
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile || (profile as any).role !== 'Admin') {
      return { success: false, expiredCount: 0, error: 'Admin access required.' };
    }

    // Find all Reserved bookings whose wall-clock end has passed.
    // booking_range stores Cairo WALL-CLOCK digits annotated '+00' (Model B),
    // so "now" must use the same wall-clock convention (cairoExpiryNowRange).
    //
    // Operator note (verified by read-only probe against live PostgREST,
    // 2026-10-09): `.lt` on a range column is B-TREE lower-bound ordering
    // (matches rows that have STARTED) — not "ended by now". `nxr` (&<)
    // matches upper(range) <= bound, i.e. the range no longer extends past
    // now — equivalent to the client-side isBookingFullyPast (end <= now).
    const nowRange = cairoExpiryNowRange();

    const { data, error } = await (supabase.from('bookings') as any)
      .update({ status: 'Expired' })
      .eq('status', 'Reserved')
      .filter('booking_range', 'nxr', nowRange)
      .select('id');

    if (error) {
      return { success: false, expiredCount: 0, error: error.message };
    }

    // Create booking_expired notifications for each expired booking.
    // Per-row via createNotification (dedupe-safe): a batch insert is
    // all-or-nothing, so one duplicate dedupe_key would drop every
    // other notification. Failures are logged, never fail the action.
    if (data && data.length > 0) {
      const bookingIds = data.map((row: { id: string }) => row.id);
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('id, user_id, booking_number')
        .in('id', bookingIds);

      if (bookingsData) {
        // notifications.user_id is NOT NULL — walk-in bookings (user_id NULL)
        // have no account to notify and are skipped (manual-booking migration).
        const targets = bookingsData.filter(
          (b: { user_id: string | null }) => b.user_id != null
        ) as { id: string; user_id: string; booking_number: string }[];

        for (const b of targets) {
          const expiredNotification = await createNotification({
            userId: b.user_id,
            type: 'booking_expired',
            title: 'Booking Expired',
            message: `Your booking ${b.booking_number} has expired and is no longer valid.`,
            relatedBookingId: b.id,
            dedupeKey: `booking_expired:${b.id}`,
          });
          if (!expiredNotification.success) {
            console.error(
              `Failed to create booking_expired notification for ${b.id}:`,
              expiredNotification.error
            );
          }
        }
      }
    }

    return { success: true, expiredCount: data?.length ?? 0 };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to expire bookings';
    return { success: false, expiredCount: 0, error: message };
  }
}
