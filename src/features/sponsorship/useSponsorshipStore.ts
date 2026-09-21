import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SponsorshipRequest, SponsorshipResult } from '@/types';
import {
  createSponsorshipRequest,
  syncSponsorshipRequests,
  CreateSponsorshipRequestInput,
} from '@/services/sponsorship.service';

interface SponsorshipStoreState {
  requests: SponsorshipRequest[];

  /**
   * Creates a new sponsorship request via the service layer.
   * Validates all fields and target reference before persisting.
   * Returns a structured result — components never touch localStorage directly.
   */
  createRequest: (data: CreateSponsorshipRequestInput) => Promise<SponsorshipResult>;

  /**
   * Returns only Approved + isActive requests for the public /sponsors page.
   * In Phase 6 this always returns [] — correct expected state.
   */
  getPublicSponsors: () => SponsorshipRequest[];
}

export const useSponsorshipStore = create<SponsorshipStoreState>()(
  persist(
    (set, get) => ({
      requests: [],

      createRequest: async (data) => {
        const result = await createSponsorshipRequest(data);

        if (result.success && result.request) {
          set({ requests: [result.request, ...get().requests] });
        }

        return result;
      },

      getPublicSponsors: () =>
        get().requests.filter((r) => r.status === 'Approved' && r.isActive === true),
    }),
    {
      name: 'khub-sponsorship-storage',
      version: 1,
      partialize: (state) => ({
        requests: state.requests,
      }),
      skipHydration: true,
      onRehydrateStorage: () => {
        return (state) => {
          if (state?.requests) {
            // Sync rehydrated persisted data into the service-layer in-memory array
            // so that overlap and target validation sees real historical requests.
            syncSponsorshipRequests(state.requests);
          }
        };
      },
    }
  )
);
