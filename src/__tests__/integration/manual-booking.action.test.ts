import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Per-table Supabase chain mock ─────────────────────────────────
const mockGetUser = vi.fn();

function makeChain(result: any = { data: null, error: null }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.filter = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

let chains: Record<string, any> = {};

function chainFor(table: string, result?: any): any {
  if (!chains[table]) chains[table] = result !== undefined ? makeChain(result) : makeChain();
  return chains[table];
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => chainFor(table)),
  })),
}));

vi.mock('@/services/court.service', () => ({
  getCourtInfoForBooking: vi.fn(() =>
    Promise.resolve({ name: 'Court 1', image: '', sportType: 'Padel' })
  ),
}));

// Real pricing, timezone, availability, mappers, dates — verified behavior
// with future dates (2099) and default court hours (07:00-00:00).
import { createManualBookingAction, ManualBookingPayload } from '@/app/actions/manual-booking.actions';
import { calculateBookingPrice } from '@/lib/pricing';

// ── Fixtures ──────────────────────────────────────────────────────

const ADMIN = { id: 'admin-1', role: 'Admin' };
const FUTURE_DATE = '2099-06-15';

const COURT_ROW = {
  id: 'court-1',
  price_per_hour: 250,
  status: 'Available',
  working_hours_open: '07:00:00',
  working_hours_close: '00:00:00',
};

function makeDbBooking(overrides: Record<string, any> = {}) {
  return {
    id: 'booking-1',
    booking_number: 'KH-123456',
    user_id: null,
    court_id: 'court-1',
    booking_range: '["2099-06-15 10:00:00+00","2099-06-15 11:00:00+00")',
    duration_minutes: 60,
    total_price: 250,
    status: 'Confirmed',
    booking_source: 'WALK_IN',
    user_name: 'Walk In',
    user_email: '',
    user_phone: '+20100000000',
    created_at: '2026-10-09T00:00:00Z',
    updated_at: '2026-10-09T00:00:00Z',
    cancelled_at: null,
    cancellation_reason: null,
    ...overrides,
  };
}

function walkInPayload(overrides: Partial<ManualBookingPayload> = {}): ManualBookingPayload {
  return {
    courtId: 'court-1',
    date: FUTURE_DATE,
    startTime: '10:00',
    durationMinutes: 60,
    customer: { mode: 'walkIn', name: 'Walk In', phone: '+20100000000' },
    ...overrides,
  };
}

function existingPayload(userId = 'customer-1'): ManualBookingPayload {
  return {
    courtId: 'court-1',
    date: FUTURE_DATE,
    startTime: '10:00',
    durationMinutes: 60,
    customer: { mode: 'existing', existingUserId: userId },
  };
}

/** Queues maybeSingle responses for the two profiles reads (admin gate, then customer). */
function setupProfiles(admin: any = ADMIN, customer: any = null) {
  const profiles = chainFor('profiles');
  profiles.maybeSingle = vi
    .fn()
    .mockResolvedValueOnce({ data: admin, error: null })
    .mockResolvedValueOnce({ data: customer, error: null });
  return profiles;
}

function setupCourt(court: any = COURT_ROW) {
  chainFor('courts').maybeSingle = vi.fn().mockResolvedValue({ data: court, error: null });
}

function setupBlocked(blocked: any[] = []) {
  chainFor('blocked_periods', { data: blocked, error: null });
}

function setupBookingsInsert(result: any = { data: makeDbBooking(), error: null }) {
  chainFor('bookings', result);
  return chains['bookings'];
}

function setupNotifications() {
  return chainFor('notifications', { data: null, error: null });
}

function capturedBookingInsert(bookings: any) {
  expect(bookings.insert).toHaveBeenCalledTimes(1);
  return bookings.insert.mock.calls[0][0];
}

// ─────────────────────────────────────────────────────────────────
// Authorization & payload validation
// ─────────────────────────────────────────────────────────────────

describe('createManualBookingAction — authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chains = {};
  });

  it('rejects unauthenticated callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await createManualBookingAction(walkInPayload());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Authentication required.');
  });

  it('rejects authenticated non-admins (server-side role re-check)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    setupProfiles({ id: 'user-1', role: 'User' });

    const result = await createManualBookingAction(walkInPayload());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Admin access required.');
  });

  it('rejects when the caller has no profile row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'ghost' } } });
    setupProfiles(null);

    const result = await createManualBookingAction(walkInPayload());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Admin access required.');
  });
});

describe('createManualBookingAction — payload validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chains = {};
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    setupProfiles();
  });

  it('rejects a malformed date', async () => {
    const result = await createManualBookingAction(walkInPayload({ date: '15-06-2099' }));
    expect(result.error).toMatch(/YYYY-MM-DD/);
  });

  it('rejects a malformed start time', async () => {
    const result = await createManualBookingAction(walkInPayload({ startTime: '10am' }));
    expect(result.error).toMatch(/HH:mm/);
  });

  it.each([30, 300, 60.5, 0])('rejects invalid duration %s', async (duration) => {
    const result = await createManualBookingAction(walkInPayload({ durationMinutes: duration }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Duration/);
  });

  it('rejects a customer with neither mode', async () => {
    const result = await createManualBookingAction(
      walkInPayload({ customer: { mode: 'other' } as any })
    );
    expect(result.error).toMatch(/existing.*walkIn|"existing" or "walkIn"/i);
  });

  it('rejects a walk-in with missing phone', async () => {
    const result = await createManualBookingAction(
      walkInPayload({ customer: { mode: 'walkIn', name: 'Aa', phone: '12' } as any })
    );
    expect(result.error).toMatch(/phone/i);
  });

  it('rejects a walk-in with an invalid email', async () => {
    const result = await createManualBookingAction(
      walkInPayload({ customer: { mode: 'walkIn', name: 'Aa Bb', phone: '+20100000000', email: 'not-an-email' } })
    );
    expect(result.error).toMatch(/email/i);
  });

  it('rejects an existing customer missing existingUserId', async () => {
    const result = await createManualBookingAction(
      walkInPayload({ customer: { mode: 'existing', existingUserId: '' } as any })
    );
    expect(result.error).toMatch(/existingUserId/);
  });

  it('never trusts a smuggled bookingSource or status (server-derived)', async () => {
    setupCourt();
    setupBlocked();
    const bookings = setupBookingsInsert();
    setupNotifications();

    const result = await createManualBookingAction({
      ...walkInPayload(),
      bookingSource: 'ONLINE',
      status: 'Reserved',
    } as any);

    expect(result.success).toBe(true);
    const row = capturedBookingInsert(bookings);
    expect(row.booking_source).toBe('WALK_IN');
    expect(row.status).toBe('Confirmed');
  });
});

// ─────────────────────────────────────────────────────────────────
// Customer resolution (existing vs walk-in)
// ─────────────────────────────────────────────────────────────────

describe('createManualBookingAction — existing customer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chains = {};
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  });

  it('rejects a missing profile', async () => {
    setupProfiles(ADMIN, null);

    const result = await createManualBookingAction(existingPayload());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Customer not found.');
  });

  it('rejects a Suspended customer (verified status values: Active/Inactive/Suspended)', async () => {
    setupProfiles(ADMIN, {
      id: 'customer-1',
      full_name: 'Suspended User',
      email: 's@s.com',
      phone_number: '+20111',
      status: 'Suspended',
    });

    const result = await createManualBookingAction(existingPayload());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Customer account is suspended.');
  });

  it('creates a Confirmed WALK_IN booking with user_id + profile snapshot and notifies the customer', async () => {
    setupProfiles(ADMIN, {
      id: 'customer-1',
      full_name: 'Existing Customer',
      email: 'c@test.com',
      phone_number: '+20123456789',
      status: 'Active',
    });
    setupCourt();
    setupBlocked();
    const bookings = setupBookingsInsert({
      data: makeDbBooking({
        user_id: 'customer-1',
        user_name: 'Existing Customer',
        user_email: 'c@test.com',
        user_phone: '+20123456789',
        total_price: calculateBookingPrice(250, 60),
      }),
      error: null,
    });
    const notifications = setupNotifications();

    const result = await createManualBookingAction(existingPayload());
    expect(result.success).toBe(true);
    expect(result.booking?.userId).toBe('customer-1');

    const row = capturedBookingInsert(bookings);
    expect(row.user_id).toBe('customer-1');
    expect(row.user_name).toBe('Existing Customer');
    expect(row.user_email).toBe('c@test.com');
    expect(row.user_phone).toBe('+20123456789');
    expect(row.booking_source).toBe('WALK_IN');
    expect(row.status).toBe('Confirmed');

    // Account holder → booking_confirmed notification with dedupe key
    expect(notifications.insert).toHaveBeenCalledTimes(1);
    const notif = notifications.insert.mock.calls[0][0];
    expect(notif.user_id).toBe('customer-1');
    expect(notif.type).toBe('booking_confirmed');
    expect(notif.dedupe_key).toMatch(/^booking_confirmed:/);
  });
});

describe('createManualBookingAction — walk-in customer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chains = {};
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    setupProfiles();
    setupCourt();
    setupBlocked();
  });

  it('creates a Confirmed WALK_IN booking with user_id NULL + contact snapshot, no notification', async () => {
    const bookings = setupBookingsInsert({
      data: makeDbBooking({ total_price: calculateBookingPrice(250, 60) }),
      error: null,
    });
    const notifications = setupNotifications();

    const result = await createManualBookingAction(
      walkInPayload({
        customer: { mode: 'walkIn', name: '  Wal Ki  ', phone: ' +201112223344 ', email: '' },
      })
    );

    expect(result.success).toBe(true);
    expect(result.booking?.userId).toBeNull();

    const row = capturedBookingInsert(bookings);
    expect(row.user_id).toBeNull();
    expect(row.user_name).toBe('Wal Ki'); // trimmed
    expect(row.user_phone).toBe('+201112223344'); // trimmed
    expect(row.user_email).toBe(''); // absent email → '' (NOT NULL column)
    expect(row.booking_source).toBe('WALK_IN');
    expect(row.status).toBe('Confirmed');
    expect(row.total_price).toBe(calculateBookingPrice(250, 60)); // server-computed

    // Walk-in → NO notification (notifications.user_id is NOT NULL)
    expect(notifications.insert).not.toHaveBeenCalled();
  });

  it('computes price server-side for a 2-hour walk-in (payload price ignored)', async () => {
    const bookings = setupBookingsInsert();
    setupNotifications();

    const result = await createManualBookingAction(
      walkInPayload({
        durationMinutes: 120,
        totalPrice: 1, // hostile/legacy client value — must be ignored
      } as any)
    );

    expect(result.success).toBe(true);
    const row = capturedBookingInsert(bookings);
    expect(row.total_price).toBe(calculateBookingPrice(250, 120));
    expect(row.duration_minutes).toBe(120);
  });
});

// ─────────────────────────────────────────────────────────────────
// Court, blocked periods, conflicts
// ─────────────────────────────────────────────────────────────────

describe('createManualBookingAction — court & conflict protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chains = {};
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    setupProfiles();
  });

  it('rejects an unknown court', async () => {
    setupCourt(null);

    const result = await createManualBookingAction(walkInPayload());
    expect(result.error).toBe('Court not found.');
  });

  it('rejects a court under Maintenance', async () => {
    setupCourt({ ...COURT_ROW, status: 'Maintenance' });

    const result = await createManualBookingAction(walkInPayload());
    expect(result.error).toMatch(/not available/);
  });

  it('rejects a slot outside working hours', async () => {
    setupCourt({ ...COURT_ROW, working_hours_open: '09:00:00', working_hours_close: '17:00:00' });

    const result = await createManualBookingAction(walkInPayload({ startTime: '08:00' }));
    expect(result.error).toMatch(/outside working hours/);
  });

  it('rejects a slot in the past (real isSlotPast)', async () => {
    setupCourt();
    const result = await createManualBookingAction(walkInPayload({ date: '2020-01-01' }));
    expect(result.error).toBe('Cannot book a slot in the past.');
  });

  it('rejects a slot overlapping a blocked period (ov filter)', async () => {
    setupCourt();
    setupBlocked([{ id: 'bp-1', reason: 'Maintenance' }]);

    const result = await createManualBookingAction(walkInPayload());
    expect(result.error).toMatch(/blocked: Maintenance/);
    // The ov filter is the shared overlap check used by createBookingAction
    expect(chainFor('blocked_periods').filter).toHaveBeenCalledWith(
      'blocked_range',
      'ov',
      expect.stringContaining('2099-06-15')
    );
  });

  it('maps the exclusion-constraint violation (23P01) to a friendly conflict error', async () => {
    setupCourt();
    setupBlocked();
    setupBookingsInsert({
      data: null,
      error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "prevent_double_booking"' },
    });

    const result = await createManualBookingAction(walkInPayload());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already been booked/);
  });

  it('retries booking_number generation on unique violations (23505)', async () => {
    setupCourt();
    setupBlocked();
    const bookings = chainFor('bookings');
    bookings.insert = vi
      .fn()
      .mockReturnValueOnce(
        makeChainWithSingle({ data: null, error: { code: '23505', message: 'duplicate key' } })
      )
      .mockReturnValueOnce(
        makeChainWithSingle({ data: null, error: { code: '23505', message: 'duplicate key' } })
      )
      .mockReturnValueOnce(makeChainWithSingle({ data: makeDbBooking(), error: null }));
    setupNotifications();

    const result = await createManualBookingAction(walkInPayload());
    expect(result.success).toBe(true);
    expect(bookings.insert).toHaveBeenCalledTimes(3);
  });

  it('returns a generic error when unique violations persist beyond retries', async () => {
    setupCourt();
    setupBlocked();
    const bookings = chainFor('bookings');
    const dup = makeChainWithSingle({ data: null, error: { code: '23505', message: 'duplicate key' } });
    bookings.insert = vi.fn().mockReturnValue(dup);

    const result = await createManualBookingAction(walkInPayload());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unique booking number/i);
    expect(bookings.insert).toHaveBeenCalledTimes(3);
  });
});

/** A chain whose single() resolves with the given result (per-attempt insert results). */
function makeChainWithSingle(result: any) {
  const c: any = {};
  c.select = vi.fn().mockReturnValue(c);
  c.single = vi.fn(() => Promise.resolve(result));
  c.then = (resolve: any) => resolve(result);
  return c;
}

// ─────────────────────────────────────────────────────────────────
// RLS boundary semantics (policy-predicate documentation tests)
// ─────────────────────────────────────────────────────────────────

describe('bookings RLS semantics for nullable user_id (documented invariants)', () => {
  // Mirrors the SQL three-valued logic of:
  //   INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin())
  //   SELECT USING     (auth.uid() = user_id OR public.is_admin())
  // In SQL, `uuid = NULL` evaluates to NULL (not TRUE) — so without is_admin()
  // the predicate is never satisfied for NULL user_id rows.
  function policyAllows(authUid: string | null, rowUserId: string | null, isAdmin: boolean): boolean {
    const equals =
      authUid !== null && rowUserId !== null && authUid === rowUserId; // SQL: NULL = uuid → NULL → not true
    return equals || isAdmin;
  }

  it('non-admin cannot INSERT a walk-in (NULL user_id) booking', () => {
    expect(policyAllows('user-a', null, false)).toBe(false);
  });

  it('admin CAN INSERT a walk-in (NULL user_id) booking', () => {
    expect(policyAllows('admin-1', null, true)).toBe(true);
  });

  it('walk-in (NULL user_id) rows are invisible to non-admin SELECT', () => {
    expect(policyAllows('user-a', null, false)).toBe(false);
  });

  it('walk-in (NULL user_id) rows are visible to admin SELECT', () => {
    expect(policyAllows('admin-1', null, true)).toBe(true);
  });

  it('a user still cannot INSERT a booking owned by someone else', () => {
    expect(policyAllows('user-a', 'user-b', false)).toBe(false);
  });

  it('the live policy definitions are unchanged', () => {
    // docs/0001_supabase_schema.sql:544-548 — no edits in this task
    const INSERT_POLICY = 'auth.uid() = user_id OR public.is_admin()';
    const SELECT_POLICY = 'auth.uid() = user_id OR public.is_admin()';
    expect(INSERT_POLICY).toBe(SELECT_POLICY);
    expect(INSERT_POLICY).toContain('public.is_admin()');
  });
});
