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
  filter: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (resolve: (value: QueryResult) => void) => void;
}

interface ChainState {
  /** Resolved by `maybeSingle()` (point lookups: profiles role, court). */
  singleResult?: QueryResult;
  /** Resolved by `single()` (insert+select return). */
  writeResult?: QueryResult;
  /** Resolved when the chain is awaited directly (list / overlap / delete). */
  thenResult?: QueryResult;
}

function makeChain(state: ChainState = {}): MockChain {
  const chain = {} as MockChain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.filter = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve(state.singleResult ?? { data: null, error: null })
  );
  chain.single = vi.fn(() => Promise.resolve(state.writeResult ?? { data: null, error: null }));
  // Thenable: `await ...order(...)` / `await ...filter(...)` / `await ...select(...)`
  chain.then = (resolve) => resolve(state.thenResult ?? { data: [], error: null });
  return chain;
}

const COURT_UUID = '11111111-1111-1111-1111-111111111111';
const BLOCK_ID = '22222222-2222-2222-2222-222222222222';
const EXPECTED_RANGE = '[2099-06-15 10:00:00+00, 2099-06-15 12:00:00+00)';

let profilesChain: MockChain;
let courtsChain: MockChain;
let bookingsChain: MockChain;
let blockedChain: MockChain;

function makeDbBlockedPeriod(overrides: Record<string, unknown> = {}) {
  return {
    id: BLOCK_ID,
    court_id: COURT_UUID,
    blocked_range: '["2099-06-15 10:00:00+00","2099-06-15 12:00:00+00")',
    reason: 'Deep cleaning',
    created_by: 'admin-1',
    created_at: '2099-01-01T00:00:00Z',
    ...overrides,
  };
}

function resetChains(overrides: {
  profile?: unknown;
  profileError?: { message: string } | null;
  courtRow?: unknown;
  courtError?: { message: string } | null;
  bookings?: unknown;
  bookingsError?: { message: string } | null;
  blockedList?: unknown;
  blockedListError?: { message: string } | null;
  insertedRow?: unknown;
  insertError?: { message: string; code?: string } | null;
  deletedRows?: unknown;
  deleteError?: { message: string } | null;
} = {}) {
  profilesChain = makeChain({
    singleResult: {
      data: 'profile' in overrides ? overrides.profile : { role: 'Admin' },
      error: overrides.profileError ?? null,
    },
  });
  courtsChain = makeChain({
    singleResult: {
      data: 'courtRow' in overrides ? overrides.courtRow : { id: COURT_UUID },
      error: overrides.courtError ?? null,
    },
  });
  bookingsChain = makeChain({
    thenResult: {
      data: 'bookings' in overrides ? overrides.bookings : [],
      error: overrides.bookingsError ?? null,
    },
  });
  const blockedThen: QueryResult = 'deletedRows' in overrides
    ? { data: overrides.deletedRows, error: overrides.deleteError ?? null }
    : {
        data: 'blockedList' in overrides ? overrides.blockedList : [],
        error: overrides.blockedListError ?? null,
      };
  blockedChain = makeChain({
    thenResult: blockedThen,
    // `.single()` after insert+select resolves the write result
    writeResult: {
      data: 'insertedRow' in overrides ? overrides.insertedRow : makeDbBlockedPeriod(),
      error: overrides.insertError ?? null,
    },
  });
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profilesChain;
      if (table === 'courts') return courtsChain;
      if (table === 'bookings') return bookingsChain;
      return blockedChain;
    }),
  })),
}));

// Partial mock: formatTstzrange is spied (to prove rejection happens BEFORE
// range formatting); parse/mapping helpers stay real so row → domain mapping
// runs through the genuine mapper.
vi.mock('@/lib/mappers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mappers')>();
  return {
    ...actual,
    formatTstzrange: vi.fn((...args: Parameters<typeof actual.formatTstzrange>) =>
      actual.formatTstzrange(...args)
    ),
  };
});

import {
  getBlockedPeriodsAction,
  createBlockedPeriodAction,
  deleteBlockedPeriodAction,
  CreateBlockedPeriodPayload,
} from '@/app/actions/blocked-period.actions';
import { formatTstzrange } from '@/lib/mappers';

function validPayload(overrides: Partial<CreateBlockedPeriodPayload> = {}): CreateBlockedPeriodPayload {
  return {
    courtId: COURT_UUID,
    date: '2099-06-15',
    startTime: '10:00',
    endTime: '12:00',
    reason: 'Deep cleaning',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetChains();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
});

// ── A3 authorization (all three actions) ─────────────────────────────

describe('authorization (A3 fail-closed)', () => {
  it('getBlockedPeriodsAction rejects unauthenticated callers before any query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await getBlockedPeriodsAction();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
    expect(blockedChain.select).not.toHaveBeenCalled();
  });

  it('getBlockedPeriodsAction rejects non-admin callers before any query', async () => {
    resetChains({ profile: { role: 'User' } });

    const result = await getBlockedPeriodsAction();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
    expect(blockedChain.select).not.toHaveBeenCalled();
  });

  it('createBlockedPeriodAction rejects unauthenticated callers before validating or writing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
    expect(courtsChain.maybeSingle).not.toHaveBeenCalled();
    expect(blockedChain.insert).not.toHaveBeenCalled();
  });

  it('createBlockedPeriodAction rejects non-admin callers before validating or writing', async () => {
    resetChains({ profile: { role: 'User' } });

    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
    expect(courtsChain.maybeSingle).not.toHaveBeenCalled();
    expect(blockedChain.insert).not.toHaveBeenCalled();
  });

  it('createBlockedPeriodAction fails closed when the profile query itself errors', async () => {
    resetChains({ profile: null, profileError: { message: 'boom' } });

    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
    expect(blockedChain.insert).not.toHaveBeenCalled();
  });

  it('deleteBlockedPeriodAction rejects unauthenticated callers before deleting', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await deleteBlockedPeriodAction(BLOCK_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
    expect(blockedChain.delete).not.toHaveBeenCalled();
  });

  it('deleteBlockedPeriodAction rejects non-admin callers before deleting', async () => {
    resetChains({ profile: { role: 'User' } });

    const result = await deleteBlockedPeriodAction(BLOCK_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
    expect(blockedChain.delete).not.toHaveBeenCalled();
  });
});

// ── Create: input validation ─────────────────────────────────────────

describe('createBlockedPeriodAction — validation', () => {
  it('rejects a non-UUID court id', async () => {
    const result = await createBlockedPeriodAction(validPayload({ courtId: 'court-1' }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid court id.');
    expect(courtsChain.maybeSingle).not.toHaveBeenCalled();
    expect(blockedChain.insert).not.toHaveBeenCalled();
  });

  it('rejects a malformed date (string shape)', async () => {
    const result = await createBlockedPeriodAction(validPayload({ date: '15-06-2099' }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Date must be YYYY-MM-DD.');
    expect(formatTstzrange).not.toHaveBeenCalled();
  });

  it('rejects a well-shaped but impossible calendar date', async () => {
    const result = await createBlockedPeriodAction(validPayload({ date: '2099-02-30' }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Date is not a valid calendar date.');
    expect(formatTstzrange).not.toHaveBeenCalled();
  });

  it('accepts a real leap day (2100-02-28 is invalid, 2096-02-29 is valid)', async () => {
    const invalid = await createBlockedPeriodAction(validPayload({ date: '2100-02-29' }));
    expect(invalid.success).toBe(false);
    expect(invalid.error).toBe('Date is not a valid calendar date.');

    const valid = await createBlockedPeriodAction(validPayload({ date: '2096-02-29' }));
    expect(valid.success).toBe(true);
  });

  it('rejects a non-HH:mm start time', async () => {
    const result = await createBlockedPeriodAction(validPayload({ startTime: '10am' }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Start time must be HH:mm.');
    expect(formatTstzrange).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range end time', async () => {
    const result = await createBlockedPeriodAction(validPayload({ endTime: '25:00' }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('End time must be HH:mm.');
    expect(formatTstzrange).not.toHaveBeenCalled();
  });

  it('rejects endTime == startTime BEFORE calling formatTstzrange (never a 24h block)', async () => {
    const result = await createBlockedPeriodAction(
      validPayload({ startTime: '10:00', endTime: '10:00' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('End time must be after start time.');
    expect(formatTstzrange).not.toHaveBeenCalled();
    expect(blockedChain.insert).not.toHaveBeenCalled();
  });

  it('rejects endTime < startTime (cross-midnight) BEFORE calling formatTstzrange', async () => {
    const result = await createBlockedPeriodAction(
      validPayload({ startTime: '23:00', endTime: '01:00' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('End time must be after start time.');
    expect(formatTstzrange).not.toHaveBeenCalled();
    expect(blockedChain.insert).not.toHaveBeenCalled();
  });

  it('rejects an empty reason', async () => {
    const result = await createBlockedPeriodAction(validPayload({ reason: '   ' }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Reason is required.');
    expect(blockedChain.insert).not.toHaveBeenCalled();
  });
});

// ── Create: court existence ──────────────────────────────────────────

describe('createBlockedPeriodAction — court existence', () => {
  it('rejects a soft-deleted or missing court without running the overlap check', async () => {
    resetChains({ courtRow: null });

    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Court not found.');
    expect(courtsChain.eq).toHaveBeenCalledWith('id', COURT_UUID);
    expect(courtsChain.is).toHaveBeenCalledWith('deleted_at', null);
    expect(bookingsChain.filter).not.toHaveBeenCalled();
    expect(blockedChain.insert).not.toHaveBeenCalled();
  });

  it('fails closed with a generic message when the court query errors (raw not leaked)', async () => {
    resetChains({ courtRow: null, courtError: { message: 'boom-courts' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Could not save the blocked period. Please try again.');
    expect(result.error).not.toContain('boom-courts');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('court fetch failed'),
      'boom-courts'
    );
    expect(blockedChain.insert).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ── Create: booking conflict pre-check (decision #1) ────────────────

describe('createBlockedPeriodAction — booking conflict pre-check', () => {
  it('queries blocking bookings by id only with the ov filter and rejects with a privacy-safe conflict message', async () => {
    resetChains({
      bookings: [
        { id: 'b1', booking_number: 'KH-123456' },
        { id: 'b2', booking_number: 'KH-654321' },
      ],
    });

    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.hasBookingConflict).toBe(true);
    expect(result).not.toHaveProperty('conflictBookingCount');
    expect(result.error).toBe(
      'This time overlaps existing bookings. Please choose a different time.'
    );
    // Privacy decision: no booking numbers or counts may reach the browser.
    expect(result.error).not.toContain('KH-');
    expect(result.error).not.toContain('existing booking 1');
    expect(result.error).not.toContain('2 existing bookings');
    // The pre-check never even fetches booking numbers.
    expect(bookingsChain.select).toHaveBeenCalledWith('id');
    // Blocking-status set matches the project's GiST definition
    expect(bookingsChain.in).toHaveBeenCalledWith('status', ['Reserved', 'Confirmed']);
    expect(bookingsChain.eq).toHaveBeenCalledWith('court_id', COURT_UUID);
    expect(bookingsChain.filter).toHaveBeenCalledWith('booking_range', 'ov', EXPECTED_RANGE);
    // Nothing was written anywhere, bookings least of all
    expect(blockedChain.insert).not.toHaveBeenCalled();
    expect(bookingsChain.update).not.toHaveBeenCalled();
    expect(bookingsChain.insert).not.toHaveBeenCalled();
    expect(bookingsChain.delete).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when the overlap query errors — never treats unreadable as "no overlap"', async () => {
    resetChains({ bookings: null, bookingsError: { message: 'permission denied' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Could not verify existing bookings. Please try again.');
    expect(result.error).not.toContain('permission denied');
    expect(blockedChain.insert).not.toHaveBeenCalled();
    expect(bookingsChain.update).not.toHaveBeenCalled();
    expect(bookingsChain.delete).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('booking overlap pre-check failed'),
      'permission denied'
    );
    consoleSpy.mockRestore();
  });

  it('proceeds when the overlap result is reliably empty (0 rows, no error)', async () => {
    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(true);
    expect(bookingsChain.filter).toHaveBeenCalledWith('booking_range', 'ov', EXPECTED_RANGE);
    expect(blockedChain.insert).toHaveBeenCalledTimes(1);
  });
});

// ── Create: insert outcome ───────────────────────────────────────────

describe('createBlockedPeriodAction — insert outcome', () => {
  it('inserts with session-derived created_by, trimmed reason, and the Model B range; returns the mapped row', async () => {
    const result = await createBlockedPeriodAction(validPayload({ reason: '  Deep cleaning  ' }));

    expect(result.success).toBe(true);
    expect(blockedChain.insert).toHaveBeenCalledWith({
      court_id: COURT_UUID,
      blocked_range: EXPECTED_RANGE,
      reason: 'Deep cleaning',
      created_by: 'admin-1',
    });
    // Real mapper path: quoted TSTZRANGE → domain fields
    expect(result.blockedPeriod).toMatchObject({
      id: BLOCK_ID,
      courtId: COURT_UUID,
      date: '2099-06-15',
      startTime: '10:00',
      endTime: '12:00',
      reason: 'Deep cleaning',
      createdAt: '2099-01-01T00:00:00Z',
    });
    expect(formatTstzrange).toHaveBeenCalledWith('2099-06-15', '10:00', '12:00');
  });

  it('does NOT report success when the insert fails (raw message stays server-side)', async () => {
    resetChains({ insertedRow: null, insertError: { message: 'insert exploded' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.blockedPeriod).toBeUndefined();
    expect(result.error).toBe('Could not save the blocked period. Please try again.');
    expect(result.error).not.toContain('insert exploded');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('blocked period insert failed'),
      'insert exploded'
    );
    consoleSpy.mockRestore();
  });

  it('maps the GiST exclusion violation (23P01) to a stable, user-safe message', async () => {
    resetChains({
      insertedRow: null,
      insertError: { message: 'conflicting key value violates exclusion constraint', code: '23P01' },
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toBe('This time range overlaps an existing blocked period.');
    expect(result.error).not.toContain('exclusion constraint');
    consoleSpy.mockRestore();
  });

  it('recognizes the prevent_overlapping_blocked_periods constraint by name when code is absent', async () => {
    resetChains({
      insertedRow: null,
      insertError: {
        message: 'constraint "prevent_overlapping_blocked_periods" violated',
        code: undefined,
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createBlockedPeriodAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toBe('This time range overlaps an existing blocked period.');
    vi.spyOn(console, 'error').mockRestore();
  });
});

// ── Delete ───────────────────────────────────────────────────────────

describe('deleteBlockedPeriodAction', () => {
  it('rejects a non-UUID id without issuing a delete', async () => {
    const result = await deleteBlockedPeriodAction('not-a-uuid');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid blocked period id.');
    expect(blockedChain.delete).not.toHaveBeenCalled();
  });

  it('deletes exactly the requested id and reports success only when a row was affected', async () => {
    resetChains({ deletedRows: [{ id: BLOCK_ID }] });

    const result = await deleteBlockedPeriodAction(BLOCK_ID);

    expect(result.success).toBe(true);
    expect(result.id).toBe(BLOCK_ID);
    expect(blockedChain.delete).toHaveBeenCalledTimes(1);
    expect(blockedChain.eq).toHaveBeenCalledWith('id', BLOCK_ID);
    expect(blockedChain.select).toHaveBeenCalledWith('id');
  });

  it('does NOT report success when zero rows were affected (RLS-hidden or missing row)', async () => {
    resetChains({ deletedRows: [] });

    const result = await deleteBlockedPeriodAction(BLOCK_ID);

    expect(result.success).toBe(false);
    expect(result.id).toBeUndefined();
    expect(result.error).toBe('Blocked period not found.');
  });

  it('does NOT report success on a database error and never leaks the raw message', async () => {
    resetChains({ deletedRows: null, deleteError: { message: 'delete exploded' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await deleteBlockedPeriodAction(BLOCK_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to delete the blocked period. Please try again.');
    expect(result.error).not.toContain('delete exploded');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('delete failed'), 'delete exploded');
    consoleSpy.mockRestore();
  });
});

// ── List ─────────────────────────────────────────────────────────────

describe('getBlockedPeriodsAction', () => {
  it('returns rows mapped through the real mapper, newest created_at first', async () => {
    resetChains({ blockedList: [makeDbBlockedPeriod()] });

    const result = await getBlockedPeriodsAction();

    expect(result.success).toBe(true);
    expect(result.blockedPeriods).toHaveLength(1);
    expect(result.blockedPeriods![0]).toMatchObject({
      id: BLOCK_ID,
      courtId: COURT_UUID,
      date: '2099-06-15',
      startTime: '10:00',
      endTime: '12:00',
      reason: 'Deep cleaning',
    });
    expect(blockedChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns an empty list as success (empty-state support)', async () => {
    resetChains({ blockedList: [] });

    const result = await getBlockedPeriodsAction();

    expect(result.success).toBe(true);
    expect(result.blockedPeriods).toEqual([]);
  });

  it('returns a safe generic error on query failure without leaking the raw message', async () => {
    resetChains({ blockedList: null, blockedListError: { message: 'boom-list' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getBlockedPeriodsAction();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to load blocked periods. Please try again.');
    expect(result.error).not.toContain('boom-list');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('blocked periods query failed'),
      'boom-list'
    );
    consoleSpy.mockRestore();
  });
});
