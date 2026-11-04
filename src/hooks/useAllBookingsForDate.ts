import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Booking } from '@/types';
import { getPublicCourtAvailabilityAction } from '@/app/actions/booking.actions';

/**
 * Fetches ALL public bookings for a specific date (cross-user availability).
 * Used by LiveAvailabilitySection, BookingWidget, and CourtDetailsPage
 * so the availability grid accurately reflects all users' confirmed bookings and active holds.
 *
 * PRIVACY GUARANTEE:
 * Returns zero personal identification information (PII). All user emails,
 * phones, and names are stripped at the server level.
 *
 * SYNCHRONIZATION:
 * 1. Subscribes to Supabase Realtime Broadcast on 'public-court-availability'.
 * 2. Refetches on window visibility/focus.
 * 3. 15-second heartbeat poll to avoid stale slot displays.
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
      const result = await getPublicCourtAvailabilityAction({ date });
      if (!result.success) {
        throw new Error(result.error || 'Failed to load court availability');
      }

      if (mountedRef.current) {
        setBookings(result.bookings);
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
    void (async () => {
      await fetchBookings();
    })();

    const supabase = createClient();

    // 1. Listen for cross-user broadcast on the public availability channel
    const broadcastChannel = supabase
      .channel('public-court-availability')
      .on('broadcast', { event: 'availability-change' }, (payload) => {
        const payloadDate = payload?.payload?.date;
        if (!payloadDate || payloadDate === 'all' || payloadDate === date) {
          void fetchBookings();
        }
      })
      .subscribe();

    // 2. Also listen for direct postgres_changes (for admin contexts)
    const dbChannel = supabase
      .channel(`all-bookings-${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        () => {
          void fetchBookings();
        }
      )
      .subscribe();

    // 3. Tab visibility / focus refetch
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchBookings();
      }
    };
    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);

    // 4. Polling heartbeat every 15s for live hold expiration and fresh availability
    const timer = setInterval(() => {
      void fetchBookings();
    }, 15000);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisibilityChange);
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(dbChannel);
    };
  }, [date, fetchBookings]);

  return { bookings, loading, error, refetch: fetchBookings };
}
