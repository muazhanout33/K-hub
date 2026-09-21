import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase server client ──────────────────────────────────
const mockGetUser = vi.fn();
const mockSupabaseSelect = vi.fn();
const mockSupabaseEq = vi.fn();
const mockSupabaseOrder = vi.fn();
const mockSupabaseInsert = vi.fn();
const mockSupabaseSingle = vi.fn();

function makeSupabaseMock() {
  return {
    auth: { getUser: mockGetUser },
    from: vi.fn((..._args: any[]) => ({
      select: mockSupabaseSelect.mockReturnThis(),
      eq: mockSupabaseEq.mockReturnThis(),
      in: mockSupabaseSelect.mockReturnThis(),
      order: mockSupabaseOrder.mockResolvedValue({ data: [], error: null }),
      is: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      insert: mockSupabaseInsert.mockReturnThis(),
      single: mockSupabaseSingle,
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  };
}

let supabaseMock: ReturnType<typeof makeSupabaseMock>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseMock),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      ilike: vi.fn().mockReturnThis(),
    })),
  })),
}));

vi.mock('@/services/court.service', () => ({
  getCourtByIdFromSupabase: vi.fn(() => Promise.resolve(null)),
  getCourtInfoMap: vi.fn(() => Promise.resolve(new Map())),
  getCourtsFromSupabase: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/pricing', () => ({
  calculateBookingPrice: vi.fn(() => 200),
}));

vi.mock('@/lib/timezone', () => ({
  isSlotPast: vi.fn(() => false),
}));

vi.mock('@/lib/mappers', () => ({
  formatTstzrange: vi.fn(() => '["2099-06-15 10:00","2099-06-15 11:00"]'),
  mapDbBookingToBooking: vi.fn((_b: any, _c: any) => ({
    id: 'booking-1',
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
    status: 'Reserved',
    bookingSource: 'ONLINE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    userId: 'user-1',
    userName: 'Test',
    userEmail: 'test@test.com',
    userPhone: '123',
    selectedSlotIds: [],
  })),
  mapDbCourtToCourt: vi.fn((c: any) => ({
    id: c?.id || 'court-1',
    name: c?.name || 'Court 1',
    sportType: c?.sport_type || 'Padel',
    surface: 'Hard',
    isIndoor: true,
    capacity: 4,
    pricePerHour: 200,
    rating: 4.8,
    reviewCount: 42,
    image: c?.image_url || '',
    gallery: [],
    description: 'Test court',
    features: [],
    rules: [],
    status: 'Available',
    workingHours: { open: '07:00', close: '23:00' },
    slotDurationMinutes: 60,
  })),
}));

// ── Helper to create NextRequest ─────────────────────────────────
function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as any;
}

// ─────────────────────────────────────────────────────────────────
// GET /api/courts
// ─────────────────────────────────────────────────────────────────
import { GET as courtsGET } from '@/app/api/courts/route';

describe('GET /api/courts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns success with court data', async () => {
    const { getCourtsFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtsFromSupabase).mockResolvedValue([
      { id: 'court-1', name: 'Court 1', sportType: 'Padel', pricePerHour: 200, status: 'Available' } as any,
    ]);

    const res = await courtsGET(makeRequest('http://localhost/api/courts'));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.count).toBe(1);
  });

  it('passes sport filter to service', async () => {
    const { getCourtsFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtsFromSupabase).mockResolvedValue([]);

    await courtsGET(makeRequest('http://localhost/api/courts?sport=Padel'));
    expect(getCourtsFromSupabase).toHaveBeenCalledWith('Padel');
  });

  it('treats sport=All as no filter', async () => {
    const { getCourtsFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtsFromSupabase).mockResolvedValue([]);

    await courtsGET(makeRequest('http://localhost/api/courts?sport=All'));
    expect(getCourtsFromSupabase).toHaveBeenCalledWith(undefined);
  });

  it('treats missing sport param as no filter', async () => {
    const { getCourtsFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtsFromSupabase).mockResolvedValue([]);

    await courtsGET(makeRequest('http://localhost/api/courts'));
    expect(getCourtsFromSupabase).toHaveBeenCalledWith(undefined);
  });

  it('propagates service error (no try/catch in route)', async () => {
    const { getCourtsFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtsFromSupabase).mockRejectedValue(new Error('DB down'));

    await expect(courtsGET(makeRequest('http://localhost/api/courts'))).rejects.toThrow('DB down');
  });
});

// ─────────────────────────────────────────────────────────────────
// GET /api/courts/[id]
// ─────────────────────────────────────────────────────────────────
import { GET as courtByIdGET } from '@/app/api/courts/[id]/route';

describe('GET /api/courts/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns court when found', async () => {
    const { getCourtByIdFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtByIdFromSupabase).mockResolvedValue({
      id: 'court-1', name: 'Court 1', sportType: 'Padel', pricePerHour: 200, status: 'Available',
    } as any);

    const req = makeRequest('http://localhost/api/courts/court-1');
    const res = await courtByIdGET(req, { params: Promise.resolve({ id: 'court-1' }) });
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.id).toBe('court-1');
  });

  it('returns 404 when court not found', async () => {
    const { getCourtByIdFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtByIdFromSupabase).mockResolvedValue(undefined);

    const req = makeRequest('http://localhost/api/courts/non-existent');
    const res = await courtByIdGET(req, { params: Promise.resolve({ id: 'non-existent' }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain('Court not found');
  });
});

// ─────────────────────────────────────────────────────────────────
// GET /api/bookings
// ─────────────────────────────────────────────────────────────────
import { GET as bookingsGET } from '@/app/api/bookings/route';

describe('GET /api/bookings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = makeSupabaseMock();
  });

  it('returns 401 when no middleware header and no auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest('http://localhost/api/bookings');
    const res = await bookingsGET(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toContain('Authentication required');
  });

  it('returns success for authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as any);

    const req = makeRequest('http://localhost/api/bookings');
    const res = await bookingsGET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('uses middleware user ID header when present', async () => {
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as any);

    const req = makeRequest('http://localhost/api/bookings');
    req.headers.set('x-supabase-user-id', 'user-from-middleware');
    const res = await bookingsGET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    // Should not call getUser since middleware header is present
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB failure' } }),
    } as any);

    const req = makeRequest('http://localhost/api/bookings');
    const res = await bookingsGET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });

  it('returns 500 on unexpected throw', async () => {
    mockGetUser.mockRejectedValue(new Error('Unexpected'));

    const req = makeRequest('http://localhost/api/bookings');
    const res = await bookingsGET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain('Failed to fetch bookings');
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /api/bookings
// ─────────────────────────────────────────────────────────────────
import { POST as bookingsPOST } from '@/app/api/bookings/route';

describe('POST /api/bookings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = makeSupabaseMock();
  });

  function makeBookingBody(overrides?: Record<string, any>) {
    return JSON.stringify({
      courtId: 'court-1',
      date: '2099-06-15',
      startTime: '10:00',
      durationMinutes: 60,
      totalPrice: 200,
      userName: 'Test User',
      userEmail: 'test@test.com',
      userPhone: '+1234567890',
      ...overrides,
    });
  }

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: makeBookingBody(),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await bookingsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toContain('sign in');
  });

  it('returns 400 when courtId missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } });

    const req = makeRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: makeBookingBody({ courtId: undefined }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await bookingsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('Missing required');
  });

  it('returns 400 when date missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } });

    const req = makeRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: makeBookingBody({ date: undefined }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await bookingsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('returns 400 when startTime missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } });

    const req = makeRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: makeBookingBody({ startTime: undefined }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await bookingsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('returns 404 when court not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } });
    const { getCourtByIdFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtByIdFromSupabase).mockResolvedValue(undefined);

    const req = makeRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: makeBookingBody({ courtId: 'non-existent' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await bookingsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain('Court not found');
  });

  it('returns 201 on successful booking creation', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } });
    const { getCourtByIdFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtByIdFromSupabase).mockResolvedValue({
      id: 'court-1', name: 'Court 1', pricePerHour: 200, status: 'Available',
    } as any);

    supabaseMock.from.mockImplementation(((table: string) => {
      if (table === 'bookings') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'new-booking' }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }) as any);

    const req = makeRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: makeBookingBody(),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await bookingsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.message).toContain('created');
  });

  it('returns 409 on 23P01 exclusion violation', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } });
    const { getCourtByIdFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtByIdFromSupabase).mockResolvedValue({
      id: 'court-1', name: 'Court 1', pricePerHour: 200, status: 'Available',
    } as any);

    supabaseMock.from.mockImplementation(((table: string) => {
      if (table === 'bookings') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23P01', message: 'prevent_double_booking' },
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }) as any);

    const req = makeRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: makeBookingBody(),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await bookingsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toContain('already been booked');
  });

  it('returns 500 on generic DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } });
    const { getCourtByIdFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtByIdFromSupabase).mockResolvedValue({
      id: 'court-1', name: 'Court 1', pricePerHour: 200, status: 'Available',
    } as any);

    supabaseMock.from.mockImplementation(((table: string) => {
      if (table === 'bookings') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '42501', message: 'permission denied' },
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }) as any);

    const req = makeRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: makeBookingBody(),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await bookingsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });

  it('returns 500 on unexpected throw', async () => {
    mockGetUser.mockRejectedValue(new Error('Unexpected'));

    const req = makeRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: makeBookingBody(),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await bookingsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain('Failed to process booking');
  });

  it('defaults bookingSource to ONLINE when invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } });
    const { getCourtByIdFromSupabase } = await import('@/services/court.service');
    vi.mocked(getCourtByIdFromSupabase).mockResolvedValue({
      id: 'court-1', name: 'Court 1', pricePerHour: 200, status: 'Available',
    } as any);

    let insertedData: any = null;
    supabaseMock.from.mockImplementation(((table: string) => {
      if (table === 'bookings') {
        return {
          insert: vi.fn().mockImplementation((data: any) => {
            insertedData = data;
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: 'new' }, error: null }),
            };
          }),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'new' }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }) as any);

    const req = makeRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: makeBookingBody({ bookingSource: 'INVALID_SOURCE' }),
      headers: { 'Content-Type': 'application/json' },
    });
    await bookingsPOST(req);

    expect(insertedData.booking_source).toBe('ONLINE');
  });
});
