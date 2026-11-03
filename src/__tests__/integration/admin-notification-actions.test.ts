import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import {
  getAdminNotificationsPageAction,
  sendAdminNotificationAction,
  deleteAdminNotificationAction,
} from '@/app/actions/admin-notification.actions';
import { ADMIN_SEND_MAX_RECIPIENTS } from '@/lib/admin-notifications';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

interface MockChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  maybeSingle: () => Promise<QueryResult>;
  then: (resolve: (value: QueryResult) => void) => void;
}

function makeChain(state: { maybeSingle?: QueryResult[]; then?: QueryResult[] }): MockChain {
  const chain = {} as MockChain;
  const msQueue = [...(state.maybeSingle ?? [])];
  const thenQueue = [...(state.then ?? [])];
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(() => {
    const next = msQueue.length > 1 ? msQueue.shift() : msQueue[0];
    return Promise.resolve(next ?? { data: null, error: null });
  });
  chain.then = (resolve) => {
    const next = thenQueue.length > 1 ? thenQueue.shift() : thenQueue[0];
    resolve(next ?? { data: null, error: null });
  };
  return chain;
}

const ADMIN_ROLE: QueryResult = { data: { role: 'Admin' }, error: null };
const USER_ROLE: QueryResult = { data: { role: 'User' }, error: null };
const ADMIN_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CUSTOMER_ID = '0f0f8a5e-1234-4abc-9def-0123456789ab';
const NOTIFICATION_ID = '11111111-2222-4333-8444-555555555555';

let profilesChain: MockChain;
let notificationsChain: MockChain;

function resetChains(
  overrides: {
    profilesMaybeSingle?: QueryResult[];
    notificationsMaybeSingle?: QueryResult[];
    notificationsThen?: QueryResult[];
  } = {}
) {
  profilesChain = makeChain({
    maybeSingle: overrides.profilesMaybeSingle ?? [ADMIN_ROLE],
  });
  notificationsChain = makeChain({
    maybeSingle: overrides.notificationsMaybeSingle ?? [],
    then: overrides.notificationsThen ?? [],
  });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return profilesChain;
    if (table === 'notifications') return notificationsChain;
    throw new Error(`unexpected table: ${table}`);
  });
}

function makeDbNotification(
  overrides: Partial<{
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    is_read: boolean;
    created_at: string;
    recipient: { full_name: string | null; email: string | null } | null;
  }> = {}
) {
  return {
    id: NOTIFICATION_ID,
    user_id: CUSTOMER_ID,
    type: 'promo_offer',
    title: 'Weekend Promo',
    message: '20% off court bookings this weekend.',
    is_read: false,
    related_booking_id: null,
    dedupe_key: null,
    created_at: '2026-10-01T10:00:00Z',
    recipient: { full_name: 'Sara Hassan', email: 'sara.hassan@example.com' },
    ...overrides,
  };
}

function uuidWithPrefix(prefix: string): string {
  return (prefix + 'a'.repeat(32)).slice(0, 8) + '-' + 'b'.repeat(4) + '-4' + 'c'.repeat(3) + '-8' + 'd'.repeat(3) + '-' + 'e'.repeat(12);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
  resetChains();
});

// ═══════════════════════════════════════════════════════════════════════════
// LIST — getAdminNotificationsPageAction
// ═══════════════════════════════════════════════════════════════════════════

describe('getAdminNotificationsPageAction', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await getAdminNotificationsPageAction();

    expect(result).toEqual({ success: false, error: 'Authentication required.' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects non-admin callers', async () => {
    resetChains({ profilesMaybeSingle: [USER_ROLE] });

    const result = await getAdminNotificationsPageAction();

    expect(result).toEqual({ success: false, error: 'Admin access required.' });
  });

  it('rejects an invalid page number', async () => {
    const result = await getAdminNotificationsPageAction({ page: 0 });

    expect(result).toEqual({ success: false, error: 'Invalid page number.' });
    expect(notificationsChain.select).not.toHaveBeenCalled();
  });

  it('rejects a type filter outside the DB whitelist', async () => {
    const result = await getAdminNotificationsPageAction({ type: 'not_a_type' });

    expect(result).toEqual({
      success: false,
      error: 'Invalid notification type filter.',
    });
    expect(notificationsChain.select).not.toHaveBeenCalled();
  });

  it('returns mapped rows with recipient embed, total, page and pageSize', async () => {
    resetChains({
      notificationsThen: [
        {
          data: [
            makeDbNotification(),
            makeDbNotification({
              id: '22222222-3333-4444-8555-666666666666',
              type: 'booking_confirmed',
              recipient: null,
            }),
          ],
          error: null,
          count: 2,
        },
      ],
    });

    const result = await getAdminNotificationsPageAction();

    expect(result.success).toBe(true);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.total).toBe(2);
    expect(result.notifications).toHaveLength(2);
    expect(result.notifications?.[0]).toEqual({
      id: NOTIFICATION_ID,
      userId: CUSTOMER_ID,
      type: 'promo_offer',
      title: 'Weekend Promo',
      message: '20% off court bookings this weekend.',
      isRead: false,
      createdAt: '2026-10-01T10:00:00Z',
      recipient: { fullName: 'Sara Hassan', email: 'sara.hassan@example.com' },
    });
    expect(result.notifications?.[1].recipient).toBeNull();
    // Recipient fields come from the embedded profiles join, not a second query.
    expect(notificationsChain.select).toHaveBeenCalledWith(
      expect.stringContaining('recipient:profiles!user_id'),
      { count: 'exact' }
    );
    expect(notificationsChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('applies the type filter when provided', async () => {
    resetChains({ notificationsThen: [{ data: [], error: null, count: 0 }] });

    const result = await getAdminNotificationsPageAction({ type: 'promo_offer', page: 2 });

    expect(result.success).toBe(true);
    expect(result.page).toBe(2);
    expect(notificationsChain.eq).toHaveBeenCalledWith('type', 'promo_offer');
    expect(notificationsChain.range).toHaveBeenCalledWith(25, 49);
  });

  it('returns a generic error on database failure without leaking details', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetChains({
      notificationsThen: [
        { data: null, error: { message: 'secret db detail', code: 'XX000' } },
      ],
    });

    const result = await getAdminNotificationsPageAction();

    expect(result).toEqual({
      success: false,
      error: 'Failed to load notifications. Please try again.',
    });
    expect(JSON.stringify(result)).not.toContain('secret db detail');
    consoleSpy.mockRestore();
  });

  it('returns a generic error when the action throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFrom.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await getAdminNotificationsPageAction();

    expect(result).toEqual({
      success: false,
      error: 'Failed to load notifications. Please try again.',
    });
    consoleSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SEND — sendAdminNotificationAction
// ═══════════════════════════════════════════════════════════════════════════

describe('sendAdminNotificationAction', () => {
  const validInput = {
    userIds: [CUSTOMER_ID],
    type: 'promo_offer',
    title: 'Weekend Promo',
    message: '20% off court bookings this weekend.',
  };

  it('rejects unauthenticated callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await sendAdminNotificationAction(validInput);

    expect(result).toEqual({ success: false, error: 'Authentication required.' });
  });

  it('rejects non-admin callers', async () => {
    resetChains({ profilesMaybeSingle: [USER_ROLE] });

    const result = await sendAdminNotificationAction(validInput);

    expect(result).toEqual({ success: false, error: 'Admin access required.' });
    expect(notificationsChain.insert).not.toHaveBeenCalled();
  });

  it('rejects a type outside the admin send whitelist', async () => {
    const result = await sendAdminNotificationAction({
      ...validInput,
      type: 'payment_refunded',
    });

    expect(result).toEqual({ success: false, error: 'Invalid notification type.' });
    expect(notificationsChain.insert).not.toHaveBeenCalled();
  });

  it('rejects an empty or whitespace title', async () => {
    const result = await sendAdminNotificationAction({ ...validInput, title: '   ' });

    expect(result).toEqual({ success: false, error: 'Title is required.' });
  });

  it('rejects a title longer than 255 characters', async () => {
    const result = await sendAdminNotificationAction({
      ...validInput,
      title: 'x'.repeat(256),
    });

    expect(result).toEqual({
      success: false,
      error: 'Title must be 255 characters or fewer.',
    });
  });

  it('rejects an empty message', async () => {
    const result = await sendAdminNotificationAction({ ...validInput, message: '' });

    expect(result).toEqual({ success: false, error: 'Message is required.' });
  });

  it('rejects a message longer than 2000 characters', async () => {
    const result = await sendAdminNotificationAction({
      ...validInput,
      message: 'x'.repeat(2001),
    });

    expect(result).toEqual({
      success: false,
      error: 'Message must be 2000 characters or fewer.',
    });
  });

  it('rejects an empty recipient list', async () => {
    const result = await sendAdminNotificationAction({ ...validInput, userIds: [] });

    expect(result).toEqual({
      success: false,
      error: 'At least one recipient is required.',
    });
  });

  it('rejects a recipient that is not a valid UUID', async () => {
    const result = await sendAdminNotificationAction({
      ...validInput,
      userIds: ['not-a-uuid'],
    });

    expect(result).toEqual({ success: false, error: 'Invalid recipient.' });
    expect(notificationsChain.insert).not.toHaveBeenCalled();
  });

  it('rejects more than the recipient cap', async () => {
    const userIds = Array.from({ length: ADMIN_SEND_MAX_RECIPIENTS + 1 }, (_, i) =>
      uuidWithPrefix(String(i).padStart(8, '0'))
    );

    const result = await sendAdminNotificationAction({ ...validInput, userIds });

    expect(result.success).toBe(false);
    expect(result.error).toContain(`limited to ${ADMIN_SEND_MAX_RECIPIENTS}`);
    expect(notificationsChain.insert).not.toHaveBeenCalled();
  });

  it('inserts one trimmed row per unique recipient and returns sentCount', async () => {
    resetChains({ notificationsThen: [{ data: null, error: null }] });

    const result = await sendAdminNotificationAction({
      ...validInput,
      userIds: [CUSTOMER_ID, CUSTOMER_ID, ADMIN_ID],
      title: '  Weekend Promo  ',
    });

    expect(result).toEqual({ success: true, sentCount: 2 });
    expect(notificationsChain.insert).toHaveBeenCalledTimes(1);
    const rows = notificationsChain.insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      user_id: CUSTOMER_ID,
      type: 'promo_offer',
      title: 'Weekend Promo',
      message: '20% off court bookings this weekend.',
    });
    expect(rows.map((r) => r.user_id)).toEqual([CUSTOMER_ID, ADMIN_ID]);
    // No dedupe_key: manual sends are distinct campaigns, not booking events.
    expect(rows[0]).not.toHaveProperty('dedupe_key');
  });

  it('returns a generic error on insert failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetChains({
      notificationsThen: [
        { data: null, error: { message: 'insert secret', code: '23505' } },
      ],
    });

    const result = await sendAdminNotificationAction(validInput);

    expect(result).toEqual({
      success: false,
      error: 'Failed to send notification. Please try again.',
    });
    expect(JSON.stringify(result)).not.toContain('insert secret');
    consoleSpy.mockRestore();
  });

  it('returns a generic error when the action throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFrom.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await sendAdminNotificationAction(validInput);

    expect(result).toEqual({
      success: false,
      error: 'Failed to send notification. Please try again.',
    });
    consoleSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE — deleteAdminNotificationAction
// ═══════════════════════════════════════════════════════════════════════════

describe('deleteAdminNotificationAction', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await deleteAdminNotificationAction(NOTIFICATION_ID);

    expect(result).toEqual({ success: false, error: 'Authentication required.' });
  });

  it('rejects non-admin callers', async () => {
    resetChains({ profilesMaybeSingle: [USER_ROLE] });

    const result = await deleteAdminNotificationAction(NOTIFICATION_ID);

    expect(result).toEqual({ success: false, error: 'Admin access required.' });
    expect(notificationsChain.delete).not.toHaveBeenCalled();
  });

  it('rejects an invalid notification id', async () => {
    const result = await deleteAdminNotificationAction('nope');

    expect(result).toEqual({ success: false, error: 'Invalid notification id.' });
    expect(notificationsChain.delete).not.toHaveBeenCalled();
  });

  it('returns not found when no row is deleted', async () => {
    resetChains({ notificationsMaybeSingle: [{ data: null, error: null }] });

    const result = await deleteAdminNotificationAction(NOTIFICATION_ID);

    expect(result).toEqual({ success: false, error: 'Notification not found.' });
  });

  it('issues a hard delete scoped to the id and succeeds', async () => {
    resetChains({
      notificationsMaybeSingle: [{ data: { id: NOTIFICATION_ID }, error: null }],
    });

    const result = await deleteAdminNotificationAction(NOTIFICATION_ID);

    expect(result).toEqual({ success: true });
    expect(notificationsChain.delete).toHaveBeenCalledTimes(1);
    expect(notificationsChain.eq).toHaveBeenCalledWith('id', NOTIFICATION_ID);
    // Immutability trigger blocks UPDATE of non-is_read columns — delete must
    // never route through update().
    expect(notificationsChain.update).not.toHaveBeenCalled();
  });

  it('returns a generic error on database failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetChains({
      notificationsMaybeSingle: [
        { data: null, error: { message: 'delete secret', code: 'XX000' } },
      ],
    });

    const result = await deleteAdminNotificationAction(NOTIFICATION_ID);

    expect(result).toEqual({
      success: false,
      error: 'Failed to delete notification. Please try again.',
    });
    expect(JSON.stringify(result)).not.toContain('delete secret');
    consoleSpy.mockRestore();
  });

  it('returns a generic error when the action throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFrom.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await deleteAdminNotificationAction(NOTIFICATION_ID);

    expect(result).toEqual({
      success: false,
      error: 'Failed to delete notification. Please try again.',
    });
    consoleSpy.mockRestore();
  });
});
