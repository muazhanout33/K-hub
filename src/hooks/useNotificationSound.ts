'use client';

import { useEffect } from 'react';
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
 * Hook that plays a notification sound for NEW notifications that
 * arrived in real time (or were optimistically added by the user's
 * own action).
 *
 * Sound gating model:
 *   - The notification store records a transient `pendingSoundIds`
 *     queue whenever a notification actually arrives (realtime INSERT
 *     or optimistic add). Initial fetches and background refetches
 *     never enqueue, so refreshing the page is always silent.
 *   - This hook drains that queue once per change and plays only for
 *     IDs that (a) still exist in the store and (b) match SOUND_TYPES.
 *   - `soundEnabled` is checked at play time; when muted the queue is
 *     still consumed (so no stale sounds burst on re-enable).
 *
 * Safety guarantees:
 *   - NEVER plays on page refresh / hydration (queue starts empty)
 *   - NEVER plays on initial render
 *   - Audio failure never blocks or breaks notification delivery
 */
export function useNotificationSound(): void {
  const notifications = useNotificationStore((s) => s.notifications);
  const soundEnabled = useNotificationStore((s) => s.soundEnabled);

  useEffect(() => {
    // Drain first so IDs are never double-played across renders —
    // even when muted (no stale burst when re-enabled).
    const ids = useNotificationStore.getState().consumePendingSounds();
    if (ids.length === 0) return;
    if (!soundEnabled) return;

    const byId = new Map(notifications.map((n) => [n.id, n]));
    for (const id of ids) {
      const notification = byId.get(id);
      if (!notification) continue; // stale ID (refetch/merge dropped it)
      if (!SOUND_TYPES.has(notification.type)) continue;
      playNotificationSound();
      break; // audio module coalesces; one call per batch is enough
    }
  }, [notifications, soundEnabled]);
}
