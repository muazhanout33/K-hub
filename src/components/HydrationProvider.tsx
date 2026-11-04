'use client';

import { useEffect } from 'react';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { useSponsorshipStore } from '@/features/sponsorship/useSponsorshipStore';
import { useAdvertisementStore } from '@/features/advertisement/useAdvertisementStore';
import { useBlockedPeriodStore } from '@/features/booking/useBlockedPeriodStore';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { installAudioUnlock } from '@/lib/audio';

/**
 * Rehydrates all Zustand stores from localStorage after React hydration completes.
 *
 * All persisted stores use `skipHydration: true` so that the server-rendered
 * HTML uses the store's initial state. After hydration, this component rehydrates
 * from localStorage, updating the in-memory store — which triggers React
 * re-renders via Zustand selectors.
 *
 * This eliminates DOM mismatches where server and client rendered different
 * attribute values.
 *
 * Phase B fix: useBlockedPeriodStore added to ensure blocked periods survive
 * page reload without requiring the BlockedPeriodsManager to fetch first.
 *
 * Also:
 * - usePaymentStore rehydrated so a pending booking confirmation survives
 *   refresh / redirect back from payment
 * - Audio unlock listeners installed at root (required for mobile autoplay)
 * - Notification realtime init is auth-reactive: fresh logins (without a
 *   page reload) still get their subscriptions
 */
export function HydrationProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    useNotificationStore.persist.rehydrate();
    useBookingStore.persist.rehydrate();
    useBookingStore.setState({ _hasHydrated: true });
    useAuthStore.persist.rehydrate();
    Promise.resolve(usePaymentStore.persist.rehydrate()).finally(() => {
      // Signal that persisted payment state (incl. pendingConfirmation)
      // has been read, so recovery UIs never flash the empty state.
      usePaymentStore.setState({ _hasHydrated: true });
    });
    useBlockedPeriodStore.persist.rehydrate();
    useSponsorshipStore.persist.rehydrate();
    useAdvertisementStore.persist.rehydrate();

    // Sync Supabase Auth session into Zustand store
    useAuthStore.getState().initSession();

    // Load notifications from Supabase once session is ready
    const user = useAuthStore.getState().user;
    if (user) {
      useNotificationStore.getState().initNotifications(user.id);
    }

    // React to login/logout without requiring a page reload.
    let currentUserId = user?.id ?? null;
    const unsubscribeAuth = useAuthStore.subscribe((state) => {
      const nextUserId = state.user?.id ?? null;
      if (nextUserId === currentUserId) return;
      currentUserId = nextUserId;
      if (nextUserId) {
        useNotificationStore.getState().initNotifications(nextUserId);
      } else {
        useNotificationStore.getState().clearNotifications();
      }
    });

    // Unlock audio playback on the first genuine user gesture
    // (Android Chrome / iOS Safari autoplay policy).
    const uninstallAudioUnlock = installAudioUnlock();

    return () => {
      unsubscribeAuth();
      uninstallAudioUnlock();
    };
  }, []);

  // Mount notification sound listener at root level
  useNotificationSound();

  return <>{children}</>;
}
