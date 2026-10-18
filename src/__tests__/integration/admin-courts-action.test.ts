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
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (value: QueryResult) => void) => void;
};

function makeChain(result: QueryResult): MockChain {
  const chain: MockChain = {} as MockChain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  // Make chain thenable so `await ...order(...)` resolves to result
  chain.then = (resolve) => resolve(result);
  return chain;
}

let courtsResult: QueryResult;
let profilesChain: MockChain;
let courtsChain: MockChain;

function resetChains() {
  courtsResult = { data: [makeDbCourt()], error: null };
  profilesChain = makeChain({ data: { role: 'Admin' }, error: null });
  courtsChain = makeChain(courtsResult);
}

function makeDbCourt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'court-1',
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
    features: ['Floodlights'],
    rules: ['No shoes'],
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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => (table === 'profiles' ? profilesChain : courtsChain)),
  })),
}));

// Real mapper is intentionally NOT mocked: rows go through the real
// mapDbCourtToCourt path so field mapping (sport_type, TIME substrings,
// price coercion) is verified end to end.

import { getAdminCourtsAction } from '@/app/actions/court.actions';

describe('getAdminCourtsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  });

  // ── Auth & authorization (A3) ─────────────────────────────────

  it('returns error when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await getAdminCourtsAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication required');
    expect(courtsChain.select).not.toHaveBeenCalled();
  });

  it('returns error when caller is not an admin', async () => {
    profilesChain = makeChain({ data: { role: 'User' }, error: null });

    const result = await getAdminCourtsAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
    expect(courtsChain.select).not.toHaveBeenCalled();
  });

  it('returns error when the profile row is missing (fail closed)', async () => {
    profilesChain = makeChain({ data: null, error: null });

    const result = await getAdminCourtsAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
    expect(courtsChain.select).not.toHaveBeenCalled();
  });

  it('denies access when the profiles query itself fails (fail closed)', async () => {
    profilesChain = makeChain({ data: null, error: { message: 'profiles relation missing' } });

    const result = await getAdminCourtsAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin access required');
    expect(courtsChain.select).not.toHaveBeenCalled();
  });

  // ── Success path & mapping ────────────────────────────────────

  it('returns mapped courts with domain field names on success', async () => {
    const result = await getAdminCourtsAction();

    expect(result.success).toBe(true);
    expect(result.courts).toHaveLength(1);
    expect(result.courts![0]).toMatchObject({
      id: 'court-1',
      name: 'Court One',
      sportType: 'Padel',
      surface: 'Panoramic',
      status: 'Available',
      pricePerHour: 250,
      slotDurationMinutes: 60,
      workingHours: { open: '07:00', close: '00:00' },
    });
  });

  it('queries only active courts (deleted_at IS NULL) in created_at order', async () => {
    const result = await getAdminCourtsAction();

    expect(result.success).toBe(true);
    expect(courtsChain.is).toHaveBeenCalledWith('deleted_at', null);
    expect(courtsChain.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('returns an empty court list as success (empty-state support)', async () => {
    courtsResult = { data: [], error: null };
    courtsChain = makeChain(courtsResult);

    const result = await getAdminCourtsAction();

    expect(result.success).toBe(true);
    expect(result.courts).toEqual([]);
  });

  it('maps court status values without translation', async () => {
    courtsResult = { data: [makeDbCourt({ status: 'Maintenance' })], error: null };
    courtsChain = makeChain(courtsResult);

    const result = await getAdminCourtsAction();

    expect(result.success).toBe(true);
    expect(result.courts![0].status).toBe('Maintenance');
  });

  // ── Query error handling ──────────────────────────────────────

  it('returns a safe generic error on query failure and logs the raw message server-side', async () => {
    courtsResult = { data: null, error: { message: 'boom' } };
    courtsChain = makeChain(courtsResult);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getAdminCourtsAction();

    expect(result.success).toBe(false);
    // Client-facing message is generic — the raw database message never leaks.
    expect(result.error).toBe('Failed to load courts. Please try again.');
    expect(result.error).not.toContain('boom');
    // Diagnostics are preserved server-side.
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('courts query failed'),
      'boom'
    );
    consoleSpy.mockRestore();
  });
});
