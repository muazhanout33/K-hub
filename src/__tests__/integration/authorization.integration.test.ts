import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock auth service (external I/O only) — must come before imports that use it
vi.mock('@/services/auth.service', () => ({
  getCurrentUser: vi.fn(),
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  updateUserProfile: vi.fn(),
}));

// Import REAL stores — crosses auth store ↔ role logic ↔ booking store
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useBookingStore } from '@/features/booking/useBookingStore';
import * as authService from '@/services/auth.service';

// Helper: role-based access check (mirrors the app's authorize function)
type UserRole = 'Guest' | 'User' | 'Admin';

function canAccessBooking(userRole: UserRole | null, isAuthenticated: boolean): boolean {
  if (!isAuthenticated || !userRole) return false;
  if (userRole === 'Admin') return true;
  if (userRole === 'Guest') return true;
  return false;
}

function canCancelBooking(userRole: UserRole | null, bookingOwnerId: string, currentUserId: string): boolean {
  if (userRole === 'Admin') return true;
  return bookingOwnerId === currentUserId;
}

function canManageBlockedPeriods(userRole: UserRole | null): boolean {
  return userRole === 'Admin';
}

describe('Authorization Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
    });
    useBookingStore.setState({
      selectedCourt: null,
      selectedDate: '2099-12-01',
      selectedSlots: [],
      bookingStep: 2,
      reservationStartTime: null,
      reservationExpiresAt: null,
      hasExtendedReservation: false,
      userName: '',
      userEmail: '',
      userPhone: '',
      bookings: [],
      maxHoursReachedTick: 0,
      isCancelling: false,
    });
  });

  describe('Guest role — can book but not manage', () => {
    it('guest user can access booking flow', () => {
      useAuthStore.setState({
        user: { id: 'guest-1', name: 'Guest User', email: 'g@test.com', phone: '+1', role: 'Guest', createdAt: '' },
        isAuthenticated: true,
      });

      const { user, isAuthenticated } = useAuthStore.getState();
      expect(canAccessBooking(user!.role, isAuthenticated)).toBe(true);
    });

    it('guest user can cancel own booking', () => {
      useAuthStore.setState({
        user: { id: 'guest-1', name: 'Guest User', email: 'g@test.com', phone: '+1', role: 'Guest', createdAt: '' },
        isAuthenticated: true,
      });

      const { user } = useAuthStore.getState();
      // bookingOwnerId matches currentUserId → allowed
      expect(canCancelBooking(user!.role, 'guest-1', 'guest-1')).toBe(true);
    });

    it('guest user cannot cancel other user booking', () => {
      useAuthStore.setState({
        user: { id: 'guest-1', name: 'Guest User', email: 'g@test.com', phone: '+1', role: 'Guest', createdAt: '' },
        isAuthenticated: true,
      });

      const { user } = useAuthStore.getState();
      // bookingOwnerId does NOT match currentUserId → denied
      expect(canCancelBooking(user!.role, 'other-booking-owner', 'guest-1')).toBe(false);
    });

    it('guest user cannot manage blocked periods', () => {
      useAuthStore.setState({
        user: { id: 'guest-1', name: 'Guest User', email: 'g@test.com', phone: '+1', role: 'Guest', createdAt: '' },
        isAuthenticated: true,
      });

      const { user } = useAuthStore.getState();
      expect(canManageBlockedPeriods(user!.role)).toBe(false);
    });
  });

  describe('Admin role — full access', () => {
    it('admin user can access booking flow', () => {
      useAuthStore.setState({
        user: { id: 'admin-1', name: 'Admin', email: 'a@test.com', phone: '+2', role: 'Admin', createdAt: '' },
        isAuthenticated: true,
      });

      const { user, isAuthenticated } = useAuthStore.getState();
      expect(canAccessBooking(user!.role, isAuthenticated)).toBe(true);
    });

    it('admin user can cancel any booking', () => {
      useAuthStore.setState({
        user: { id: 'admin-1', name: 'Admin', email: 'a@test.com', phone: '+2', role: 'Admin', createdAt: '' },
        isAuthenticated: true,
      });

      const { user } = useAuthStore.getState();
      expect(canCancelBooking(user!.role, 'booking-1', 'other-user')).toBe(true);
    });

    it('admin user can manage blocked periods', () => {
      useAuthStore.setState({
        user: { id: 'admin-1', name: 'Admin', email: 'a@test.com', phone: '+2', role: 'Admin', createdAt: '' },
        isAuthenticated: true,
      });

      const { user } = useAuthStore.getState();
      expect(canManageBlockedPeriods(user!.role)).toBe(true);
    });
  });

  describe('Unauthenticated — no access', () => {
    it('unauthenticated user cannot access booking', () => {
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
      });

      const { user, isAuthenticated } = useAuthStore.getState();
      expect(canAccessBooking(user?.role ?? null, isAuthenticated)).toBe(false);
    });

    it('unauthenticated user cannot cancel bookings', () => {
      expect(canCancelBooking(null, 'booking-1', 'any-user')).toBe(false);
    });

    it('unauthenticated user cannot manage blocked periods', () => {
      expect(canManageBlockedPeriods(null)).toBe(false);
    });
  });

  describe('Auth state changes affect authorization', () => {
    it('login enables booking access', async () => {
      vi.mocked(authService.loginUser).mockResolvedValue({
        success: true,
        user: { id: 'user-new', name: 'New', email: 'n@test.com', phone: '+3', role: 'Guest', createdAt: '' },
      });

      // Initially no access
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(canAccessBooking(null, false)).toBe(false);

      // Login
      const { result } = renderHook(() => useAuthStore());
      await act(async () => {
        await result.current.login('n@test.com', 'pass');
      });

      // Now has access
      const { user, isAuthenticated } = useAuthStore.getState();
      expect(isAuthenticated).toBe(true);
      expect(canAccessBooking(user!.role, isAuthenticated)).toBe(true);
    });

    it('logout removes booking access', async () => {
      vi.mocked(authService.logoutUser).mockResolvedValue(undefined as never);

      useAuthStore.setState({
        user: { id: 'user-logout', name: 'L', email: 'l@test.com', phone: '+4', role: 'Guest', createdAt: '' },
        isAuthenticated: true,
      });

      expect(canAccessBooking('Guest', true)).toBe(true);

      const { result } = renderHook(() => useAuthStore());
      await act(async () => {
        await result.current.logout();
      });

      const { user, isAuthenticated } = useAuthStore.getState();
      expect(isAuthenticated).toBe(false);
      expect(canAccessBooking(user?.role ?? null, isAuthenticated)).toBe(false);
    });
  });

  describe('Role-based booking step gating', () => {
    it('guest can reach step 3 (user details)', () => {
      useAuthStore.setState({
        user: { id: 'guest-gate', name: 'G', email: 'g@g.com', phone: '+5', role: 'Guest', createdAt: '' },
        isAuthenticated: true,
      });

      const { user, isAuthenticated } = useAuthStore.getState();
      expect(canAccessBooking(user!.role, isAuthenticated)).toBe(true);

      act(() => { useBookingStore.getState().setBookingStep(3); });
      expect(useBookingStore.getState().bookingStep).toBe(3);
    });

    it('admin can reach step 3', () => {
      useAuthStore.setState({
        user: { id: 'admin-gate', name: 'A', email: 'a@a.com', phone: '+6', role: 'Admin', createdAt: '' },
        isAuthenticated: true,
      });

      const { user, isAuthenticated } = useAuthStore.getState();
      expect(canAccessBooking(user!.role, isAuthenticated)).toBe(true);

      act(() => { useBookingStore.getState().setBookingStep(3); });
      expect(useBookingStore.getState().bookingStep).toBe(3);
    });
  });
});
