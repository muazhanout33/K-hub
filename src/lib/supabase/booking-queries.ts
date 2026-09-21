import { createClient } from '@/lib/supabase/client';
import { Booking, BlockedPeriod } from '@/types';
import { DbBooking, DbBlockedPeriod } from '@/types/database.types';
import { mapDbBookingToBooking, mapDbBlockedPeriodToBlockedPeriod } from '@/lib/mappers';
import { getCourtInfoMap } from '@/services/court.service';

/**
 * Fetch all active bookings ('Reserved', 'Confirmed') for a court on a given date.
 */
export async function getBookingsForCourtDate(
  courtId: string,
  date: string
): Promise<Booking[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('court_id', courtId)
      .in('status', ['Reserved', 'Confirmed']);

    if (error || !data) {
      return [];
    }

    const dbBookings = data as DbBooking[];
    const courtMap = await getCourtInfoMap(dbBookings.map((b) => b.court_id));
    return dbBookings.map((b) =>
      mapDbBookingToBooking(b, courtMap.get(b.court_id))
    );
  } catch {
    return [];
  }
}

/**
 * Fetch blocked periods for a court on a given date.
 */
export async function getBlockedPeriodsForCourtDate(
  courtId: string,
  date: string
): Promise<BlockedPeriod[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('blocked_periods')
      .select('*')
      .eq('court_id', courtId);

    if (error || !data) {
      return [];
    }

    return (data as DbBlockedPeriod[])
      .map(mapDbBlockedPeriodToBlockedPeriod)
      .filter((bp) => bp.date === date);
  } catch {
    return [];
  }
}

/**
 * Fetch bookings for a specific user from Supabase.
 */
export async function getUserBookingsFromSupabase(userId: string): Promise<Booking[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    const dbBookings = data as DbBooking[];
    const courtMap = await getCourtInfoMap(dbBookings.map((b) => b.court_id));
    return dbBookings.map((b) =>
      mapDbBookingToBooking(b, courtMap.get(b.court_id))
    );
  } catch {
    return [];
  }
}
