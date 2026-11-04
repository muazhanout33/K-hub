import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock Supabase client
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

import { useNotificationStore } from '@/features/notifications/useNotificationStore';

describe('useNotificationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset zustand persist state between tests
    useNotificationStore.setState({
      notifications: [],
      soundEnabled: true,
      pendingSoundIds: [],
    });
  });

  describe('Initial State', () => {
    it('has empty notifications', () => {
      const { result } = renderHook(() => useNotificationStore());
      expect(result.current.notifications).toEqual([]);
    });

    it('has sound enabled by default', () => {
      const { result } = renderHook(() => useNotificationStore());
      expect(result.current.soundEnabled).toBe(true);
    });
  });

  describe('toggleSound', () => {
    it('toggles sound from true to false', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.toggleSound();
      });

      expect(result.current.soundEnabled).toBe(false);
    });

    it('toggles sound from false to true', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.toggleSound();
      });

      act(() => {
        result.current.toggleSound();
      });

      expect(result.current.soundEnabled).toBe(true);
    });
  });

  describe('addNotification', () => {
    it('adds a notification to the store', () => {
      const { result } = renderHook(() => useNotificationStore());

      let notification;
      act(() => {
        notification = result.current.addNotification(
          'new_booking',
          'New Booking',
          'You have a new booking',
          'user-1'
        );
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe('new_booking');
      expect(result.current.notifications[0].title).toBe('New Booking');
      expect(result.current.notifications[0].message).toBe('You have a new booking');
      expect(result.current.notifications[0].userId).toBe('user-1');
      expect(result.current.notifications[0].isRead).toBe(false);
    });

    it('returns the created notification', () => {
      const { result } = renderHook(() => useNotificationStore());

      let notification: { id: string; userId: string; type: string; title: string; message: string; isRead: boolean; createdAt: string } | undefined;
      act(() => {
        notification = result.current.addNotification(
          'new_booking',
          'New Booking',
          'You have a new booking',
          'user-1'
        );
      });

      expect(notification).toBeDefined();
      expect(notification!.id).toContain('notif-');
    });
  });

  describe('getNotificationsForUser', () => {
    it('returns notifications for a specific user', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.addNotification('new_booking', 'Booking 1', 'Message 1', 'user-1');
        result.current.addNotification('booking_confirmed', 'Booking 2', 'Message 2', 'user-2');
        result.current.addNotification('new_booking', 'Booking 3', 'Message 3', 'user-1');
      });

      const user1Notifications = result.current.getNotificationsForUser('user-1');
      expect(user1Notifications).toHaveLength(2);

      const user2Notifications = result.current.getNotificationsForUser('user-2');
      expect(user2Notifications).toHaveLength(1);
    });

    it('returns empty array for user with no notifications', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.addNotification('new_booking', 'Booking', 'Message', 'user-1');
      });

      const notifications = result.current.getNotificationsForUser('user-999');
      expect(notifications).toHaveLength(0);
    });
  });

  describe('unreadCount', () => {
    it('counts unread notifications for a user', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.addNotification('new_booking', 'Booking 1', 'Message 1', 'user-1');
        result.current.addNotification('new_booking', 'Booking 2', 'Message 2', 'user-1');
      });

      expect(result.current.unreadCount('user-1')).toBe(2);
    });

    it('returns 0 when all notifications are read', () => {
      const { result } = renderHook(() => useNotificationStore());

      let notification1;
      let notification2;

      act(() => {
        notification1 = result.current.addNotification('new_booking', 'Booking 1', 'Message 1', 'user-1');
        notification2 = result.current.addNotification('new_booking', 'Booking 2', 'Message 2', 'user-1');
      });

      act(() => {
        result.current.markAsRead(notification1!.id);
        result.current.markAsRead(notification2!.id);
      });

      expect(result.current.unreadCount('user-1')).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('marks a notification as read', () => {
      const { result } = renderHook(() => useNotificationStore());

      let notification;
      act(() => {
        notification = result.current.addNotification('new_booking', 'Booking', 'Message', 'user-1');
      });

      expect(result.current.notifications[0].isRead).toBe(false);

      act(() => {
        result.current.markAsRead(notification!.id);
      });

      expect(result.current.notifications[0].isRead).toBe(true);
    });
  });

  describe('markAllAsRead', () => {
    it('marks all notifications as read for a user', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.addNotification('new_booking', 'Booking 1', 'Message 1', 'user-1');
        result.current.addNotification('new_booking', 'Booking 2', 'Message 2', 'user-1');
        result.current.addNotification('new_booking', 'Booking 3', 'Message 3', 'user-2');
      });

      act(() => {
        result.current.markAllAsRead('user-1');
      });

      const user1Notifications = result.current.getNotificationsForUser('user-1');
      expect(user1Notifications.every((n) => n.isRead)).toBe(true);

      // user-2's notifications should remain unread
      const user2Notifications = result.current.getNotificationsForUser('user-2');
      expect(user2Notifications.every((n) => !n.isRead)).toBe(true);
    });
  });

  describe('deleteNotification', () => {
    it('removes a notification from the store', () => {
      const { result } = renderHook(() => useNotificationStore());

      let notification;
      act(() => {
        notification = result.current.addNotification('new_booking', 'Booking', 'Message', 'user-1');
      });

      expect(result.current.notifications).toHaveLength(1);

      act(() => {
        result.current.deleteNotification(notification!.id);
      });

      expect(result.current.notifications).toHaveLength(0);
    });
  });

  describe('clearAll', () => {
    it('removes all notifications for a user', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.addNotification('new_booking', 'Booking 1', 'Message 1', 'user-1');
        result.current.addNotification('new_booking', 'Booking 2', 'Message 2', 'user-1');
        result.current.addNotification('new_booking', 'Booking 3', 'Message 3', 'user-2');
      });

      act(() => {
        result.current.clearAll('user-1');
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].userId).toBe('user-2');
    });
  });

  describe('clearNotifications', () => {
    it('clears all notifications and state', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.addNotification('new_booking', 'Booking', 'Message', 'user-1');
      });

      act(() => {
        result.current.clearNotifications();
      });

      expect(result.current.notifications).toEqual([]);
    });

    it('also drains the pending sound queue (no stale sounds after logout)', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.enqueueSound('n-1');
        result.current.enqueueSound('n-2');
      });
      expect(result.current.pendingSoundIds).toHaveLength(2);

      act(() => {
        result.current.clearNotifications();
      });

      expect(result.current.pendingSoundIds).toEqual([]);
    });
  });

  // ── Sound gating queue (no sound on refresh, no duplicates) ──
  describe('pendingSoundIds queue', () => {
    it('starts empty (refresh / initial fetch is always silent)', () => {
      const { result } = renderHook(() => useNotificationStore());
      expect(result.current.pendingSoundIds).toEqual([]);
    });

    it('enqueueSound adds an id once (deduped)', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.enqueueSound('n-1');
        result.current.enqueueSound('n-1');
        result.current.enqueueSound('n-2');
      });

      expect(result.current.pendingSoundIds).toEqual(['n-1', 'n-2']);
    });

    it('enqueueSound ignores empty ids', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.enqueueSound('');
      });

      expect(result.current.pendingSoundIds).toEqual([]);
    });

    it('consumePendingSounds drains the queue exactly once', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.enqueueSound('n-1');
        result.current.enqueueSound('n-2');
      });

      let drained: string[] = [];
      act(() => {
        drained = result.current.consumePendingSounds();
      });

      expect(drained).toEqual(['n-1', 'n-2']);
      // Second drain is empty → the sound can never replay.
      expect(result.current.consumePendingSounds()).toEqual([]);
      expect(result.current.pendingSoundIds).toEqual([]);
    });

    it('addNotification enqueues its own optimistic id for a sound', () => {
      const { result } = renderHook(() => useNotificationStore());

      let created: { id: string } | undefined;
      act(() => {
        created = result.current.addNotification(
          'booking_confirmed',
          'Booking Confirmed',
          'Paid',
          'user-1'
        );
      });

      expect(result.current.pendingSoundIds).toContain(created!.id);
    });

    it('consuming after addNotification prevents a replay', () => {
      const { result } = renderHook(() => useNotificationStore());

      act(() => {
        result.current.addNotification(
          'booking_confirmed',
          'Booking Confirmed',
          'Paid',
          'user-1'
        );
      });

      act(() => {
        result.current.consumePendingSounds();
      });

      expect(result.current.pendingSoundIds).toEqual([]);
      expect(result.current.consumePendingSounds()).toEqual([]);
    });
  });
});
