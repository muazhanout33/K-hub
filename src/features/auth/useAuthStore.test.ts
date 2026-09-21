import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock auth service
vi.mock('@/services/auth.service', () => ({
  getCurrentUser: vi.fn(),
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  updateUserProfile: vi.fn(),
}));

// Mock other stores that logout calls
vi.mock('@/features/booking/useBookingStore', () => ({
  useBookingStore: {
    getState: vi.fn(() => ({
      resetBookingFlow: vi.fn(),
    })),
  },
}));

vi.mock('@/features/payment/usePaymentStore', () => ({
  usePaymentStore: {
    getState: vi.fn(() => ({
      clearPayments: vi.fn(),
    })),
  },
}));

vi.mock('@/features/notifications/useNotificationStore', () => ({
  useNotificationStore: {
    getState: vi.fn(() => ({
      clearNotifications: vi.fn(),
    })),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { useAuthStore } from '@/features/auth/useAuthStore';
import * as authService from '@/services/auth.service';

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      useAuthStore.setState({ user: null, isAuthenticated: false, _hasHydrated: false });
    });
  });

  describe('Initial State', () => {
    it('has no user initially', () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.user).toBeNull();
    });

    it('is not authenticated initially', () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('has not hydrated initially', () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current._hasHydrated).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears user and isAuthenticated on logout', async () => {
      // Set up a logged-in state first
      act(() => {
        useAuthStore.setState({
          user: { id: 'user-1', name: 'Test', email: 'test@test.com', phone: '123', role: 'Guest', createdAt: '2026-01-01T00:00:00Z' },
          isAuthenticated: true,
        });
      });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(authService.logoutUser).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('sets user on successful login', async () => {
      const mockUser = { id: 'user-1', name: 'Test', email: 'test@test.com', phone: '123', role: 'Guest' as const, createdAt: '2026-01-01T00:00:00Z' };
      vi.mocked(authService.loginUser).mockResolvedValue({ success: true, user: mockUser });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('test@test.com', 'password');
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('does not set user on failed login', async () => {
      vi.mocked(authService.loginUser).mockResolvedValue({ success: false, error: 'Invalid credentials' });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('test@test.com', 'wrongpassword');
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('register', () => {
    it('sets user on successful registration', async () => {
      const mockUser = { id: 'user-2', name: 'New User', email: 'new@test.com', phone: '456', role: 'Guest' as const, createdAt: '2026-01-01T00:00:00Z' };
      vi.mocked(authService.registerUser).mockResolvedValue({ success: true, user: mockUser });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.register('New User', 'new@test.com', '456', 'password');
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });
});
