import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase server client ──────────────────────────────────
const mockGetUser = vi.fn();

function makeSupabaseChain(result: any = { data: null, error: null }) {
  const chain: any = {};
  // Methods that return the chain for chaining
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.filter = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  // Methods that return promises
  chain.insert = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.order = vi.fn().mockResolvedValue(result);
  // Make chain thenable so `await chain.select('id')` resolves to result
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

// Default chain used by supabase.from()
let supabaseChain = makeSupabaseChain();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => supabaseChain),
  })),
}));

vi.mock('@/services/court.service', () => ({
  getCourtInfoForBooking: vi.fn(() => Promise.resolve({
    name: 'Court 1', image: '', sportType: 'Padel',
  })),
  getCourtInfoMap: vi.fn(() => Promise.resolve(new Map())),
}));

vi.mock('@/lib/mappers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mappers')>();
  return {
    ...actual, // keeps parseTstzrangeStart real (actions parse live-shaped ranges)
    formatTstzrange: vi.fn(() => '["2099-06-15 10:00","2099-06-15 11:00"]'),
    mapDbBookingToBooking: vi.fn((_b: any, _c: any) => ({
      id: _b?.id || 'booking-1',
      bookingNumber: 'KH-123456',
      courtId: 'court-1',
      courtName: 'Court 1',
      courtImage: '',
      sportType: 'Padel',
      date: '2099-06-15',
      startTime: '10:00',
      endTime: '11:00',
      durationMinutes: 60,
      totalPrice: 200,
      status: _b?.status || 'Reserved',
      bookingSource: 'ONLINE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      userId: 'user-1',
      userName: 'Test',
      userEmail: 'test@test.com',
      userPhone: '123',
      selectedSlotIds: [],
    })),
  };
});

vi.mock('@/lib/pricing', () => ({
  calculateBookingPrice: vi.fn(() => 200),
}));

vi.mock('@/lib/timezone', () => ({
  isSlotPast: vi.fn(() => false),
  // Window boundary logic is unit-tested in timezone.test.ts; here we verify
  // the action wiring (true → proceed, false → CANCELLATION_TOO_LATE).
  isSlotCancellable: vi.fn(() => true),
  CANCELLATION_WINDOW_HOURS: 2,
  cairoExpiryNowRange: vi.fn(() => '["2099-01-01 00:00:00+00","2099-01-01 00:00:00+00"]'),
}));

// ─────────────────────────────────────────────────────────────────
// cancelBookingAction
// ─────────────────────────────────────────────────────────────────
import { cancelBookingAction, getBookingStatusAction } from '@/app/actions/booking.actions';

describe('cancelBookingAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseChain = makeSupabaseChain({ data: null, error: null });
  });

  it('returns error when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await cancelBookingAction('booking-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
  });

  it('returns error when booking not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));

    const result = await cancelBookingAction('non-existent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error when booking is already cancelled', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { id: 'booking-1', user_id: 'user-1', status: 'Cancelled', booking_range: '["2099-06-15 10:00","2099-06-15 11:00"]' },
      error: null,
    }));

    const result = await cancelBookingAction('booking-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already cancelled');
  });

  it('returns error when booking is already expired', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { id: 'booking-1', user_id: 'user-1', status: 'Expired', booking_range: '["2099-06-15 10:00","2099-06-15 11:00"]' },
      error: null,
    }));

    const result = await cancelBookingAction('booking-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already expired');
  });

  it('returns error when user is not owner and not admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-other' } } });
    supabaseChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({
        data: { id: 'booking-1', user_id: 'user-1', status: 'Confirmed', booking_range: '["2099-06-15 10:00","2099-06-15 11:00"]' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { role: 'Guest' },
        error: null,
      });

    const result = await cancelBookingAction('booking-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not authorized');
  });

  it('allows admin to cancel another user booking', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-user' } } });
    supabaseChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({
        data: { id: 'booking-1', user_id: 'user-1', status: 'Confirmed', booking_range: '["2099-12-15 10:00","2099-12-15 11:00"]' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { role: 'Admin' },
        error: null,
      });
    supabaseChain.update = vi.fn().mockReturnThis();
    supabaseChain.single = vi.fn().mockResolvedValue({
      data: { id: 'booking-1', court_id: 'court-1', status: 'Cancelled' },
      error: null,
    });

    const result = await cancelBookingAction('booking-1');
    expect(result.success).toBe(true);
  });

  it('returns CANCELLATION_TOO_LATE when the shared wall-clock window says no', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const { isSlotCancellable } = await import('@/lib/timezone');
    vi.mocked(isSlotCancellable).mockReturnValueOnce(false);
    const range = '["2099-06-15 10:00:00+00","2099-06-15 11:00:00+00")';
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { id: 'booking-1', user_id: 'user-1', status: 'Confirmed', booking_range: range },
      error: null,
    }));

    const result = await cancelBookingAction('booking-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('CANCELLATION_TOO_LATE');
    // Server parsed the stored range and consulted the shared helper
    expect(isSlotCancellable).toHaveBeenCalledWith('2099-06-15', '10:00', 2);
  });
});

// ─────────────────────────────────────────────────────────────────
// confirmBookingStatusAction
// ─────────────────────────────────────────────────────────────────
import { confirmBookingStatusAction } from '@/app/actions/booking.actions';

describe('confirmBookingStatusAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseChain = makeSupabaseChain({ data: null, error: null });
  });

  it('returns error when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await confirmBookingStatusAction('booking-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
  });

  it('returns error when booking not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));

    const result = await confirmBookingStatusAction('non-existent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('handles already Confirmed booking idempotently (returns success without error)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { id: 'booking-1', user_id: 'user-1', status: 'Confirmed', total_price: 150 },
      error: null,
    }));

    const result = await confirmBookingStatusAction('booking-1');
    expect(result.success).toBe(true);
    expect(result.booking?.status).toBe('Confirmed');
  });

  it('returns error when booking is Cancelled', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { id: 'booking-1', user_id: 'user-1', status: 'Cancelled' },
      error: null,
    }));

    const result = await confirmBookingStatusAction('booking-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('cancelled');
  });

  it('returns error when non-owner non-admin tries to confirm', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-other' } } });
    supabaseChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({
        data: { id: 'booking-1', user_id: 'user-1', status: 'Reserved' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { role: 'Guest' },
        error: null,
      });

    const result = await confirmBookingStatusAction('booking-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not authorized');
  });

  it('allows owner to confirm their own Reserved booking', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { id: 'booking-1', user_id: 'user-1', status: 'Reserved' },
      error: null,
    }));
    supabaseChain.update = vi.fn().mockReturnThis();
    supabaseChain.single = vi.fn().mockResolvedValue({
      data: { id: 'booking-1', court_id: 'court-1', status: 'Confirmed', total_price: 200, booking_number: 'KH-123456' },
      error: null,
    });

    const result = await confirmBookingStatusAction('booking-1');
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// getAdminBookingsAction
// ─────────────────────────────────────────────────────────────────
import { getAdminBookingsAction } from '@/app/actions/booking.actions';

describe('getAdminBookingsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseChain = makeSupabaseChain({ data: null, error: null });
  });

  it('returns error when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await getAdminBookingsAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
  });

  it('returns error when non-admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { role: 'Guest' },
      error: null,
    }));

    const result = await getAdminBookingsAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
  });

  it('returns all bookings for admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { role: 'Admin' },
      error: null,
    }));
    supabaseChain.order = vi.fn().mockResolvedValue({
      data: [
        { id: 'b1', court_id: 'court-1', status: 'Confirmed' },
        { id: 'b2', court_id: 'court-2', status: 'Reserved' },
      ],
      error: null,
    });

    const result = await getAdminBookingsAction();
    expect(result.success).toBe(true);
    expect(result.bookings).toHaveLength(2);
  });

  it('returns empty array when admin has no bookings', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { role: 'Admin' },
      error: null,
    }));
    supabaseChain.order = vi.fn().mockResolvedValue({ data: [], error: null });

    const result = await getAdminBookingsAction();
    expect(result.success).toBe(true);
    expect(result.bookings).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// expireStaleBookingsAction
// ─────────────────────────────────────────────────────────────────
import { expireStaleBookingsAction } from '@/app/actions/booking.actions';

describe('expireStaleBookingsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseChain = makeSupabaseChain({ data: null, error: null });
  });

  it('returns error when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await expireStaleBookingsAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
  });

  it('returns error when non-admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { role: 'Guest' },
      error: null,
    }));

    const result = await expireStaleBookingsAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
  });

  it('expires stale bookings and returns count', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    // Profile lookup
    const profileChain = makeSupabaseChain({ data: { role: 'Admin' }, error: null });
    // Update chain: update().eq().lt().select() → returns expired booking ids
    const updateChain = makeSupabaseChain({ data: [{ id: 'b1' }, { id: 'b2' }], error: null });
    // Bookings lookup: select().in() → returns bookings with user info
    const bookingsChain = makeSupabaseChain({
      data: [
        { id: 'b1', user_id: 'u1', booking_number: 'KH-001' },
        { id: 'b2', user_id: 'u2', booking_number: 'KH-002' },
      ],
      error: null,
    });
    // Notifications insert
    const notifChain = makeSupabaseChain({ data: null, error: null });

    let fromCallCount = 0;
    const fromMock = vi.fn().mockImplementation((table: string) => {
      fromCallCount++;
      if (table === 'profiles') return profileChain;
      if (table === 'notifications') return notifChain;
      // First bookings call = update, second = select
      if (fromCallCount <= 2) return updateChain;
      return bookingsChain;
    });

    // Override createClient for this test
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getUser: mockGetUser },
      from: fromMock,
    } as any);

    const result = await expireStaleBookingsAction();
    expect(result.success).toBe(true);
    expect(result.expiredCount).toBe(2);
    // Expiry compares in the stored wall-clock convention (Cairo digits +00)
    // with nxr (upper <= now) — verified against live PostgREST semantics.
    expect(updateChain.filter).toHaveBeenCalledWith(
      'booking_range',
      'nxr',
      '["2099-01-01 00:00:00+00","2099-01-01 00:00:00+00"]'
    );
  });

  it('returns 0 when no stale bookings exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    // Profile lookup
    const profileChain = makeSupabaseChain({ data: { role: 'Admin' }, error: null });
    // Update chain returns empty
    const updateChain = makeSupabaseChain({ data: [], error: null });

    let fromCallCount = 0;
    const fromMock = vi.fn().mockImplementation((table: string) => {
      fromCallCount++;
      if (table === 'profiles') return profileChain;
      return updateChain;
    });

    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getUser: mockGetUser },
      from: fromMock,
    } as any);

    const result = await expireStaleBookingsAction();
    expect(result.success).toBe(true);
    expect(result.expiredCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// getBookingStatusAction  (recovery path for refresh/redirect)
// ─────────────────────────────────────────────────────────────────
describe('getBookingStatusAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseChain = makeSupabaseChain({ data: null, error: null });
  });

  it('returns error when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await getBookingStatusAction('booking-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
  });

  it('returns error when the booking does not exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: null, error: null })
    );

    const result = await getBookingStatusAction('missing-booking');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns the booking when the caller is the owner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseChain.maybeSingle = vi.fn(() =>
      Promise.resolve({
        data: { id: 'booking-1', user_id: 'user-1', court_id: 'court-1' },
        error: null,
      })
    );

    const result = await getBookingStatusAction('booking-1');
    expect(result.success).toBe(true);
    expect(result.booking?.id).toBe('booking-1');
    expect(supabaseChain.eq).toHaveBeenCalledWith('id', 'booking-1');
  });

  it('rejects a non-owner without the Admin role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'intruder' } } });
    supabaseChain.maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: { id: 'booking-1', user_id: 'someone-else', court_id: 'court-1' },
        error: null,
      })
      .mockResolvedValueOnce({ data: { role: 'Guest' }, error: null });

    const result = await getBookingStatusAction('booking-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not authorized');
  });

  it('allows an Admin to fetch another user\'s booking', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    supabaseChain.maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: { id: 'booking-1', user_id: 'someone-else', court_id: 'court-1' },
        error: null,
      })
      .mockResolvedValueOnce({ data: { role: 'Admin' }, error: null });

    const result = await getBookingStatusAction('booking-1');
    expect(result.success).toBe(true);
    expect(result.booking?.id).toBe('booking-1');
  });
});
