import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase server client (per-table chains for clean assertions) ──
const mockGetUser = vi.fn();

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

type MockChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  filter: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (value: QueryResult) => void) => void;
};

function makeChain(result: QueryResult): MockChain {
  const chain: MockChain = {} as MockChain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.filter = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  // Make chain thenable so `await ...range(...)` resolves to result
  chain.then = (resolve) => resolve(result);
  return chain;
}

const COURT_UUID = '11111111-2222-3333-4444-555555555555';

let bookingsResult: QueryResult;
let profilesChain: MockChain;
let bookingsChain: MockChain;

function resetChains() {
  bookingsResult = { data: [makeDbBooking()], error: null, count: 1 };
  profilesChain = makeChain({ data: { role: 'Admin' }, error: null });
  bookingsChain = makeChain(bookingsResult);
}

function makeDbBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    booking_number: 'KH-123456',
    user_id: 'user-1',
    court_id: COURT_UUID,
    booking_range: '[2026-11-20 14:00:00+00, 2026-11-20 15:00:00+00)',
    duration_minutes: 60,
    total_price: 200,
    status: 'Confirmed',
    booking_source: 'ONLINE',
    user_name: 'Test User',
    user_email: 'test@example.com',
    user_phone: '01000000000',
    created_at: '2026-10-01T12:00:00Z',
    updated_at: '2026-10-01T12:00:00Z',
    cancelled_at: null,
    cancellation_reason: null,
    ...overrides,
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => (table === 'profiles' ? profilesChain : bookingsChain)),
  })),
}));

vi.mock('@/services/court.service', () => ({
  FALLBACK_COURT_IMAGE: '/fallback.jpg',
  getCourtInfoMap: vi.fn(async (ids: string[]) => {
    const map = new Map();
    for (const id of ids) {
      if (id === COURT_UUID) {
        map.set(id, { name: 'Court 1', image: 'img.jpg', sportType: 'Padel' });
      }
    }
    return map;
  }),
  getCourtInfoForBooking: vi.fn(),
}));

// Real mappers are intentionally NOT mocked: rows go through the real
// parseTstzrange/mapDbBookingToBooking path so walk-in (user_id NULL)
// mapping and range parsing are verified end to end.

import { getAdminBookingsPageAction } from '@/app/actions/booking.actions';

describe('getAdminBookingsPageAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  });

  // ── Auth & authorization ──────────────────────────────────────

  it('returns error when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await getAdminBookingsPageAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
  });

  it('returns error when caller is not an admin', async () => {
    profilesChain = makeChain({ data: { role: 'User' }, error: null });

    const result = await getAdminBookingsPageAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
    expect(bookingsChain.select).not.toHaveBeenCalled();
  });

  // ── Success path & defaults ───────────────────────────────────

  it('returns mapped bookings with total/page/pageSize on success', async () => {
    const result = await getAdminBookingsPageAction();

    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings![0]).toMatchObject({
      id: 'booking-1',
      bookingNumber: 'KH-123456',
      courtName: 'Court 1',
      sportType: 'Padel',
      date: '2026-11-20',
      startTime: '14:00',
      endTime: '15:00',
      status: 'Confirmed',
      bookingSource: 'ONLINE',
      userId: 'user-1',
    });
  });

  it('orders by created_at desc and applies default page-1 range without filters', async () => {
    await getAdminBookingsPageAction();

    expect(bookingsChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(bookingsChain.range).toHaveBeenCalledWith(0, 24);
    expect(bookingsChain.eq).not.toHaveBeenCalled();
    expect(bookingsChain.filter).not.toHaveBeenCalled();
    expect(bookingsChain.or).not.toHaveBeenCalled();
  });

  it('maps walk-in bookings (user_id NULL) without failing', async () => {
    bookingsResult.data = [makeDbBooking({ user_id: null, booking_source: 'WALK_IN' })];
    bookingsChain = makeChain(bookingsResult);

    const result = await getAdminBookingsPageAction();

    expect(result.success).toBe(true);
    expect(result.bookings![0].userId).toBeNull();
    expect(result.bookings![0].bookingSource).toBe('WALK_IN');
  });

  it('falls back to generic court info when court is not in the map', async () => {
    bookingsResult.data = [makeDbBooking({ court_id: '99999999-9999-4999-8999-999999999999' })];
    bookingsChain = makeChain(bookingsResult);

    const result = await getAdminBookingsPageAction();

    expect(result.success).toBe(true);
    expect(result.bookings![0].courtName).toBe('Court');
  });

  // ── Pagination ────────────────────────────────────────────────

  it('maps page 2 to range(25, 49)', async () => {
    const result = await getAdminBookingsPageAction({ page: 2 });

    expect(result.success).toBe(true);
    expect(result.page).toBe(2);
    expect(bookingsChain.range).toHaveBeenCalledWith(25, 49);
  });

  it('rejects page 0', async () => {
    const result = await getAdminBookingsPageAction({ page: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid page');
  });

  it('rejects non-integer page', async () => {
    const result = await getAdminBookingsPageAction({ page: 1.5 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid page');
  });

  // ── Status filter ─────────────────────────────────────────────

  it('applies whitelisted status filter via .eq', async () => {
    const result = await getAdminBookingsPageAction({ status: 'Cancelled' });

    expect(result.success).toBe(true);
    expect(bookingsChain.eq).toHaveBeenCalledWith('status', 'Cancelled');
  });

  it('rejects a non-whitelisted status', async () => {
    const result = await getAdminBookingsPageAction({ status: 'Bogus' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid status');
    expect(bookingsChain.select).not.toHaveBeenCalled();
  });

  it('ignores empty-string status (treated as no filter)', async () => {
    const result = await getAdminBookingsPageAction({ status: '' });

    expect(result.success).toBe(true);
    expect(bookingsChain.eq).not.toHaveBeenCalled();
  });

  // ── Court filter ──────────────────────────────────────────────

  it('applies UUID court filter via .eq', async () => {
    const result = await getAdminBookingsPageAction({ courtId: COURT_UUID });

    expect(result.success).toBe(true);
    expect(bookingsChain.eq).toHaveBeenCalledWith('court_id', COURT_UUID);
  });

  it('rejects a non-UUID court id', async () => {
    const result = await getAdminBookingsPageAction({ courtId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid court');
    expect(bookingsChain.select).not.toHaveBeenCalled();
  });

  // ── Date filters ──────────────────────────────────────────────

  it('rejects a malformed date', async () => {
    const result = await getAdminBookingsPageAction({ dateFrom: '20-11-2026' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid date');
  });

  it('rejects dateFrom after dateTo', async () => {
    const result = await getAdminBookingsPageAction({
      dateFrom: '2026-11-20',
      dateTo: '2026-11-10',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Start date must be on or before end date');
    expect(bookingsChain.select).not.toHaveBeenCalled();
  });

  it('uses a one-day overlap window when only dateFrom is set', async () => {
    const result = await getAdminBookingsPageAction({ dateFrom: '2026-11-20' });

    expect(result.success).toBe(true);
    expect(bookingsChain.filter).toHaveBeenCalledWith(
      'booking_range',
      'ov',
      '[2026-11-20 00:00:00+00, 2026-11-21 00:00:00+00)'
    );
  });

  it('uses a one-day overlap window when only dateTo is set', async () => {
    const result = await getAdminBookingsPageAction({ dateTo: '2026-11-22' });

    expect(result.success).toBe(true);
    expect(bookingsChain.filter).toHaveBeenCalledWith(
      'booking_range',
      'ov',
      '[2026-11-22 00:00:00+00, 2026-11-23 00:00:00+00)'
    );
  });

  it('overlaps the full [from, to+1) day span when both dates are set', async () => {
    const result = await getAdminBookingsPageAction({
      dateFrom: '2026-11-20',
      dateTo: '2026-11-22',
    });

    expect(result.success).toBe(true);
    expect(bookingsChain.filter).toHaveBeenCalledWith(
      'booking_range',
      'ov',
      '[2026-11-20 00:00:00+00, 2026-11-23 00:00:00+00)'
    );
  });

  // ── Search ────────────────────────────────────────────────────

  it('searches booking_number, user_name, user_email and user_phone via .or ilike', async () => {
    const result = await getAdminBookingsPageAction({ search: 'KH-123456' });

    expect(result.success).toBe(true);
    expect(bookingsChain.or).toHaveBeenCalledWith(
      'booking_number.ilike.%KH-123456%,user_name.ilike.%KH-123456%,user_email.ilike.%KH-123456%,user_phone.ilike.%KH-123456%'
    );
  });

  it('sanitizes PostgREST .or() special characters out of the search term', async () => {
    const result = await getAdminBookingsPageAction({ search: 'a,b"(c)' });

    expect(result.success).toBe(true);
    const orArg = bookingsChain.or.mock.calls[0][0] as string;
    // Commas/quotes/parens from the input became spaces and runs of
    // whitespace were collapsed ('a b c'); remaining commas are only the
    // .or() condition separators.
    expect(orArg).toContain('a b c');
    expect(orArg).not.toContain('"');
    expect(orArg).not.toContain('(');
  });

  it('skips the .or filter when search sanitizes to empty', async () => {
    const result = await getAdminBookingsPageAction({ search: ',"\\' });

    expect(result.success).toBe(true);
    expect(bookingsChain.or).not.toHaveBeenCalled();
  });

  it('escapes ILIKE wildcards so % and _ match literally', async () => {
    const result = await getAdminBookingsPageAction({ search: '50%_off' });

    expect(result.success).toBe(true);
    const orArg = bookingsChain.or.mock.calls[0][0] as string;
    // A single escaping backslash before the wildcard so postgres ILIKE
    // (default escape '\') treats it literally, not as a wildcard.
    expect(orArg).toContain('50\\%\\_off');
    expect(orArg).not.toContain('50%');
  });

  it('collapses runs of whitespace in the search term', async () => {
    const result = await getAdminBookingsPageAction({ search: 'Sara   Ali' });

    expect(result.success).toBe(true);
    expect(bookingsChain.or).toHaveBeenCalledWith(
      'booking_number.ilike.%Sara Ali%,user_name.ilike.%Sara Ali%,user_email.ilike.%Sara Ali%,user_phone.ilike.%Sara Ali%'
    );
  });

  // ── Query error handling ──────────────────────────────────────

  it('returns the database error message on query failure', async () => {
    bookingsResult.error = { message: 'boom' };
    bookingsChain = makeChain(bookingsResult);

    const result = await getAdminBookingsPageAction();

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
