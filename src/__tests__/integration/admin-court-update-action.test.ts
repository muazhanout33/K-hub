import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase server client (per-table chains for clean assertions) ──
const mockGetUser = vi.fn();

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface MockChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (resolve: (value: QueryResult) => void) => void;
}

interface ChainState {
  /** Result of the read side (maybeSingle / thenable await). */
  fetch: QueryResult;
  /** Result of the write side (single after update). */
  write: QueryResult;
}

function makeChain(state: Partial<ChainState>): MockChain {
  const chain = {} as MockChain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(state.fetch ?? { data: null, error: null }));
  chain.single = vi.fn(() =>
    Promise.resolve(state.write ?? { data: null, error: null })
  );
  // Makes the chain thenable, e.g. `await ...in('status', [...])`
  chain.then = (resolve) => resolve(state.fetch ?? { data: null, error: null });
  return chain;
}

const COURT_UUID = '11111111-1111-1111-1111-111111111111';

let profilesChain: MockChain;
let courtsChain: MockChain;
let bookingsChain: MockChain;

function makeDbCourt(overrides: Record<string, unknown> = {}) {
  return {
    id: COURT_UUID,
    name: 'Court One',
    sport_type: 'Padel',
    surface: 'Panoramic',
    is_indoor: true,
    capacity: 4,
    price_per_hour: 250,
    rating: 4.8,
    review_count: 12,
    image_url: '/images/courts/court-one.jpg',
    gallery_urls: [],
    description: 'Indoor padel court',
    features: [],
    rules: [],
    status: 'Available',
    working_hours_open: '07:00:00',
    working_hours_close: '00:00:00',
    slot_duration_minutes: 60,
    created_at: '2026-09-01T12:00:00Z',
    updated_at: '2026-09-15T12:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

function resetChains(overrides: {
  courtRow?: unknown;
  updatedRow?: unknown;
  bookings?: unknown;
  role?: string;
  profile?: unknown;
} = {}) {
  profilesChain = makeChain({ fetch: { data: { role: overrides.role ?? 'Admin' }, error: null } });
  if ('profile' in overrides) {
    profilesChain = makeChain({ fetch: { data: overrides.profile, error: null } });
  }
  courtsChain = makeChain({
    fetch: {
      data: 'courtRow' in overrides ? overrides.courtRow : makeDbCourt(),
      error: null,
    },
    write: {
      data: 'updatedRow' in overrides ? overrides.updatedRow : makeDbCourt(),
      error: null,
    },
  });
  bookingsChain = makeChain({
    fetch: { data: overrides.bookings ?? [], error: null },
  });
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profilesChain;
      if (table === 'bookings') return bookingsChain;
      return courtsChain;
    }),
  })),
}));

// Real mapper + availability helpers are intentionally NOT mocked:
// the outside-hours check and field mapping run against real logic.

import { updateCourtAction, UpdateCourtPayload } from '@/app/actions/court.actions';

function validPayload(overrides: Partial<UpdateCourtPayload> = {}): UpdateCourtPayload {
  return {
    courtId: COURT_UUID,
    name: 'Court One',
    sportType: 'Padel',
    surface: 'Panoramic',
    pricePerHour: 250,
    workingHoursOpen: '09:00',
    workingHoursClose: '18:00',
    status: 'Available',
    imageUrl: '/images/courts/court-one.jpg',
    ...overrides,
  };
}

describe('updateCourtAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  });

  // ── Auth & authorization (A3) ─────────────────────────────────

  it('returns error when unauthenticated and never queries courts', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await updateCourtAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
    expect(courtsChain.select).not.toHaveBeenCalled();
    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  it('returns error when caller is not an admin', async () => {
    resetChains({ role: 'User' });

    const result = await updateCourtAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  it('fails closed when the profile row is missing', async () => {
    resetChains({ profile: null });

    const result = await updateCourtAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  // ── Server-side validation (authoritative) ────────────────────

  it('rejects a malformed court id', async () => {
    const result = await updateCourtAction(validPayload({ courtId: 'not-a-uuid' }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid court id');
    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  it('rejects an empty and an oversized court name', async () => {
    const empty = await updateCourtAction(validPayload({ name: '   ' }));
    expect(empty.success).toBe(false);
    expect(empty.error).toContain('court name');

    const oversized = await updateCourtAction(validPayload({ name: 'x'.repeat(121) }));
    expect(oversized.success).toBe(false);
    expect(oversized.error).toContain('court name');

    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  it('rejects prices outside 0…100,000 and with more than two decimals', async () => {
    for (const price of [-1, 100_001, 12.345, NaN, Infinity]) {
      const result = await updateCourtAction(validPayload({ pricePerHour: price }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Price must be a number');
    }
    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  it('rejects malformed working hours and identical open/close times', async () => {
    const badFormat = await updateCourtAction(validPayload({ workingHoursOpen: '7:00' }));
    expect(badFormat.success).toBe(false);
    expect(badFormat.error).toContain('HH:mm');

    const equalTimes = await updateCourtAction(
      validPayload({ workingHoursOpen: '09:00', workingHoursClose: '09:00' })
    );
    expect(equalTimes.success).toBe(false);
    expect(equalTimes.error).toContain('cannot be the same');

    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  it('allows overnight working hours (close < open)', async () => {
    resetChains({ courtRow: makeDbCourt({ working_hours_open: '07:00:00', working_hours_close: '00:00:00' }) });

    const result = await updateCourtAction(
      validPayload({ workingHoursOpen: '09:00', workingHoursClose: '02:00' })
    );

    expect(result.success).toBe(true);
    expect(courtsChain.update).toHaveBeenCalled();
  });

  it('trims and accepts surrounding whitespace in the image URL (D1)', async () => {
    const result = await updateCourtAction(
      validPayload({ imageUrl: '  /images/courts/x.jpg  ' })
    );

    expect(result.success).toBe(true);
    expect(courtsChain.update.mock.calls[0][0]).toMatchObject({
      image_url: '/images/courts/x.jpg',
    });
  });

  it('rejects statuses outside the approved whitelist', async () => {
    for (const status of ['Booked', 'Starts Soon', 'Closed']) {
      const result = await updateCourtAction(validPayload({ status }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Available');
    }
    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  it('rejects sport types outside the database enum', async () => {
    const result = await updateCourtAction(validPayload({ sportType: 'Basketball' }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid sport type');
    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS and non-local image URLs (D1)', async () => {
    for (const imageUrl of [
      'javascript:alert(1)',
      'http://example.com/court.jpg',
      'ftp://example.com/court.jpg',
      '',
      'https://',
    ]) {
      const result = await updateCourtAction(validPayload({ imageUrl }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Image URL');
    }
    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  it('accepts an absolute HTTPS image URL (D1)', async () => {
    const result = await updateCourtAction(
      validPayload({ imageUrl: 'https://cdn.example.com/court.jpg' })
    );

    expect(result.success).toBe(true);
    expect(courtsChain.update).toHaveBeenCalled();
  });

  // ── Existence ─────────────────────────────────────────────────

  it('returns "Court not found." for a missing or soft-deleted court', async () => {
    resetChains({ courtRow: null });

    const result = await updateCourtAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Court not found.');
    expect(courtsChain.update).not.toHaveBeenCalled();
  });

  // ── Success path & partial-update payload ─────────────────────

  it('writes ONLY the seven approved fields in an explicit HH:mm:00 payload', async () => {
    const updated = makeDbCourt({
      name: 'Renamed Court',
      price_per_hour: 300,
      working_hours_open: '09:00:00',
      working_hours_close: '18:00:00',
    });
    resetChains({ updatedRow: updated, bookings: [] });

    const result = await updateCourtAction(
      validPayload({ name: '  Renamed Court  ', pricePerHour: 300 })
    );

    expect(result.success).toBe(true);
    expect(courtsChain.update).toHaveBeenCalledTimes(1);
    const updateArg = courtsChain.update.mock.calls[0][0] as Record<string, unknown>;

    // Exact key set — never-touch columns (slot_duration_minutes, rating,
    // review_count, capacity, is_indoor, deleted_at, gallery…) are absent.
    expect(Object.keys(updateArg).sort()).toEqual(
      [
        'image_url',
        'name',
        'price_per_hour',
        'sport_type',
        'status',
        'surface',
        'working_hours_close',
        'working_hours_open',
      ].sort()
    );
    expect(updateArg).toEqual({
      name: 'Renamed Court', // trimmed
      sport_type: 'Padel',
      surface: 'Panoramic',
      price_per_hour: 300,
      working_hours_open: '09:00:00',
      working_hours_close: '18:00:00',
      status: 'Available',
      image_url: '/images/courts/court-one.jpg',
    });

    // Returns the mapped court with domain field names.
    expect(result.court).toMatchObject({
      id: COURT_UUID,
      name: 'Renamed Court',
      pricePerHour: 300,
      workingHours: { open: '09:00', close: '18:00' },
      slotDurationMinutes: 60,
    });
  });

  // ── Status preservation (review fix #1) ────────────────────────

  it('preserves a non-editable current status when status is omitted from the payload (fix #1)', async () => {
    resetChains({ courtRow: makeDbCourt({ status: 'Booked' }) });
    const { status, ...withoutStatus } = validPayload();
    expect(status).toBe('Available'); // the value we deliberately strip

    const result = await updateCourtAction(withoutStatus);

    expect(result.success).toBe(true);
    expect(courtsChain.update).toHaveBeenCalledTimes(1);
    const updateArg = courtsChain.update.mock.calls[0][0] as Record<string, unknown>;
    // No `status` key ⇒ the row keeps 'Booked'; it can never silently become 'Available'.
    expect(updateArg).not.toHaveProperty('status');
    expect(updateArg).toMatchObject({ name: 'Court One', price_per_hour: 250 });
  });

  it('still writes an explicitly chosen whitelisted status from a Booked court (fix #1)', async () => {
    resetChains({ courtRow: makeDbCourt({ status: 'Booked' }) });

    const result = await updateCourtAction(validPayload({ status: 'Maintenance' }));

    expect(result.success).toBe(true);
    expect(courtsChain.update.mock.calls[0][0]).toMatchObject({ status: 'Maintenance' });
  });

  // ── Hours-change warning (bookings never modified) ────────────

  it('skips the bookings pre-check when working hours are unchanged', async () => {
    resetChains({
      courtRow: makeDbCourt({ working_hours_open: '09:00:00', working_hours_close: '18:00:00' }),
      bookings: [{ booking_range: '[2026-10-20 10:00:00+00, 2026-10-20 11:00:00+00)' }],
    });

    const result = await updateCourtAction(validPayload());

    expect(result.success).toBe(true);
    expect(bookingsChain.select).not.toHaveBeenCalled();
    expect(courtsChain.update).toHaveBeenCalled();
  });

  it('warns (without writing) when new hours would strand existing bookings', async () => {
    // Current hours 07:00–00:00; proposed 10:00–16:00.
    // Booking at 18:00–19:00 falls outside the proposal; 11:00–12:00 stays inside.
    resetChains({
      bookings: [
        { booking_range: '[2026-10-20 18:00:00+00, 2026-10-20 19:00:00+00)' },
        { booking_range: '[2026-10-20 11:00:00+00, 2026-10-20 12:00:00+00)' },
      ],
    });

    const result = await updateCourtAction(
      validPayload({ workingHoursOpen: '10:00', workingHoursClose: '16:00' })
    );

    expect(result.success).toBe(false);
    expect(result.warningCode).toBe('OUTSIDE_WORKING_HOURS');
    expect(result.affectedBookingCount).toBe(1);
    expect(result.error).toContain('1 existing booking');
    // Nothing was written and bookings were never touched.
    expect(courtsChain.update).not.toHaveBeenCalled();
    expect(bookingsChain.update).not.toHaveBeenCalled();
  });

  it('proceeds with the write once acknowledgeOutsideHours is set', async () => {
    resetChains({
      bookings: [
        { booking_range: '[2026-10-20 18:00:00+00, 2026-10-20 19:00:00+00)' },
      ],
    });

    const result = await updateCourtAction(
      validPayload({
        workingHoursOpen: '10:00',
        workingHoursClose: '16:00',
        acknowledgeOutsideHours: true,
      })
    );

    expect(result.success).toBe(true);
    expect(bookingsChain.select).not.toHaveBeenCalled(); // acknowledged → skip check
    expect(courtsChain.update).toHaveBeenCalled();
  });

  it('fails closed with no court write when the bookings pre-check query fails (fix #2)', async () => {
    resetChains();
    bookingsChain = makeChain({ fetch: { data: null, error: { message: 'boom' } } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await updateCourtAction(
      validPayload({ workingHoursOpen: '10:00', workingHoursClose: '16:00' })
    );

    expect(result.success).toBe(false);
    // Safe, actionable message for the admin; raw diagnostics never leak.
    expect(result.error).toBe(
      'Could not verify existing bookings against the new working hours. Please try again.'
    );
    expect(result.error).not.toContain('boom');
    // Review fix #2: no write happens when the pre-check cannot run.
    expect(courtsChain.update).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('outside-hours pre-check failed'),
      'boom'
    );
    consoleSpy.mockRestore();
  });

  // ── Update-query guards (review fix #3) ────────────────────────

  it('guards the UPDATE itself with deleted_at IS NULL after the id (fix #3)', async () => {
    const result = await updateCourtAction(validPayload());

    expect(result.success).toBe(true);
    expect(courtsChain.update).toHaveBeenCalledTimes(1);
    // `is('deleted_at', null)` runs once for the existence check and once on the
    // UPDATE query itself — the second call must come after `.update(...)`.
    expect(courtsChain.is).toHaveBeenCalledTimes(2);
    expect(courtsChain.is.mock.calls[1]).toEqual(['deleted_at', null]);
    expect(courtsChain.is.mock.invocationCallOrder[1]).toBeGreaterThan(
      courtsChain.update.mock.invocationCallOrder[0]
    );
  });

  it('cannot modify a court that becomes soft-deleted before the write (fix #3)', async () => {
    resetChains();
    // Zero affected rows (row vanished / soft-deleted between check and write)
    // surfaces from supabase as PGRST116.
    courtsChain.single = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: {
          message: 'JSON object requested, multiple (or no) rows returned',
          code: 'PGRST116',
        },
      })
    );
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await updateCourtAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Court not found.');
    expect(result.court).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('courts update failed'),
      'JSON object requested, multiple (or no) rows returned'
    );
    consoleSpy.mockRestore();
  });

  // ── Error handling ────────────────────────────────────────────

  it('returns a safe generic error on write failure and logs the raw message server-side', async () => {
    resetChains();
    courtsChain.single = vi.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await updateCourtAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to save court changes. Please try again.');
    expect(result.error).not.toContain('boom');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('courts update failed'),
      'boom'
    );
    consoleSpy.mockRestore();
  });

  it('returns a safe generic error when the court fetch fails', async () => {
    resetChains();
    courtsChain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: 'relation boom' } })
    );
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await updateCourtAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to save court changes. Please try again.');
    expect(result.error).not.toContain('boom');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('court fetch failed'),
      'relation boom'
    );
    consoleSpy.mockRestore();
  });
});
