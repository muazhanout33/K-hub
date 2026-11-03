import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase server client (per-table chains) ──
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import {
  getSettingsAction,
  updateSettingsAction,
} from '@/app/actions/settings.actions';

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

type Thenable = { then: (resolve: (value: QueryResult) => void) => void };

function makeThenable(result: QueryResult): Thenable {
  return {
    then: (resolve) => resolve(result),
  };
}

// profiles chain: `.select().eq().maybeSingle()`
function makeProfilesChain(singleResult: QueryResult) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(singleResult));
  return chain;
}

// system_settings chain: `.select().in()` (awaited) and `.upsert()`
let settingsReadResults: QueryResult[] = [];
let upsertResult: QueryResult;
let lastUpsertRows: Array<Record<string, unknown>> | null;
let lastUpsertOptions: unknown;

function makeSettingsChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn((rows, options) => {
    lastUpsertRows = rows;
    lastUpsertOptions = options;
    return makeThenable(upsertResult);
  });
  // Awaited read path — consumes the configured read results in order.
  (chain as unknown as Thenable).then = (resolve) =>
    resolve(settingsReadResults.shift() ?? { data: [], error: null });
  return chain;
}

type ConfigureOptions = {
  role?: string | null;
  user?: { id: string } | null;
  profileError?: { message: string } | null;
  reads?: QueryResult[];
  upsert?: QueryResult;
};

function configure({
  role = 'Admin',
  user = { id: 'admin-1' },
  profileError = null,
  reads = [],
  upsert = { data: null, error: null },
}: ConfigureOptions = {}) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
  settingsReadResults = [...reads];
  upsertResult = upsert;
  lastUpsertRows = null;
  lastUpsertOptions = null;

  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return makeProfilesChain({
        data: role === null ? null : { role },
        error: profileError,
      });
    }
    if (table === 'system_settings') {
      return makeSettingsChain();
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });
}

function settingsRow(key: string, value: unknown) {
  return { key, value };
}

beforeEach(() => {
  vi.clearAllMocks();
  configure();
});

describe('getSettingsAction — authorization', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await getSettingsAction();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Authentication required.');
    expect(mockFrom).not.toHaveBeenCalledWith('system_settings');
  });

  it('rejects authenticated non-admins (fail closed)', async () => {
    configure({ role: 'User' });

    const result = await getSettingsAction();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Admin access required.');
    expect(mockFrom).not.toHaveBeenCalledWith('system_settings');
  });

  it('rejects when the profile row is missing', async () => {
    configure({ role: null });

    const result = await getSettingsAction();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Admin access required.');
    expect(mockFrom).not.toHaveBeenCalledWith('system_settings');
  });
});

describe('getSettingsAction — reads', () => {
  it('merges stored values over defaults and reports default keys', async () => {
    configure({
      reads: [
        {
          data: [
            settingsRow('booking.hold_timer_minutes', 15),
            settingsRow('club.name', 'Sky Club'),
          ],
          error: null,
        },
      ],
    });

    const result = await getSettingsAction();

    expect(result.success).toBe(true);
    expect(result.values).toBeDefined();
    expect(result.values!['booking.hold_timer_minutes']).toBe(15);
    expect(result.values!['club.name']).toBe('Sky Club');
    // Missing rows fall back to registry defaults.
    expect(result.values!['booking.cancellation_window_hours']).toBe(2);
    expect(result.values!['booking.max_advance_days']).toBe(30);
    expect(result.values!['system.maintenance_mode']).toBe(false);
    expect(result.defaultKeys).toContain('booking.cancellation_window_hours');
    expect(result.defaultKeys).not.toContain('booking.hold_timer_minutes');
    expect(result.defaultKeys).not.toContain('club.name');
  });

  it('never returns non-allowlisted keys even if stored', async () => {
    configure({
      reads: [
        {
          data: [
            settingsRow('secrets.api_key', 'sk-should-never-leak'),
            settingsRow('booking.hold_timer_minutes', 20),
          ],
          error: null,
        },
      ],
    });

    const result = await getSettingsAction();

    expect(result.success).toBe(true);
    expect(result.values).not.toHaveProperty('secrets.api_key');
    expect(JSON.stringify(result)).not.toContain('sk-should-never-leak');
    expect(result.values!['booking.hold_timer_minutes']).toBe(20);
  });

  it('coerces corrupt stored values back to defaults', async () => {
    configure({
      reads: [
        {
          data: [
            settingsRow('booking.hold_timer_minutes', 9999), // out of range
            settingsRow('club.operating_hours_start', '25:00'), // invalid time
            settingsRow('system.maintenance_mode', 'yes'), // not a boolean
          ],
          error: null,
        },
      ],
    });

    const result = await getSettingsAction();

    expect(result.success).toBe(true);
    expect(result.values!['booking.hold_timer_minutes']).toBe(10);
    expect(result.values!['club.operating_hours_start']).toBe('09:00');
    expect(result.values!['system.maintenance_mode']).toBe(false);
  });

  it('serves all defaults when no rows exist yet', async () => {
    configure({ reads: [{ data: [], error: null }] });

    const result = await getSettingsAction();

    expect(result.success).toBe(true);
    expect(result.defaultKeys).toEqual(
      expect.arrayContaining([
        'booking.cancellation_window_hours',
        'booking.hold_timer_minutes',
        'booking.max_advance_days',
        'club.name',
        'club.operating_hours_start',
        'club.operating_hours_end',
        'system.maintenance_mode',
        'system.maintenance_message',
      ])
    );
    expect(result.values!['booking.hold_timer_minutes']).toBe(10);
    expect(result.values!['club.name']).toBe('WEGO');
  });

  it('returns a generic error (no raw DB message) on query failure', async () => {
    configure({
      reads: [
        {
          data: null,
          error: { message: 'permission denied for table system_settings' },
        },
      ],
    });

    const result = await getSettingsAction();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unable to load settings. Please try again.');
    expect(result.error).not.toContain('permission denied');
    expect(result.values).toBeUndefined();
  });

  it('returns a generic error when the client throws', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('connection reset by peer');
    });

    const result = await getSettingsAction();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unable to load settings. Please try again.');
    expect(result.error).not.toContain('connection reset');
  });
});

describe('updateSettingsAction — authorization', () => {
  it('rejects unauthenticated callers without writing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await updateSettingsAction({
      'booking.hold_timer_minutes': 15,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Authentication required.');
    expect(lastUpsertRows).toBeNull();
  });

  it('rejects non-admins without writing (fail closed)', async () => {
    configure({ role: 'User' });

    const result = await updateSettingsAction({
      'booking.hold_timer_minutes': 15,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Admin access required.');
    expect(lastUpsertRows).toBeNull();
  });
});

describe('updateSettingsAction — allowlist & validation', () => {
  it('rejects unknown keys and writes nothing (whole update rejected)', async () => {
    configure();

    const result = await updateSettingsAction({
      'booking.hold_timer_minutes': 15,
      'secrets.api_key': 'sk-attacker',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown setting. No changes were applied.');
    expect(result.values).toBeUndefined();
    expect(lastUpsertRows).toBeNull();
  });

  it('rejects invalid values with fieldErrors and writes nothing', async () => {
    configure();

    const result = await updateSettingsAction({
      'booking.hold_timer_minutes': -5,
      'club.operating_hours_start': '9:00',
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors).toEqual({
      'booking.hold_timer_minutes': 'Must be at least 1 minutes.',
      'club.operating_hours_start':
        'Must be a valid time in HH:MM format (e.g. 09:00).',
    });
    expect(lastUpsertRows).toBeNull();
  });

  it('rejects oversized strings', async () => {
    configure();

    const result = await updateSettingsAction({
      'club.name': 'A'.repeat(81),
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors).toEqual({
      'club.name': 'Must be at most 80 characters.',
    });
    expect(lastUpsertRows).toBeNull();
  });

  it('rejects non-integer and out-of-range numbers', async () => {
    configure();

    const result = await updateSettingsAction({
      'booking.max_advance_days': 400,
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors).toEqual({
      'booking.max_advance_days': 'Must be at most 365 days.',
    });
    expect(lastUpsertRows).toBeNull();
  });

  it('rejects type-mismatched values', async () => {
    configure();

    const result = await updateSettingsAction({
      'system.maintenance_mode': 'true',
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors).toEqual({
      'system.maintenance_mode': 'Must be true or false.',
    });
    expect(lastUpsertRows).toBeNull();
  });

  it('rejects malformed payloads', async () => {
    configure();

    expect((await updateSettingsAction(null)).success).toBe(false);
    expect((await updateSettingsAction('nope')).success).toBe(false);
    expect((await updateSettingsAction(['booking.hold_timer_minutes'])).success).toBe(false);
    expect((await updateSettingsAction({})).error).toBe('No settings provided.');
    expect(lastUpsertRows).toBeNull();
  });
});

describe('updateSettingsAction — writes', () => {
  it('persists validated values atomically and re-reads persisted state', async () => {
    configure({
      // Simulated DB state after the write: a DIFFERENT value than sent,
      // proving the response reflects persisted state, not echoed input.
      reads: [
        {
          data: [
            settingsRow('booking.hold_timer_minutes', 20),
            settingsRow('booking.cancellation_window_hours', 4),
          ],
          error: null,
        },
      ],
    });

    const result = await updateSettingsAction({
      'booking.hold_timer_minutes': 15,
    });

    expect(result.success).toBe(true);
    expect(result.updatedKeys).toEqual(['booking.hold_timer_minutes']);

    // Single atomic upsert, keyed on `key` (INSERT ... ON CONFLICT).
    expect(lastUpsertRows).toHaveLength(1);
    expect(lastUpsertRows![0]).toMatchObject({
      key: 'booking.hold_timer_minutes',
      value: 15,
      description: 'Hold timer',
    });
    expect(lastUpsertRows![0].updated_at).toEqual(expect.any(String));
    expect(lastUpsertOptions).toEqual({ onConflict: 'key' });

    // Values come from the re-read, not the input payload.
    expect(result.values!['booking.hold_timer_minutes']).toBe(20);
    expect(result.values!['booking.cancellation_window_hours']).toBe(4);
    // Untouched keys are still served (defaults where unstored).
    expect(result.values!['club.name']).toBe('WEGO');
  });

  it('supports partial multi-key updates in one upsert', async () => {
    configure({
      reads: [
        {
          data: [
            settingsRow('booking.hold_timer_minutes', 5),
            settingsRow('system.maintenance_mode', true),
          ],
          error: null,
        },
      ],
    });

    const result = await updateSettingsAction({
      'booking.hold_timer_minutes': 5,
      'system.maintenance_mode': true,
    });

    expect(result.success).toBe(true);
    expect(result.updatedKeys).toEqual([
      'booking.hold_timer_minutes',
      'system.maintenance_mode',
    ]);
    expect(lastUpsertRows).toHaveLength(2);
    expect(lastUpsertOptions).toEqual({ onConflict: 'key' });
  });

  it('returns a generic error (no raw DB message) when the upsert fails', async () => {
    configure({
      upsert: {
        data: null,
        error: { message: 'duplicate key value violates unique constraint' },
      },
      reads: [{ data: [], error: null }],
    });

    const result = await updateSettingsAction({
      'booking.hold_timer_minutes': 15,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unable to save settings. Please try again.');
    expect(result.error).not.toContain('duplicate key');
    expect(result.values).toBeUndefined();
  });

  it('returns a generic error when the post-write re-read fails', async () => {
    configure({
      reads: [
        { data: null, error: { message: 'connection lost mid-transaction' } },
      ],
    });

    const result = await updateSettingsAction({
      'booking.hold_timer_minutes': 15,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unable to save settings. Please try again.');
    expect(result.error).not.toContain('connection lost');
  });
});
