'use server';

import { createClient } from '@/lib/supabase/server';
import { BookingResult, CancellationResult, Booking } from '@/types';
import { formatTstzrange, mapDbBookingToBooking } from '@/lib/mappers';
import { DbBooking } from '@/types/database.types';
import { getCourtInfoForBooking, getCourtInfoMap } from '@/services/court.service';
import { calculateBookingPrice } from '@/lib/pricing';
import { isSlotPast } from '@/lib/timezone';

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

    // Create a notification for the user
    await (supabase.from('notifications') as any).insert({
      user_id: userId,
      type: 'new_booking',
      title: 'Booking Reserved',
      message: `Your reservation ${bookingNumber} for ${payload.date} at ${payload.startTime} has been created.`,
      related_booking_id: newBooking.id,
      is_read: false,
      dedupe_key: `new_booking:${newBooking.id}`,
    });

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

    const booking = existingBooking as { id: string; user_id: string; status: string; booking_range: string };

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
    const CANCELLATION_WINDOW_HOURS = 2;
    const range = booking.booking_range;
    // Strip brackets, quotes, and +00 suffix — stored time IS Cairo local
    const cleaned = range.replace(/[\[\)"']/g, '').replace(/\+00/g, '');
    const parts = cleaned.split(',');
    const slotStartTime = new Date(parts[0].trim());

    if (isNaN(slotStartTime.getTime())) {
      return { success: false, error: 'Unable to parse booking time.' };
    }

    const now = new Date();
    const diffMs = slotStartTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Cancellation allowed ONLY if more than 2 hours remain (strict >)
    if (diffHours <= CANCELLATION_WINDOW_HOURS) {
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

    // Insert booking_cancelled notification
    await (supabase.from('notifications') as any).insert({
      user_id: authData.user.id,
      type: 'booking_cancelled',
      title: 'Booking Cancelled',
      message: `Booking ${cancelledBooking.bookingNumber} has been cancelled.`,
      related_booking_id: cancelledBooking.id,
      is_read: false,
      dedupe_key: `booking_cancelled:${cancelledBooking.id}`,
    });

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

    const booking = existing as { id: string; user_id: string; status: string };
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

    // Create booking_confirmed notification
    await (supabase.from('notifications') as any).insert({
      user_id: authData.user.id,
      type: 'booking_confirmed',
      title: 'Booking Confirmed!',
      message: `Your booking ${confirmed.bookingNumber} is confirmed. See you on ${confirmed.date} at ${confirmed.startTime}!`,
      related_booking_id: confirmed.id,
      is_read: false,
      dedupe_key: `booking_confirmed:${confirmed.id}`,
    });

    // Create payment_successful notification
    await (supabase.from('notifications') as any).insert({
      user_id: authData.user.id,
      type: 'payment_successful',
      title: 'Payment Successful',
      message: `EGP ${confirmed.totalPrice} payment processed for booking ${confirmed.bookingNumber}.`,
      related_booking_id: confirmed.id,
      is_read: false,
      dedupe_key: `payment_successful:${confirmed.id}`,
    });

    return { success: true, booking: confirmed };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to confirm booking';
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

    // Find all Reserved bookings where the range end is in the past.
    // Uses TSTZRANGE comparison: booking_range < ["now","now"] means
    // upper(booking_range) < now() — the entire booking is in the past.
    const nowIso = new Date().toISOString();
    const nowRange = `["${nowIso}","${nowIso}"]`;

    const { data, error } = await (supabase.from('bookings') as any)
      .update({ status: 'Expired' })
      .eq('status', 'Reserved')
      .lt('booking_range', nowRange)
      .select('id');

    if (error) {
      return { success: false, expiredCount: 0, error: error.message };
    }

    // Create booking_expired notifications for each expired booking
    if (data && data.length > 0) {
      const expiredNotifications = data.map((row: { id: string }) => ({
        type: 'booking_expired',
        title: 'Booking Expired',
        message: 'A Reserved booking has expired and is no longer valid.',
        related_booking_id: row.id,
        is_read: false,
      }));

      // Batch insert notifications (admin context, no user_id filter needed for RLS)
      // We need user_ids — fetch them in one query
      const bookingIds = data.map((row: { id: string }) => row.id);
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('id, user_id, booking_number')
        .in('id', bookingIds);

      if (bookingsData) {
        const notifications = bookingsData.map((b: any) => ({
          user_id: b.user_id,
          type: 'booking_expired',
          title: 'Booking Expired',
          message: `Your booking ${b.booking_number} has expired and is no longer valid.`,
          related_booking_id: b.id,
          is_read: false,
          dedupe_key: `booking_expired:${b.id}`,
        }));

        await (supabase.from('notifications') as any).insert(notifications);
      }
    }

    return { success: true, expiredCount: data?.length ?? 0 };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to expire bookings';
    return { success: false, expiredCount: 0, error: message };
  }
}
