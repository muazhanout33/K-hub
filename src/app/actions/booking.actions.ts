'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BookingResult, CancellationResult, Booking, Notification } from '@/types';
import { formatTstzrange, parseTstzrangeStart, parseTstzrange, mapDbBookingToBooking } from '@/lib/mappers';
import { DbBooking } from '@/types/database.types';
import { getCourtInfoForBooking, getCourtInfoMap, FALLBACK_COURT_IMAGE } from '@/services/court.service';
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

    // Auto-expire any stale 'Reserved' holds older than 10 minutes before insertion
    const holdCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    try {
      const admin = createAdminClient();
      await (admin.from('bookings') as any)
        .update({ status: 'Expired' })
        .eq('court_id', payload.courtId)
        .eq('status', 'Reserved')
        .lt('created_at', holdCutoff);
    } catch {
      // Non-fatal: if admin update fails, proceed to attempt insertion
    }

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

    void broadcastAvailabilityChange(payload.courtId, payload.date);

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

    // ── 2-Hour Cancellation Window (server-side enforcement for Confirmed bookings) ──
    // Reserved holds can always be released immediately without the 2-hour restriction.
    const slotStart = parseTstzrangeStart(booking.booking_range);
    if (!slotStart) {
      return { success: false, error: 'Unable to parse booking time.' };
    }

    if (booking.status === 'Confirmed' && !isSlotCancellable(slotStart.date, slotStart.time, CANCELLATION_WINDOW_HOURS)) {
      return {
        success: false,
        error: 'CANCELLATION_TOO_LATE',
        refund: undefined,
      };
    }

    // Perform the update
    let adminSupabase: any;
    try {
      adminSupabase = createAdminClient();
    } catch {
      adminSupabase = supabase;
    }

    const { data, error } = await (adminSupabase.from('bookings') as any)
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

    // Insert booking_cancelled notification for Confirmed bookings
    if (booking.status === 'Confirmed') {
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
    }

    void broadcastAvailabilityChange(cancelledBooking.courtId, cancelledBooking.date);

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

    let adminSupabase: any;
    try {
      adminSupabase = createAdminClient();
    } catch {
      adminSupabase = supabase;
    }

    // Verify booking exists
    const { data: existing } = await (adminSupabase.from('bookings') as any)
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: 'Booking not found.' };
    }

    const booking = existing as DbBooking;

    // Verify ownership or admin
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

    // Idempotent success: if already Confirmed, return the confirmed booking
    if (booking.status === 'Confirmed') {
      const courtInfo = await getCourtInfoForBooking(booking.court_id);
      const confirmed: Booking = mapDbBookingToBooking(booking, courtInfo);
      return { success: true, booking: confirmed };
    }

    // Handle Expired: check if slot is still free so a paying user isn't stranded
    if (booking.status === 'Expired') {
      const { data: conflicts } = await (adminSupabase.from('bookings') as any)
        .select('id')
        .eq('court_id', booking.court_id)
        .in('status', ['Confirmed', 'Reserved'])
        .neq('id', bookingId)
        .filter('booking_range', 'ov', booking.booking_range);

      if (conflicts && conflicts.length > 0) {
        return {
          success: false,
          error: 'Your booking hold expired and the court slot was taken by another player. A refund has been initiated.',
        };
      }
    } else if (booking.status !== 'Reserved') {
      return { success: false, error: `Booking is already ${booking.status.toLowerCase()}.` };
    }

    const { data, error } = await (adminSupabase.from('bookings') as any)
      .update({ status: 'Confirmed' })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    const courtInfo = await getCourtInfoForBooking(data.court_id);
    const confirmed: Booking = mapDbBookingToBooking(data as DbBooking, courtInfo);

    const notifications: Notification[] = [];

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
    } else if (confirmedNotification.notification) {
      notifications.push(confirmedNotification.notification);
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
    } else if (paymentNotification.notification) {
      notifications.push(paymentNotification.notification);
    }

    void broadcastAvailabilityChange(confirmed.courtId, confirmed.date);

    return { success: true, booking: confirmed, notifications };
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

    if ((data?.length ?? 0) > 0) {
      void broadcastAvailabilityChange();
    }

    return { success: true, expiredCount: data?.length ?? 0 };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to expire bookings';
    return { success: false, expiredCount: 0, error: message };
  }
}

/**
 * Broadcast an availability change event via Supabase Realtime Broadcast.
 * All listening clients (on all devices/browsers) receive this immediately
 * and refresh their slot availability states.
 */
export async function broadcastAvailabilityChange(courtId?: string, date?: string): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin || typeof admin.channel !== 'function') return;
    const channel = admin.channel('public-court-availability');
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
      setTimeout(resolve, 1500);
    });
    await channel.send({
      type: 'broadcast',
      event: 'availability-change',
      payload: { courtId: courtId || 'all', date: date || 'all', timestamp: Date.now() },
    });
    await admin.removeChannel(channel);
  } catch (err) {
    console.warn('Realtime availability broadcast notice failed (non-fatal):', err);
  }
}

export interface PublicAvailabilityResult {
  success: boolean;
  bookings: Booking[];
  error?: string;
}

/**
 * Server Action: Get public availability bookings for a given date and court.
 *
 * PRIVACY GUARANTEE:
 * Returns ONLY sanitized court schedule slots (courtId, date, startTime, endTime, status).
 * All PII (user_name, user_email, user_phone, user_id, total_price, booking_number)
 * is completely stripped / excluded.
 *
 * CONCURRENCY & HOLD SAFETY:
 * 1. Checks active 'Reserved' holds. If a hold was created more than 10 minutes ago
 *    and not confirmed, it is automatically marked 'Expired' in Supabase so the
 *    database GiST exclusion constraint releases the slot for other players.
 * 2. Returns all Confirmed bookings and active (<10 min) Reserved holds.
 */
export async function getPublicCourtAvailabilityAction(params: {
  date: string;
  courtId?: string;
}): Promise<PublicAvailabilityResult> {
  try {
    const { date, courtId } = params;
    if (!date) {
      return { success: false, bookings: [], error: 'Date is required.' };
    }

    const admin = createAdminClient();

    // 1. Auto-expire stale holds ('Reserved' older than 10 minutes)
    const holdCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: expiredRows } = await (admin.from('bookings') as any)
      .update({ status: 'Expired' })
      .eq('status', 'Reserved')
      .lt('created_at', holdCutoff)
      .select('id, court_id');

    if (expiredRows && expiredRows.length > 0) {
      void broadcastAvailabilityChange(courtId, date);
    }

    // 2. Fetch active bookings (Confirmed and unexpired Reserved)
    const nextDate = addDaysToDateString(date, 1);
    const dayRangeFilter = `["${date}T00:00:00+00", "${nextDate}T06:00:00+00")`;

    let query = admin
      .from('bookings')
      .select('id, court_id, booking_range, duration_minutes, status, created_at, updated_at')
      .in('status', ['Reserved', 'Confirmed'])
      .not('booking_range', 'is', null)
      .filter('booking_range', 'ov', dayRangeFilter);

    if (courtId) {
      query = query.eq('court_id', courtId);
    }

    const { data: rows, error: fetchErr } = await (query as any);
    if (fetchErr) {
      return { success: false, bookings: [], error: fetchErr.message };
    }

    const rawRows = (rows as Array<any>) || [];
    const sanitizedBookings: Booking[] = rawRows
      .map((row): Booking => {
        const parsed = parseTstzrange(row.booking_range);
        const selectedSlotIds: string[] = [];
        if (parsed.startTime && parsed.endTime) {
          const [startH] = parsed.startTime.split(':').map(Number);
          const [endH] = parsed.endTime.split(':').map(Number);
          if (startH < endH) {
            for (let h = startH; h < endH; h++) {
              selectedSlotIds.push(`slot-${row.court_id}-${parsed.date}-${String(h).padStart(2, '0')}:00`);
            }
          } else if (endH < startH) {
            for (let h = startH; h < 24; h++) {
              selectedSlotIds.push(`slot-${row.court_id}-${parsed.date}-${String(h).padStart(2, '0')}:00`);
            }
            for (let h = 0; h < endH; h++) {
              selectedSlotIds.push(`slot-${row.court_id}-${parsed.date}-${String(h).padStart(2, '0')}:00`);
            }
          }
        }

        return {
          id: row.id,
          bookingNumber: '',
          courtId: row.court_id,
          courtName: 'Court',
          courtImage: FALLBACK_COURT_IMAGE,
          sportType: 'Padel' as const,
          date: parsed.date,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          durationMinutes: row.duration_minutes,
          totalPrice: 0,
          status: row.status as 'Reserved' | 'Confirmed',
          bookingSource: 'ONLINE' as const,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          userId: null,
          userName: '',
          userEmail: '',
          userPhone: '',
          selectedSlotIds,
        };
      })
      .filter((b: Booking) => b.date === date);

    return { success: true, bookings: sanitizedBookings };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve availability';
    return { success: false, bookings: [], error: message };
  }
}
