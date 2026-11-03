import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface MockChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (resolve: (value: QueryResult) => void) => void;
}

function makeChain(): MockChain {
  const chain = {} as MockChain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: { role: 'Admin' }, error: null })
  );
  chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  // Thenable: `await ...update(...).eq(...).select('id')` resolves here.
  chain.then = (resolve) => resolve({ data: null, error: null });
  return chain;
}

const COURT_UUID = '11111111-1111-1111-1111-111111111111';

let profilesChain: MockChain;
let courtsChain: MockChain;

function resetChains(overrides: {
  role?: string;
  updateResult?: { data: unknown; error: { message: string } | null };
} = {}) {
  profilesChain = makeChain();
  if (overrides.role) {
    profilesChain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { role: overrides.role }, error: null })
    );
  }
  courtsChain = makeChain();
  const result = overrides.updateResult ?? { data: [{ id: COURT_UUID }], error: null };
  courtsChain.then = (resolve) => resolve(result);
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profilesChain;
      return courtsChain;
    }),
  })),
}));

import { setCourtArchivedAction } from '@/app/actions/court.actions';

describe('setCourtArchivedAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  });

  it('archives by writing only deleted_at on the one requested court', async () => {
    const result = await setCourtArchivedAction({ courtId: COURT_UUID, archived: true });

    expect(result.success).toBe(true);
    expect(result.courtId).toBe(COURT_UUID);
    expect(courtsChain.update).toHaveBeenCalledTimes(1);
    const patch = courtsChain.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toHaveProperty('deleted_at');
    expect(typeof patch.deleted_at).toBe('string');
    expect(Object.keys(patch)).toEqual(['deleted_at']);
    expect(courtsChain.eq).toHaveBeenCalledWith('id', COURT_UUID);
    // Row-count verification always rides along the write.
    expect(courtsChain.select).toHaveBeenCalledWith('id');
  });

  it('restores by clearing deleted_at', async () => {
    const result = await setCourtArchivedAction({ courtId: COURT_UUID, archived: false });

    expect(result.success).toBe(true);
    const patch = courtsChain.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.deleted_at).toBeNull();
  });

  it('reports not-found when zero rows were affected and never claims success', async () => {
    resetChains({ updateResult: { data: [], error: null } });

    const result = await setCourtArchivedAction({ courtId: COURT_UUID, archived: true });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Court not found.');
  });

  it('returns a static generic error on database failure without leaking details', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetChains({ updateResult: { data: null, error: { message: 'boom-archive confidential' } } });

    const result = await setCourtArchivedAction({ courtId: COURT_UUID, archived: true });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to update the court archive state. Please try again.');
    expect(result.error).not.toContain('boom-archive');
    consoleSpy.mockRestore();
  });

  it('rejects invalid ids, invalid flags and non-admins before any write', async () => {
    const badId = await setCourtArchivedAction({ courtId: 'not-a-uuid', archived: true });
    expect(badId).toMatchObject({ success: false, error: 'Invalid court id.' });

    const noFlag = await setCourtArchivedAction({
      courtId: COURT_UUID,
      archived: undefined as unknown as boolean,
    });
    expect(noFlag).toMatchObject({ success: false, error: 'Invalid archive state.' });

    resetChains({ role: 'Customer' });
    const customer = await setCourtArchivedAction({ courtId: COURT_UUID, archived: true });
    expect(customer).toMatchObject({ success: false, error: 'Admin access required.' });

    mockGetUser.mockResolvedValue({ data: { user: null } });
    const anon = await setCourtArchivedAction({ courtId: COURT_UUID, archived: true });
    expect(anon).toMatchObject({ success: false, error: 'Authentication required.' });

    expect(courtsChain.update).not.toHaveBeenCalled();
  });
});
