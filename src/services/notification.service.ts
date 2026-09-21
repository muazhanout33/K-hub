import { createClient } from '@/lib/supabase/server';
import { NotificationType } from '@/types';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedBookingId?: string;
  dedupeKey?: string;
}

export interface NotificationResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Server-side notification service.
 * The single source of truth for creating persistent notifications.
 * Called from Server Actions only — never from client components.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationResult> {
  try {
    const supabase = await createClient();

    const insertPayload: Record<string, unknown> = {
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      related_booking_id: input.relatedBookingId ?? null,
      is_read: false,
    };

    if (input.dedupeKey) {
      insertPayload.dedupe_key = input.dedupeKey;
    }

    const { data, error } = await (supabase.from('notifications') as any)
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      // Unique constraint violation on dedupe_key = duplicate, treat as success
      if (error.code === '23505') {
        return { success: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create notification';
    return { success: false, error: message };
  }
}

/**
 * Convenience helper: create a booking lifecycle notification.
 * Automatically generates a dedupe_key from type + bookingId.
 */
export async function createBookingNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  bookingId: string
): Promise<NotificationResult> {
  return createNotification({
    userId,
    type,
    title,
    message,
    relatedBookingId: bookingId,
    dedupeKey: `${type}:${bookingId}`,
  });
}
