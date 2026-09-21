'use client';

import { useEffect, useRef } from 'react';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';
import { playNotificationSound } from '@/lib/audio';

/**
 * Notification types that should trigger an audible sound.
 *
 * This list is intentionally narrow — only events the user
 * actively caused or that require attention:
 *   - Booking confirmed / cancelled / reminder
 *   - Payment successful
 *   - New subscription (welcome)
 *
 * Excluded: promo_offer, info, court_full, checkout_stuck,
 *           subscription_expiring, booking_time_changed, new_booking
 */
const SOUND_TYPES = new Set([
  'booking_confirmed',
  'booking_cancelled',
  'booking_reminder',
  'payment_successful',
  'new_subscription',
]);

/**
 * Hook that plays a notification sound when a new notification
 * is added to the store via `addNotification`.
 *
 * Safety guarantees:
 *   - NEVER plays on page refresh / hydration (skips initial state)
 *   - NEVER plays on initial render
 *   - Only reacts to notifications added AFTER this hook mounts
 *   - Only plays for sound-worthy notification types
 *   - Prevents overlapping playback
 *   - Respects the `soundEnabled` store flag (future Settings page)
 *
 * Mount once at the root layout. Do not mount in child components.
 */
export function useNotificationSound(): void {
  const lastCount = useRef<number>(-1);

  useEffect(() => {
    const unsubscribe = useNotificationStore.subscribe((state) => {
      // Skip the very first subscription call (hydration / initial state)
      if (lastCount.current === -1) {
        lastCount.current = state.notifications.length;
        return;
      }

      // Only react to actual additions (count went up)
      if (state.notifications.length <= lastCount.current) {
        lastCount.current = state.notifications.length;
        return;
      }

      lastCount.current = state.notifications.length;

      // Check if sound is enabled (future Settings page integration)
      const soundEnabled = (state as { soundEnabled?: boolean }).soundEnabled;
      if (soundEnabled === false) return;

      // Find the newest notification (first in array — prepended on add)
      const newest = state.notifications[0];
      if (!newest) return;

      // Only play for sound-worthy types
      if (!SOUND_TYPES.has(newest.type)) return;

      playNotificationSound();
    });

    // Initialize count from current state (skip this value on next subscription)
    lastCount.current = useNotificationStore.getState().notifications.length;

    return unsubscribe;
  }, []);
}
