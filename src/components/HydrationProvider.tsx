'use client';

import { useEffect } from 'react';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useSponsorshipStore } from '@/features/sponsorship/useSponsorshipStore';
import { useAdvertisementStore } from '@/features/advertisement/useAdvertisementStore';
import { useBlockedPeriodStore } from '@/features/booking/useBlockedPeriodStore';
import { useNotificationSound } from '@/hooks/useNotificationSound';

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
 */
export function HydrationProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    useNotificationStore.persist.rehydrate();
    useBookingStore.persist.rehydrate();
    useBookingStore.setState({ _hasHydrated: true });
    useAuthStore.persist.rehydrate();
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
  }, []);

  // Mount notification sound listener at root level
  useNotificationSound();

  return <>{children}</>;
}
