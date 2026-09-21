'use client';

import { useEffect, useState } from 'react';
import { useBookingStore } from './useBookingStore';

export function useReservationTimer() {
  const reservationExpiresAt = useBookingStore((s) => s.reservationExpiresAt);
  const hasExtendedReservation = useBookingStore((s) => s.hasExtendedReservation);
  const extendReservation = useBookingStore((s) => s.extendReservation);
  const clearReservation = useBookingStore((s) => s.clearReservation);

  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(() => {
    if (!reservationExpiresAt) return null;
    const diffMs = reservationExpiresAt - Date.now();
    return diffMs > 0 ? Math.floor(diffMs / 1000) : 0;
  });

  useEffect(() => {
    if (!reservationExpiresAt) {
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const diffMs = reservationExpiresAt - now;

      if (diffMs <= 0) {
        setTimeLeftSeconds(0);
        clearReservation();
      } else {
        setTimeLeftSeconds(Math.floor(diffMs / 1000));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [reservationExpiresAt, clearReservation]);

  const minutes = timeLeftSeconds !== null ? Math.floor(timeLeftSeconds / 60) : 0;
  const seconds = timeLeftSeconds !== null ? timeLeftSeconds % 60 : 0;

  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return {
    isActive: timeLeftSeconds !== null && timeLeftSeconds > 0,
    timeLeftSeconds,
    formattedTime,
    hasExtendedReservation,
    extendReservation,
  };
}
