import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AdvertisingSpace, AdvertisementRequest, AdvertisementRequestResult } from '@/types';
import {
  createAdvertisementRequest,
  getAvailableAdvertisingSpaces,
  syncAdvertisementRequests,
  CreateAdvertisementRequestInput,
} from '@/services/advertisement.service';

interface AdvertisementStoreState {
  requests: AdvertisementRequest[];

  /**
   * Creates a new advertisement request via the service layer.
   * Validates space, dates, budget, and overlap before persisting.
   * Returns a structured result — components never touch localStorage directly.
   */
  createRequest: (data: CreateAdvertisementRequestInput) => AdvertisementRequestResult;

  /**
   * Returns advertising spaces with isAvailable = true.
   * Delegates to the service — single source of truth for space data.
   */
  getAvailableSpaces: () => AdvertisingSpace[];
}

export const useAdvertisementStore = create<AdvertisementStoreState>()(
  persist(
    (set, get) => ({
      requests: [],

      createRequest: (data) => {
        const result = createAdvertisementRequest(data);

        if (result.success && result.request) {
          set({ requests: [result.request, ...get().requests] });
        }

        return result;
      },

      getAvailableSpaces: () => getAvailableAdvertisingSpaces(),
    }),
    {
      name: 'khub-advertisement-storage',
      version: 1,
      partialize: (state) => ({
        requests: state.requests,
      }),
      skipHydration: true,
      onRehydrateStorage: () => {
        return (state) => {
          if (state?.requests) {
            // Sync rehydrated persisted data into the service-layer in-memory array
            // so that the overlap check sees real historical requests after page reload.
            syncAdvertisementRequests(state.requests);
          }
        };
      },
    }
  )
);
