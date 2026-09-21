import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Booking } from '@/types';
import { getUserBookingsFromSupabase } from '@/lib/supabase/booking-queries';
import { mapDbBookingToBooking } from '@/lib/mappers';
import { DbBooking } from '@/types/database.types';
import { getCourtInfoForBooking } from '@/services/court.service';

/**
 * Hook to fetch user bookings from Supabase and subscribe to Realtime changes.
 */
export function useSupabaseBookings(userId: string | undefined) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    if (!userId) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getUserBookingsFromSupabase(userId);
      setBookings(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchBookings();

    if (!userId) return;

    // Realtime subscription for user's bookings
    const supabase = createClient();
    const channel = supabase
      .channel(`user-bookings-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const dbBooking = payload.new as DbBooking;
            void (async () => {
              const courtInfo = await getCourtInfoForBooking(dbBooking.court_id);
              const newBooking = mapDbBookingToBooking(dbBooking, courtInfo);
              setBookings((prev) => [newBooking, ...prev.filter((b) => b.id !== newBooking.id)]);
            })();
          } else if (payload.eventType === 'UPDATE') {
            const dbBooking = payload.new as DbBooking;
            void (async () => {
              const courtInfo = await getCourtInfoForBooking(dbBooking.court_id);
              const updated = mapDbBookingToBooking(dbBooking, courtInfo);
              setBookings((prev) =>
                prev.map((b) => (b.id === updated.id ? updated : b))
              );
            })();
          } else if (payload.eventType === 'DELETE') {
            setBookings((prev) => prev.filter((b) => b.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchBookings]);

  return { bookings, loading, error, refetch: fetchBookings };
}
