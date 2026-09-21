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

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      soundEnabled: true,

      initNotifications: async (userId: string) => {
        if (!userId) return;
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
            set({ notifications: mapped });
          }

          // Subscribe to Realtime INSERT events for this user's notifications
          if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
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
                set((state) => {
                  // Dedup: skip if notification ID already exists
                  if (state.notifications.some((n) => n.id === mapped.id)) {
                    return state;
                  }
                  return { notifications: [mapped, ...state.notifications] };
                });
              }
            )
            .subscribe();
        } catch {
          // Keep existing state on network error
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

        // Optimistic local update
        set((state) => ({
          notifications: [notification, ...state.notifications],
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
              set((state) => ({
                notifications: state.notifications.map((n) =>
                  n.id === notification.id
                    ? { ...n, id: data.id, userId: authData.user.id }
                    : n
                ),
              }));
            }
          } catch {
            // Keep local notification on network error
          }
        })();

        return notification;
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
        // Unsubscribe from Realtime
        if (realtimeChannel) {
          const supabase = createClient();
          supabase.removeChannel(realtimeChannel);
          realtimeChannel = null;
        }
        // Clear all client state
        set({ notifications: [] });
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
