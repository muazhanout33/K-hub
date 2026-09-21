import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BlockedPeriod } from '@/types';

interface BlockedPeriodStoreState {
  blockedPeriods: BlockedPeriod[];

  /** Add a new blocked period. Returns the created record. */
  addBlockedPeriod: (period: Omit<BlockedPeriod, 'id' | 'createdAt'>) => BlockedPeriod;

  /** Remove a blocked period by ID. */
  removeBlockedPeriod: (id: string) => boolean;

  /** Get all blocked periods for a specific court. */
  getBlockedPeriodsForCourt: (courtId: string) => BlockedPeriod[];

  /** Get all blocked periods for a specific court and date. */
  getBlockedPeriodsForCourtDate: (courtId: string, date: string) => BlockedPeriod[];
}

export const useBlockedPeriodStore = create<BlockedPeriodStoreState>()(
  persist(
    (set, get) => ({
      blockedPeriods: [],

      addBlockedPeriod: (period) => {
        const newPeriod: BlockedPeriod = {
          ...period,
          id: `bp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
        };
        set({ blockedPeriods: [...get().blockedPeriods, newPeriod] });
        return newPeriod;
      },

      removeBlockedPeriod: (id) => {
        const before = get().blockedPeriods.length;
        set({ blockedPeriods: get().blockedPeriods.filter((bp) => bp.id !== id) });
        return get().blockedPeriods.length < before;
      },

      getBlockedPeriodsForCourt: (courtId) => {
        return get().blockedPeriods.filter((bp) => bp.courtId === courtId);
      },

      getBlockedPeriodsForCourtDate: (courtId, date) => {
        return get().blockedPeriods.filter((bp) => bp.courtId === courtId && bp.date === date);
      },
    }),
    {
      name: 'khub-blocked-periods',
      version: 1,
    }
  )
);
