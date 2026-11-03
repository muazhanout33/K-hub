'use server';

import { createClient } from '@/lib/supabase/server';
import {
  ADMIN_SEND_MAX_RECIPIENTS,
  ADMIN_SEND_TYPES,
  AdminSendType,
} from '@/lib/admin-notifications';
import { NotificationType } from '@/types';
import { DbNotification } from '@/types/database.types';

const NOTIFICATION_PAGE_SIZE = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENERIC_LIST_ERROR = 'Failed to load notifications. Please try again.';
const GENERIC_SEND_ERROR = 'Failed to send notification. Please try again.';
const GENERIC_DELETE_ERROR = 'Failed to delete notification. Please try again.';

/** Every type accepted by the DB CHECK constraint — used for list filtering. */
const ALL_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'booking_confirmed',
  'booking_cancelled',
  'booking_expired',
  'booking_reminder',
  'booking_time_changed',
  'payment_successful',
  'payment_refunded',
  'subscription_expiring',
  'promo_offer',
  'court_full',
  'checkout_stuck',
  'new_subscription',
  'new_booking',
  'info',
];

export interface AdminNotificationRecipient {
  fullName: string | null;
  email: string | null;
}

export interface AdminNotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  recipient: AdminNotificationRecipient | null;
}

export interface NotificationsPageQuery {
  page?: number;
  type?: string;
}

export interface NotificationsPageResult {
  success: boolean;
  notifications?: AdminNotificationRow[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
}

export interface SendNotificationInput {
  userIds: string[];
  type: string;
  title: string;
  message: string;
}

export interface SendNotificationResult {
  success: boolean;
  sentCount?: number;
  error?: string;
}

export interface DeleteNotificationResult {
  success: boolean;
  error?: string;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function requireAdmin(): Promise<
  { ok: true; supabase: ServerClient } | { ok: false; error: string }
> {
  const supabase = await createClient();

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return { ok: false, error: 'Authentication required.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (!profile || (profile as { role?: string }).role !== 'Admin') {
    return { ok: false, error: 'Admin access required.' };
  }

  return { ok: true, supabase };
}

type DbNotificationWithRecipient = DbNotification & {
  recipient: { full_name: string | null; email: string | null } | null;
};

function mapDbNotificationToAdminRow(row: DbNotificationWithRecipient): AdminNotificationRow {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: row.is_read,
    createdAt: row.created_at,
    recipient: row.recipient
      ? { fullName: row.recipient.full_name, email: row.recipient.email }
      : null,
  };
}

/**
 * Server Action: Admin-only notification listing for the Notifications page.
 * Offset pagination (25/page), newest first, optional type filter (whitelisted
 * against the DB CHECK list). Recipient name/email are embedded via the
 * notifications.user_id → profiles.id FK. Read-only: never writes.
 */
export async function getAdminNotificationsPageAction(
  query: NotificationsPageQuery = {}
): Promise<NotificationsPageResult> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    const page = query.page === undefined ? 1 : query.page;
    if (!Number.isInteger(page) || page < 1) {
      return { success: false, error: 'Invalid page number.' };
    }

    const type = query.type ?? '';
    if (type && !ALL_NOTIFICATION_TYPES.includes(type as NotificationType)) {
      return { success: false, error: 'Invalid notification type filter.' };
    }

    let request = supabase
      .from('notifications')
      .select(
        'id, user_id, type, title, message, is_read, created_at, recipient:profiles!user_id ( full_name, email )',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range((page - 1) * NOTIFICATION_PAGE_SIZE, page * NOTIFICATION_PAGE_SIZE - 1);

    if (type) {
      request = request.eq('type', type);
    }

    const { data, error, count } = await request;

    if (error) {
      console.error('getAdminNotificationsPageAction failed (code):', error.code ?? 'unknown');
      return { success: false, error: GENERIC_LIST_ERROR };
    }

    const rows = ((data as unknown as DbNotificationWithRecipient[]) || []);

    return {
      success: true,
      notifications: rows.map(mapDbNotificationToAdminRow),
      total: count ?? rows.length,
      page,
      pageSize: NOTIFICATION_PAGE_SIZE,
    };
  } catch (err) {
    console.error(
      'getAdminNotificationsPageAction threw:',
      err instanceof Error ? err.message : 'unknown'
    );
    return { success: false, error: GENERIC_LIST_ERROR };
  }
}

/**
 * Server Action: Admin-only manual notification send. Inserts one row per
 * recipient through the authenticated client (admin RLS permits the insert).
 * Type/title/message are validated against the same limits the DB CHECK
 * enforces; recipients are deduplicated and capped at 50 per send. No
 * dedupe_key is set — each send is a distinct campaign, not a booking event.
 */
export async function sendAdminNotificationAction(
  input: SendNotificationInput
): Promise<SendNotificationResult> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    if (
      typeof input?.type !== 'string' ||
      !ADMIN_SEND_TYPES.includes(input.type as AdminSendType)
    ) {
      return { success: false, error: 'Invalid notification type.' };
    }

    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) {
      return { success: false, error: 'Title is required.' };
    }
    if (title.length > 255) {
      return { success: false, error: 'Title must be 255 characters or fewer.' };
    }

    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (!message) {
      return { success: false, error: 'Message is required.' };
    }
    if (message.length > 2000) {
      return { success: false, error: 'Message must be 2000 characters or fewer.' };
    }

    if (!Array.isArray(input.userIds) || input.userIds.length === 0) {
      return { success: false, error: 'At least one recipient is required.' };
    }

    const uniqueIds = [...new Set(input.userIds)];
    if (uniqueIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
      return { success: false, error: 'Invalid recipient.' };
    }
    if (uniqueIds.length > ADMIN_SEND_MAX_RECIPIENTS) {
      return {
        success: false,
        error: `Too many recipients. A single send is limited to ${ADMIN_SEND_MAX_RECIPIENTS} customers.`,
      };
    }

    const rows = uniqueIds.map((user_id) => ({
      user_id,
      type: input.type,
      title,
      message,
    }));

    const { error } = await supabase.from('notifications').insert(rows as never);

    if (error) {
      console.error('sendAdminNotificationAction failed (code):', error.code ?? 'unknown');
      return { success: false, error: GENERIC_SEND_ERROR };
    }

    return { success: true, sentCount: rows.length };
  } catch (err) {
    console.error(
      'sendAdminNotificationAction threw:',
      err instanceof Error ? err.message : 'unknown'
    );
    return { success: false, error: GENERIC_SEND_ERROR };
  }
}

/**
 * Server Action: Admin-only notification removal. Hard DELETE, never UPDATE —
 * notifications are immutable after insert except the is_read flag, which is
 * owned by the recipient. Admin RLS policy permits DELETE on any row.
 */
export async function deleteAdminNotificationAction(
  notificationId: string
): Promise<DeleteNotificationResult> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    if (typeof notificationId !== 'string' || !UUID_RE.test(notificationId)) {
      return { success: false, error: 'Invalid notification id.' };
    }

    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('deleteAdminNotificationAction failed (code):', error.code ?? 'unknown');
      return { success: false, error: GENERIC_DELETE_ERROR };
    }
    if (!data) {
      return { success: false, error: 'Notification not found.' };
    }

    return { success: true };
  } catch (err) {
    console.error(
      'deleteAdminNotificationAction threw:',
      err instanceof Error ? err.message : 'unknown'
    );
    return { success: false, error: GENERIC_DELETE_ERROR };
  }
}
