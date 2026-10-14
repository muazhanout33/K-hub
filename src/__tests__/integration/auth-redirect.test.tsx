import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRouter, usePathname } from 'next/navigation';

vi.mock('@/services/auth.service', () => ({
  getCurrentUser: vi.fn(),
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  updateUserProfile: vi.fn(),
}));

import { useAuthStore } from '@/features/auth/useAuthStore';
import { sanitizeNextPath, useGuestGuard } from '@/hooks/useGuestGuard';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import * as authService from '@/services/auth.service';
import type { User } from '@/types';

const ADMIN_USER: User = {
  id: 'admin-1',
  name: 'Admin One',
  email: 'admin@test.com',
  phone: '+201000000000',
  role: 'Admin',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const MEMBER_USER: User = {
  ...ADMIN_USER,
  id: 'user-1',
  name: 'Member One',
  email: 'member@test.com',
  role: 'User',
};

type RouterMock = {
  push: ReturnType<typeof vi.fn>;
  replace: ReturnType<typeof vi.fn>;
  back: ReturnType<typeof vi.fn>;
  forward: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  prefetch: ReturnType<typeof vi.fn>;
};

let router: RouterMock;

function resetStore() {
  act(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, _hasHydrated: false });
  });
}

function seedStaleLocalStorage(user: User) {
  vi.mocked(window.localStorage.getItem).mockReturnValue(
    JSON.stringify({ state: { user, isAuthenticated: true }, version: 0 })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };
  vi.mocked(useRouter).mockReturnValue(router as never);
  vi.mocked(usePathname).mockReturnValue('/');
  vi.mocked(window.localStorage.getItem).mockReturnValue(null);
  resetStore();
});

describe('sanitizeNextPath — strict validation of untrusted `next` values', () => {
  it('accepts safe internal paths', () => {
    expect(sanitizeNextPath('/admin')).toBe('/admin');
    expect(sanitizeNextPath('/book')).toBe('/book');
    expect(sanitizeNextPath('/')).toBe('/');
    expect(sanitizeNextPath('/courts/123?tab=info#top')).toBe('/courts/123?tab=info#top');
    expect(sanitizeNextPath('/auth/login?next=%2Fadmin')).toBe('/auth/login?next=%2Fadmin');
  });

  it('rejects absolute URLs and scheme-looking values', () => {
    expect(sanitizeNextPath('https://evil.com')).toBeNull();
    expect(sanitizeNextPath('http://evil.com')).toBeNull();
    expect(sanitizeNextPath('javascript:alert(1)')).toBeNull();
    expect(sanitizeNextPath('/https://evil.com')).toBeNull();
    expect(sanitizeNextPath('admin')).toBeNull();
  });

  it('rejects protocol-relative and backslash tricks', () => {
    expect(sanitizeNextPath('//evil.com')).toBeNull();
    expect(sanitizeNextPath('///evil.com')).toBeNull();
    expect(sanitizeNextPath('/\\evil.com')).toBeNull();
    expect(sanitizeNextPath('/foo\\..\\bar')).toBeNull();
    expect(sanitizeNextPath('/%2F%2Fevil.com')).toBeNull();
    expect(sanitizeNextPath('/%5C%5Cevil.com')).toBeNull();
  });

  it('rejects malformed, oversized, empty, or non-string values', () => {
    expect(sanitizeNextPath('/foo%2')).toBeNull(); // malformed percent-encoding
    expect(sanitizeNextPath('')).toBeNull();
    expect(sanitizeNextPath(null)).toBeNull();
    expect(sanitizeNextPath(undefined)).toBeNull();
    expect(sanitizeNextPath(42)).toBeNull();
    expect(sanitizeNextPath('/' + 'a'.repeat(600))).toBeNull();
    expect(sanitizeNextPath('/book\nx')).toBeNull();
    expect(sanitizeNextPath('/book x')).toBeNull();
    expect(sanitizeNextPath(' /admin')).toBeNull();
  });
});

describe('auth hydration race — guards never decide on stale localStorage', () => {
  it('rehydrate prefills user but does NOT flip _hasHydrated (guards stay gated)', async () => {
    seedStaleLocalStorage(ADMIN_USER);

    await act(async () => {
      await useAuthStore.persist.rehydrate();
    });

    expect(useAuthStore.getState().user?.email).toBe(ADMIN_USER.email); // optimistic paint
    expect(useAuthStore.getState()._hasHydrated).toBe(false); // guards still waiting
  });

  it('initSession with no server session: hydrated flips, stale user is cleared (no false auth)', async () => {
    seedStaleLocalStorage(ADMIN_USER);
    await act(async () => {
      await useAuthStore.persist.rehydrate();
    });
    expect(useAuthStore.getState()._hasHydrated).toBe(false);

    vi.mocked(authService.getCurrentUser).mockResolvedValue(null);
    await act(async () => {
      await useAuthStore.getState().initSession();
    });

    expect(useAuthStore.getState()._hasHydrated).toBe(true);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('initSession with a valid server session: hydrated flips with the verified user', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(ADMIN_USER);
    await act(async () => {
      await useAuthStore.getState().initSession();
    });

    expect(useAuthStore.getState()._hasHydrated).toBe(true);
    expect(useAuthStore.getState().user?.role).toBe('Admin');
  });

  it('initSession failure path also flips hydrated (guards cannot get stuck)', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('network down'));
    await act(async () => {
      await useAuthStore.getState().initSession();
    });

    expect(useAuthStore.getState()._hasHydrated).toBe(true);
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('useGuestGuard — no redirect loop to /book from stale state', () => {
  it('does not redirect while unverified (stale user present, hydrated=false)', async () => {
    seedStaleLocalStorage(ADMIN_USER);
    await act(async () => {
      await useAuthStore.persist.rehydrate();
    });

    renderHook(() => useGuestGuard('/book'));

    expect(router.replace).not.toHaveBeenCalled();
  });

  it('after verification finds no session: still no redirect (stays on login, no /book loop)', async () => {
    seedStaleLocalStorage(ADMIN_USER);
    await act(async () => {
      await useAuthStore.persist.rehydrate();
    });

    vi.mocked(authService.getCurrentUser).mockResolvedValue(null);
    renderHook(() => useGuestGuard('/book'));

    await act(async () => {
      await useAuthStore.getState().initSession();
    });

    await waitFor(() => expect(useAuthStore.getState()._hasHydrated).toBe(true));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('redirects a genuinely authenticated user to the SAFE target only', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(ADMIN_USER);
    await act(async () => {
      await useAuthStore.getState().initSession();
    });

    renderHook(() => useGuestGuard('/book'));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/book');
  });

  it('sanitizes an unsafe redirectTo at the guard choke point (falls back to /)', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(ADMIN_USER);
    await act(async () => {
      await useAuthStore.getState().initSession();
    });

    renderHook(() => useGuestGuard('https://evil.com'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

describe('useAdminGuard — destination preservation and denial', () => {
  it('verified admin: no redirect (renders without login bounce)', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(ADMIN_USER);
    await act(async () => {
      await useAuthStore.getState().initSession();
    });

    renderHook(() => useAdminGuard());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('verified non-admin: denied to /', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(MEMBER_USER);
    await act(async () => {
      await useAuthStore.getState().initSession();
    });

    renderHook(() => useAdminGuard());
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('no session: redirects to login carrying a sanitized ?next=<current path>', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(null);
    vi.mocked(usePathname).mockReturnValue('/admin');
    await act(async () => {
      await useAuthStore.getState().initSession();
    });

    renderHook(() => useAdminGuard());
    expect(router.replace).toHaveBeenCalledWith('/auth/login?next=%2Fadmin');
  });

  it('waits for verification before deciding (hydrated=false → no redirect yet)', async () => {
    renderHook(() => useAdminGuard());
    expect(router.replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState()._hasHydrated).toBe(false);
  });
});
