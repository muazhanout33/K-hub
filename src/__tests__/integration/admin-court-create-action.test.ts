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
  order: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
  then: (resolve: (value: QueryResult) => void) => void;
}

interface ChainState {
  fetch: QueryResult;
  write: QueryResult;
}

function makeChain(state: Partial<ChainState>): MockChain {
  const chain = {} as MockChain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve(state.fetch ?? { data: null, error: null })
  );
  chain.single = vi.fn(() => Promise.resolve(state.write ?? { data: null, error: null }));
  chain.then = (resolve) => resolve(state.fetch ?? { data: null, error: null });
  return chain;
}

let profilesChain: MockChain;
let courtsChain: MockChain;

function makeDbCourt(overrides: Record<string, unknown> = {}) {
  return {
    id: '99999999-9999-9999-9999-999999999991',
    name: 'Court Two',
    sport_type: 'Football',
    surface: 'Grass',
    is_indoor: true,
    capacity: 4,
    price_per_hour: 180,
    rating: 5,
    review_count: 0,
    image_url: '/images/courts/court-two.jpg',
    gallery_urls: [],
    description: null,
    features: [],
    rules: [],
    status: 'Available',
    working_hours_open: '09:00:00',
    working_hours_close: '18:00:00',
    slot_duration_minutes: 60,
    created_at: '2026-10-21T12:00:00Z',
    updated_at: '2026-10-21T12:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

function resetChains(overrides: {
  role?: string;
  profile?: unknown;
  insertedRow?: unknown;
  insertError?: { message: string; code?: string } | null;
} = {}) {
  profilesChain = makeChain({ fetch: { data: { role: overrides.role ?? 'Admin' }, error: null } });
  if ('profile' in overrides) {
    profilesChain = makeChain({ fetch: { data: overrides.profile, error: null } });
  }
  const insertedRow = 'insertedRow' in overrides ? overrides.insertedRow : makeDbCourt();
  courtsChain = makeChain({
    write: {
      data: overrides.insertError ? null : insertedRow,
      error: overrides.insertError ?? null,
    },
  });
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

import {
  createCourtAction,
  getAdminCourtsAction,
  type CreateCourtPayload,
} from '@/app/actions/court.actions';

function validPayload(overrides: Partial<CreateCourtPayload> = {}): CreateCourtPayload {
  return {
    name: '  Court Two  ',
    sportType: 'Football',
    surface: ' Grass ',
    pricePerHour: 180,
    workingHoursOpen: '09:00',
    workingHoursClose: '18:00',
    imageUrl: '/images/courts/court-two.jpg',
    status: 'Available',
    ...overrides,
  };
}

describe('createCourtAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  });

  it('inserts the minimal payload with trimmed fields and returns the mapped court', async () => {
    const result = await createCourtAction(validPayload());

    expect(result.success).toBe(true);
    expect(result.court).toMatchObject({ name: 'Court Two', surface: 'Grass', pricePerHour: 180 });
    expect(courtsChain.insert).toHaveBeenCalledWith({
      name: 'Court Two',
      sport_type: 'Football',
      surface: 'Grass',
      price_per_hour: 180,
      working_hours_open: '09:00:00',
      working_hours_close: '18:00:00',
      image_url: '/images/courts/court-two.jpg',
      status: 'Available',
    });
    expect(courtsChain.insert).toHaveBeenCalledTimes(1);
    // Only ONE court row is ever written — bookings/blocked periods untouched.
    expect(profilesChain.insert).not.toHaveBeenCalled();
  });

  it('omits status from the insert when not provided (DB default applies)', async () => {
    const withoutStatus = { ...validPayload(), status: undefined } as CreateCourtPayload;
    await createCourtAction(withoutStatus);

    const arg = courtsChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('status');
  });

  it('accepts overnight working hours and rejects equal open/close', async () => {
    const overnight = await createCourtAction(
      validPayload({ workingHoursOpen: '07:00', workingHoursClose: '00:00' })
    );
    expect(overnight.success).toBe(true);

    const equal = await createCourtAction(
      validPayload({ workingHoursOpen: '07:00', workingHoursClose: '07:00' })
    );
    expect(equal.success).toBe(false);
    expect(equal.error).toBe('Opening and closing times cannot be the same.');
    expect(courtsChain.insert).toHaveBeenCalledTimes(1);
  });

  it('validates sport, price, hours, image and name before any write', async () => {
    const cases = [
      { override: { sportType: 'Chess' }, message: 'Invalid sport type.' },
      { override: { pricePerHour: -1 }, message: null },
      { override: { workingHoursOpen: '7:00' }, message: 'Working hours must be valid HH:mm times (e.g. 07:00).' },
      { override: { imageUrl: 'not-an-image' }, message: null },
      { override: { name: '' }, message: 'Enter a court name (120 characters max).' },
      { override: { status: 'Booked' }, message: "Status must be 'Available' or 'Maintenance'." },
    ] as const;

    for (const { override, message } of cases) {
      const result = await createCourtAction(validPayload({ ...override }));
      expect(result.success).toBe(false);
      if (message) expect(result.error).toBe(message);
    }
    // Validation-only failures never reach the database.
    expect(courtsChain.insert).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated and non-admin callers without writing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const anon = await createCourtAction(validPayload());
    expect(anon.success).toBe(false);
    expect(anon.error).toBe('Authentication required.');

    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    resetChains({ role: 'Customer' });
    const customer = await createCourtAction(validPayload());
    expect(customer.success).toBe(false);
    expect(customer.error).toBe('Admin access required.');

    resetChains({ profile: null });
    const noProfile = await createCourtAction(validPayload());
    expect(noProfile.success).toBe(false);
    expect(noProfile.error).toBe('Admin access required.');

    expect(courtsChain.insert).not.toHaveBeenCalled();
  });

  it('returns a static generic error and never leaks db messages', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetChains({ insertError: { message: 'boom-insert confidential' } });

    const result = await createCourtAction(validPayload());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to create the court. Please try again.');
    expect(result.error).not.toContain('boom-insert');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('courts insert failed'),
      'boom-insert confidential'
    );
    consoleSpy.mockRestore();
  });
});

describe('getAdminCourtsAction — includeArchived option', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    courtsChain = makeChain({ fetch: { data: [makeDbCourt()], error: null } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  });

  it('defaults to active-only visibility (unchanged Step A behavior)', async () => {
    const result = await getAdminCourtsAction();

    expect(result.success).toBe(true);
    expect(result.courts).toHaveLength(1);
    expect(courtsChain.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('includes archived courts when includeArchived is true', async () => {
    const result = await getAdminCourtsAction({ includeArchived: true });

    expect(result.success).toBe(true);
    expect(courtsChain.is).not.toHaveBeenCalled();
  });
});
