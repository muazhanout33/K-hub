import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Booking } from '@/types';
import { mapDbBookingToBooking } from '@/lib/mappers';
import { DbBooking } from '@/types/database.types';
import { getCourtInfoMap } from '@/services/court.service';

/**
 * Fetches ALL bookings for a specific date from Supabase (not just current user).
 * Used by LiveAvailabilitySection so the availability grid reflects all users' bookings.
 * Subscribes to Realtime changes on the bookings table.
 */
export function useAllBookingsForDate(date: string | null) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchBookings = useCallback(async () => {
    if (!date) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();

      const { data, error: fetchErr } = await supabase
        .from('bookings')
        .select('*')
        .not('status', 'eq', 'Cancelled')
        .not('status', 'eq', 'Expired')
        .not('booking_range', 'is', null)
        .filter('booking_range', 'ov', `["${date}T00:00:00+00", "${date}T23:59:59+00")`);

      if (fetchErr) {
        throw new Error(fetchErr.message);
      }

      const dbBookings = (data || []) as unknown as DbBooking[];
      const courtMap = await getCourtInfoMap(dbBookings.map((b) => b.court_id));
      const mapped: Booking[] = dbBookings.map((b) =>
        mapDbBookingToBooking(b, courtMap.get(b.court_id))
      );

      if (mountedRef.current) {
        setBookings(mapped);
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load bookings');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [date]);

  useEffect(() => {
    mountedRef.current = true;
    // Async IIFE avoids synchronous setState in effect body
    void (async () => {
      await fetchBookings();
    })();

    // Realtime subscription for ALL bookings (no user_id filter)
    const supabase = createClient();
    const channel = supabase
      .channel(`all-bookings-${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        () => {
          void (async () => {
            await fetchBookings();
          })();
        }
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [date, fetchBookings]);

  return { bookings, loading, error, refetch: fetchBookings };
}
