import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock only the audio output — the store stays real so we test the
// actual gating pipeline (queue → drain → filter → play).
vi.mock('@/lib/audio', () => ({
  playNotificationSound: vi.fn(),
}));

// Mock Supabase client (external I/O)
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      then: vi.fn(),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  })),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { useNotificationSound } from '@/hooks/useNotificationSound';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';
import { playNotificationSound } from '@/lib/audio';

const playMock = vi.mocked(playNotificationSound);

describe('useNotificationSound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationStore.setState({
      notifications: [],
      soundEnabled: true,
      pendingSoundIds: [],
    });
  });

  it('never plays on mount / refresh (queue starts empty)', () => {
    renderHook(() => useNotificationSound());
    expect(playMock).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().pendingSoundIds).toEqual([]);
  });

  it('plays exactly ONCE for a batch of new sound-type notifications', () => {
    renderHook(() => useNotificationSound());

    act(() => {
      const store = useNotificationStore.getState();
      store.addNotification('booking_confirmed', 'Confirmed', 'm', 'user-1');
      store.addNotification('payment_successful', 'Paid', 'm', 'user-1');
      store.addNotification('booking_cancelled', 'Cancelled', 'm', 'user-1');
    });

    // One call per batch — the audio module coalesces the rest.
    expect(playMock).toHaveBeenCalledTimes(1);
    // Queue fully drained → no replay on later renders.
    expect(useNotificationStore.getState().pendingSoundIds).toEqual([]);
  });

  it('does not play for non-sound notification types', () => {
    renderHook(() => useNotificationSound());

    act(() => {
      useNotificationStore
        .getState()
        .addNotification('info', 'Info', 'm', 'user-1');
      useNotificationStore
        .getState()
        .addNotification('promo_offer', 'Promo', 'm', 'user-1');
      useNotificationStore
        .getState()
        .addNotification('new_booking', 'New', 'm', 'user-1');
    });

    expect(playMock).not.toHaveBeenCalled();
    // Still drained so nothing leaks into a later batch.
    expect(useNotificationStore.getState().pendingSoundIds).toEqual([]);
  });

  it('plays for a sound type mixed with non-sound types', () => {
    renderHook(() => useNotificationSound());

    act(() => {
      const store = useNotificationStore.getState();
      store.addNotification('info', 'Info', 'm', 'user-1');
      store.addNotification('booking_reminder', 'Reminder', 'm', 'user-1');
    });

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('drains the queue while MUTED and does not burst on re-enable', () => {
    useNotificationStore.setState({ soundEnabled: false });
    renderHook(() => useNotificationSound());

    act(() => {
      useNotificationStore
        .getState()
        .addNotification('booking_confirmed', 'Confirmed', 'm', 'user-1');
    });

    // No sound while muted…
    expect(playMock).not.toHaveBeenCalled();
    // …but the queue was consumed, so re-enabling cannot replay it.
    expect(useNotificationStore.getState().pendingSoundIds).toEqual([]);

    act(() => {
      useNotificationStore.setState({ soundEnabled: true });
    });
    expect(playMock).not.toHaveBeenCalled();
  });

  it('skips stale IDs that no longer exist in the store', () => {
    renderHook(() => useNotificationSound());

    act(() => {
      useNotificationStore.setState({
        notifications: [
          {
            id: 'real-1',
            userId: 'user-1',
            type: 'booking_confirmed',
            title: 't',
            message: 'm',
            isRead: false,
            createdAt: new Date().toISOString(),
          },
        ],
        // 'ghost' was dropped by a refetch/merge — must not crash or play.
        pendingSoundIds: ['ghost-1'],
      });
    });

    expect(playMock).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().pendingSoundIds).toEqual([]);
  });

  it('does not double-play across re-renders', () => {
    const { rerender } = renderHook(() => useNotificationSound());

    act(() => {
      useNotificationStore
        .getState()
        .addNotification('booking_confirmed', 'Confirmed', 'm', 'user-1');
    });
    expect(playMock).toHaveBeenCalledTimes(1);

    // Re-render with the same state must not replay.
    rerender();
    rerender();
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('plays again for a genuinely NEW notification later', () => {
    renderHook(() => useNotificationSound());

    act(() => {
      useNotificationStore
        .getState()
        .addNotification('booking_confirmed', 'One', 'm', 'user-1');
    });
    act(() => {
      useNotificationStore
        .getState()
        .addNotification('payment_successful', 'Two', 'm', 'user-1');
    });

    expect(playMock).toHaveBeenCalledTimes(2);
  });
});
