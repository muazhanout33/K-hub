import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Notification, NotificationType } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { mapDbNotificationToNotification } from '@/lib/mappers';
import { DbNotification } from '@/types/database.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface NotificationState {
  notifications: Notification[];
  soundEnabled: boolean;

  /**
   * Transient (never persisted) queue of notification IDs that should
   * play a sound once. Populated only when a notification actually
   * ARRIVES (realtime INSERT or optimistic add) — never by initial
   * fetch or background refetch, so refreshes are always silent.
   * Drained by `useNotificationSound` via `consumePendingSounds`.
   */
  pendingSoundIds: string[];

  /** Initialize notifications for user from Supabase and subscribe to Realtime. */
  initNotifications: (userId: string) => Promise<void>;

  /**
   * @deprecated Use Server Actions (createNotificationAction / createBookingNotificationAction)
   * for persistent notifications. This method remains for transient local-only UI feedback.
   */
  addNotification: (
    type: NotificationType,
    title: string,
    message: string,
    userId: string,
    relatedBookingId?: string
  ) => Notification;

  /**
   * Directly ingest a server-confirmed notification into local state,
   * triggering UI updates and audible chime immediately without waiting
   * for the Supabase Realtime WebSocket round-trip.
   */
  addServerNotification: (notification: Notification) => void;

  /** Queue an ID for one sound play (dedupes existing IDs). */
  enqueueSound: (id: string) => void;

  /** Return and clear the pending sound queue. */
  consumePendingSounds: () => string[];

  toggleSound: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: (userId: string) => Promise<void>;
  getNotificationsForUser: (userId: string) => Notification[];
  unreadCount: (userId: string) => number;

  /** Clear all client state and unsubscribe from Realtime. Called on logout. */
  clearNotifications: () => void;
}

let idCounter = 1000;
let realtimeChannel: RealtimeChannel | null = null;

/** User the current Realtime subscription belongs to. */
let currentUserId: string | null = null;
/** Reconnect backoff state (1s → 30s exponential). */
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
/** True once the first server fetch of this session has completed. */
let hasFetchedOnce = false;
/** True while global online/visibility listeners are installed. */
let globalListenersInstalled = false;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

function sortNotifications(list: Notification[]): Notification[] {
  return [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Merge server rows into local state.
 * - `keepLocalOnly`: entries that exist only locally (optimistic /
 *   not yet persisted) survive; server wins for shared IDs.
 */
function mergeServerRows(
  state: NotificationState,
  remote: Notification[],
  keepLocalOnly: boolean
): Partial<NotificationState> {
  const remoteIds = new Set(remote.map((n) => n.id));
  const localOnly = keepLocalOnly
    ? state.notifications.filter((n) => !remoteIds.has(n.id))
    : [];
  const merged = new Map<string, Notification>();
  for (const n of [...localOnly, ...remote]) merged.set(n.id, n);
  return { notifications: sortNotifications([...merged.values()]) };
}

function cancelReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (!currentUserId) return; // logged out / torn down
  cancelReconnect();
  const delay = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_BASE_MS * 2 ** reconnectAttempts
  );
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!currentUserId) return;
    void useNotificationStore.getState().initNotifications(currentUserId);
  }, delay);
}

function handleOnline(): void {
  if (!currentUserId) return;
  reconnectAttempts = 0;
  cancelReconnect();
  void useNotificationStore.getState().initNotifications(currentUserId);
}

function handleVisibilityChange(): void {
  if (document.visibilityState !== 'visible') return;
  if (!currentUserId) return;
  reconnectAttempts = 0;
  // Re-init when the channel is gone; otherwise just refresh silently.
  if (!realtimeChannel) {
    void useNotificationStore.getState().initNotifications(currentUserId);
    return;
  }
  void syncFromServer();
}

function installGlobalListeners(): void {
  if (globalListenersInstalled) return;
  globalListenersInstalled = true;
  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

function removeGlobalListeners(): void {
  if (!globalListenersInstalled) return;
  globalListenersInstalled = false;
  window.removeEventListener('online', handleOnline);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

/** Fetch the user's notifications and merge them in without sounds. */
async function syncFromServer(): Promise<void> {
  try {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', authData.user.id)
      .order('created_at', { ascending: false });

    if (data) {
      const mapped = (data as DbNotification[]).map(mapDbNotificationToNotification);
      useNotificationStore.setState((state) =>
        mergeServerRows(state, mapped, true)
      );
    }
  } catch {
    // Keep existing state on network error
  }
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      soundEnabled: true,
      pendingSoundIds: [],

      initNotifications: async (userId: string) => {
        if (!userId) return;
        // Idempotent: a retry/visibility re-init must not stack timers
        // or channels for the same user.
        cancelReconnect();
        currentUserId = userId;
        installGlobalListeners();

        try {
          const supabase = createClient();
          const { data: authData } = await supabase.auth.getUser();
          if (!authData.user) return;

          const { data } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', authData.user.id)
            .order('created_at', { ascending: false });

          if (data) {
            const mapped = (data as DbNotification[]).map(mapDbNotificationToNotification);
            // First fetch of the session is authoritative (replaces the
            // localStorage cache); later reconnect refetches merge and
            // keep local-only entries.
            set((state) => mergeServerRows(state, mapped, hasFetchedOnce));
            hasFetchedOnce = true;
          }

          // Subscribe to Realtime INSERT events for this user's notifications
          if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
            realtimeChannel = null;
          }
          realtimeChannel = supabase
            .channel(`notifications:${authData.user.id}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${authData.user.id}`,
              },
              (payload) => {
                const dbRow = payload.new as DbNotification;
                const mapped = mapDbNotificationToNotification(dbRow);
                const state = get();
                // Dedup: skip if notification ID already exists (also
                // suppresses a duplicate sound for the same row).
                if (state.notifications.some((n) => n.id === mapped.id)) {
                  return;
                }
                set({
                  notifications: [mapped, ...state.notifications],
                  pendingSoundIds: [...state.pendingSoundIds, mapped.id],
                });
              }
            )
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                reconnectAttempts = 0;
                // Silent refresh: recover any rows missed while offline.
                void syncFromServer();
                return;
              }
              if (
                status === 'CHANNEL_ERROR' ||
                status === 'TIMED_OUT' ||
                status === 'CLOSED'
              ) {
                scheduleReconnect();
              }
            });
        } catch {
          // Keep existing state on network error; retry on next
          // visibility/online event or via backoff.
          scheduleReconnect();
        }
      },

      /**
       * @deprecated Use Server Actions for persistent notifications.
       * This method creates a local-only notification and fire-and-forgets to Supabase.
       * Retained for backward compatibility and transient UI feedback.
       */
      addNotification: (type, title, message, userId, relatedBookingId) => {
        const notification: Notification = {
          id: `notif-${++idCounter}-${Date.now()}`,
          userId,
          type,
          title,
          message,
          isRead: false,
          relatedBookingId,
          createdAt: new Date().toISOString(),
        };

        // Optimistic local update + queue its sound (arrived via a
        // genuine user action, not a background refetch).
        set((state) => ({
          notifications: [notification, ...state.notifications],
          pendingSoundIds: [...state.pendingSoundIds, notification.id],
        }));

        // Persist to Supabase (fire-and-forget, non-blocking)
        (async () => {
          try {
            const supabase = createClient();
            const { data: authData } = await supabase.auth.getUser();
            if (!authData.user) return;

            const { data } = await (supabase.from('notifications') as any)
              .insert({
                user_id: authData.user.id,
                type,
                title,
                message,
                related_booking_id: relatedBookingId ?? null,
                is_read: false,
              })
              .select('*')
              .single();

            // Replace local optimistic ID with real DB UUID
            if (data) {
              set((state) => {
                const replaced = state.notifications.map((n) =>
                  n.id === notification.id
                    ? { ...n, id: data.id, userId: authData.user.id }
                    : n
                );
                // If the realtime INSERT already delivered the same DB
                // row, drop the duplicate instead of showing it twice.
                const deduped = replaced.filter(
                  (n, i) => replaced.findIndex((x) => x.id === n.id) === i
                );
                // The optimistic and DB IDs refer to the SAME
                // notification — don't let it play twice.
                const pendingSoundIds = state.pendingSoundIds.filter(
                  (id) => id !== data.id
                );
                return { notifications: deduped, pendingSoundIds };
              });
            }
          } catch {
            // Keep local notification on network error
          }
        })();

        return notification;
      },

      addServerNotification: (notification: Notification) => {
        if (!notification?.id) return;
        const state = get();
        if (state.notifications.some((n) => n.id === notification.id)) {
          return;
        }
        set({
          notifications: sortNotifications([notification, ...state.notifications]),
          pendingSoundIds: [...state.pendingSoundIds, notification.id],
        });
      },

      enqueueSound: (id) => {
        if (!id) return;
        set((state) =>
          state.pendingSoundIds.includes(id)
            ? state
            : { pendingSoundIds: [...state.pendingSoundIds, id] }
        );
      },

      consumePendingSounds: () => {
        const queue = get().pendingSoundIds;
        if (queue.length === 0) return [];
        set({ pendingSoundIds: [] });
        return queue;
      },

      toggleSound: () =>
        set((state) => ({ soundEnabled: !state.soundEnabled })),

      markAsRead: async (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        }));

        try {
          const supabase = createClient();
          const { data: authData } = await supabase.auth.getUser();
          if (!authData.user) return;

          await (supabase.from('notifications') as any)
            .update({ is_read: true })
            .eq('id', id)
            .eq('user_id', authData.user.id);
        } catch {
          // Non-blocking
        }
      },

      markAllAsRead: async (userId) => {
        // Only update unread notifications (optimization)
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.userId === userId && !n.isRead ? { ...n, isRead: true } : n
          ),
        }));

        try {
          const supabase = createClient();
          const { data: authData } = await supabase.auth.getUser();
          if (!authData.user) return;

          await (supabase.from('notifications') as any)
            .update({ is_read: true })
            .eq('user_id', authData.user.id)
            .eq('is_read', false);
        } catch {
          // Non-blocking
        }
      },

      deleteNotification: async (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));

        try {
          const supabase = createClient();
          const { data: authData } = await supabase.auth.getUser();
          if (!authData.user) return;

          await (supabase.from('notifications') as any)
            .delete()
            .eq('id', id)
            .eq('user_id', authData.user.id);
        } catch {
          // Non-blocking
        }
      },

      clearAll: async (userId) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.userId !== userId),
        }));

        try {
          const supabase = createClient();
          const { data: authData } = await supabase.auth.getUser();
          if (!authData.user) return;

          await supabase.from('notifications').delete().eq('user_id', authData.user.id);
        } catch {
          // Non-blocking
        }
      },

      getNotificationsForUser: (userId) =>
        get()
          .notifications.filter((n) => n.userId === userId)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          ),

      unreadCount: (userId) =>
        get().notifications.filter((n) => n.userId === userId && !n.isRead)
          .length,

      clearNotifications: () => {
        // Unsubscribe from Realtime + stop any pending reconnect
        cancelReconnect();
        currentUserId = null;
        reconnectAttempts = 0;
        hasFetchedOnce = false;
        removeGlobalListeners();
        if (realtimeChannel) {
          const supabase = createClient();
          supabase.removeChannel(realtimeChannel);
          realtimeChannel = null;
        }
        // Clear all client state (including queued sounds — a logout
        // must never burst-play pending notification sounds).
        set({ notifications: [], pendingSoundIds: [] });
      },
    }),
    {
      name: 'khub-notifications-storage',
      partialize: (state) => ({
        notifications: state.notifications,
        soundEnabled: state.soundEnabled,
      }),
      skipHydration: true,
    }
  )
);
