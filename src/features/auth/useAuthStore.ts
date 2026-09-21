import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';
import * as authService from '@/services/auth.service';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** Whether Zustand has rehydrated from localStorage / Supabase session. */
  _hasHydrated: boolean;
  /** Initialize session from Supabase Auth on app mount. */
  initSession: () => Promise<void>;
  /** Register a new user with Supabase Auth. */
  register: (
    name: string,
    email: string,
    phone: string,
    password: string
  ) => Promise<authService.AuthResult>;
  /** Login with email + password via Supabase Auth. */
  login: (email: string, password: string) => Promise<authService.AuthResult>;
  /** Clear session from Supabase Auth & reset local state. */
  logout: () => Promise<void>;
  /** Update user profile fields in Supabase profiles table. */
  updateProfile: (updates: { name?: string; phone?: string }) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      _hasHydrated: false,

      initSession: async () => {
        try {
          const user = await authService.getCurrentUser();
          set({
            user,
            isAuthenticated: !!user,
            _hasHydrated: true,
          });
        } catch {
          set({
            user: null,
            isAuthenticated: false,
            _hasHydrated: true,
          });
        }
      },

      register: async (name, email, phone, password) => {
        const result = await authService.registerUser(name, email, phone, password);
        if (result.success && result.user) {
          set({
            user: result.user,
            isAuthenticated: true,
          });
        }
        return result;
      },

      login: async (email, password) => {
        const result = await authService.loginUser(email, password);
        if (result.success && result.user) {
          set({
            user: result.user,
            isAuthenticated: true,
          });
        }
        return result;
      },

      logout: async () => {
        await authService.logoutUser();
        // Clear all stores on logout
        useBookingStore.getState().resetBookingFlow();
        usePaymentStore.getState().clearPayments();
        useNotificationStore.getState().clearNotifications();
        set({ user: null, isAuthenticated: false });
      },

      updateProfile: async (updates) => {
        const { user } = get();
        if (!user) return;
        const success = await authService.updateUserProfile(updates);
        if (success) {
          set({
            user: {
              ...user,
              name: updates.name ?? user.name,
              phone: updates.phone ?? user.phone,
            },
          });
        }
      },
    }),
    {
      name: 'khub-auth-storage',
      skipHydration: true,

      onRehydrateStorage: () => {
        return () => {
          useAuthStore.setState({ _hasHydrated: true });
        };
      },
    }
  )
);
