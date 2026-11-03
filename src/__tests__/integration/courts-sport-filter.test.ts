import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbCourt, SportTypeEnum } from '@/types/database.types';

// Regression coverage for the `/api/courts?sport=X` 500.
//
// `sport_type` is a Postgres enum, and enums have no ILIKE operator, so
// `query.ilike('sport_type', ...)` failed with
// `operator does not exist: sport_type_enum ~~* unknown` and the route 500'd.
// The service now filters in JS. These tests exercise the REAL route and the
// REAL service, with only the Supabase client mocked, so they would fail if the
// enum-ilike regression were reintroduced (they assert `ilike` is never called).
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { GET as courtsGET } from '@/app/api/courts/route';
import { getCourtsFromSupabase } from '@/services/court.service';

interface QueryResult {
  data: DbCourt[] | null;
  error: { message: string } | null;
}

interface Chain {
  select: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  then: (resolve: (value: QueryResult) => void) => void;
}

let chain: Chain;

function makeChain(result: QueryResult): Chain {
  const c = {} as Chain;
  c.select = vi.fn().mockReturnValue(c);
  c.is = vi.fn().mockReturnValue(c);
  c.order = vi.fn().mockReturnValue(c);
  c.ilike = vi.fn().mockReturnValue(c);
  c.then = (resolve) => resolve(result);
  return c;
}

function seed(rows: DbCourt[]): Chain {
  chain = makeChain({ data: rows, error: null });
  mockFrom.mockReturnValue(chain);
  return chain;
}

function makeDbCourt(id: string, sport_type: SportTypeEnum, name: string): DbCourt {
  return {
    id,
    name,
    sport_type,
    surface: 'Hard',
    is_indoor: true,
    capacity: 4,
    price_per_hour: 200,
    rating: 5,
    review_count: 0,
    image_url: '/images/courts/court-fallback.jpg',
    gallery_urls: [],
    description: null,
    features: [],
    rules: [],
    status: 'Available',
    working_hours_open: '07:00:00',
    working_hours_close: '23:00:00',
    slot_duration_minutes: 60,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  };
}

const FOOTBALL = makeDbCourt('00000000-0000-4000-8000-000000000001', 'Football', 'Champions Stadium 7v7');
const TENNIS = makeDbCourt('00000000-0000-4000-8000-000000000002', 'Tennis', 'Clay Court Roland Garros Replica');
const PADEL = makeDbCourt('00000000-0000-4000-8000-000000000003', 'Padel', 'Pro Padel Center Arena 1');
const ALL_COURTS = [FOOTBALL, TENNIS, PADEL];

function makeRequest(url: string): Request {
  return new Request(url);
}

beforeEach(() => vi.clearAllMocks());

// ─────────────────────────────────────────────────────────────────
// Service: getCourtsFromSupabase
// ─────────────────────────────────────────────────────────────────
describe('getCourtsFromSupabase sport filter', () => {
  it('never calls ilike on sport_type (enum has no ILIKE operator)', async () => {
    const c = seed(ALL_COURTS);

    await getCourtsFromSupabase('Padel');

    expect(c.ilike).not.toHaveBeenCalled();
  });

  it('returns every court when no filter is given', async () => {
    seed(ALL_COURTS);

    const result = await getCourtsFromSupabase();

    expect(result.map((court) => court.sportType)).toEqual(['Football', 'Tennis', 'Padel']);
  });

  it('matches a sport case-insensitively', async () => {
    seed(ALL_COURTS);

    const lower = await getCourtsFromSupabase('padel');
    const upper = await getCourtsFromSupabase('PADEL');

    expect(lower.map((court) => court.sportType)).toEqual(['Padel']);
    expect(upper.map((court) => court.sportType)).toEqual(['Padel']);
  });

  it('is a whole-value match, matching the previous bare-value ILIKE', async () => {
    seed(ALL_COURTS);

    const result = await getCourtsFromSupabase('pad');

    expect(result).toEqual([]);
  });

  it('returns an empty list for SQL-injection input instead of erroring', async () => {
    seed(ALL_COURTS);

    const result = await getCourtsFromSupabase("' OR 1=1--");

    expect(result).toEqual([]);
  });

  it('still propagates real database errors', async () => {
    chain = makeChain({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(chain);

    await expect(getCourtsFromSupabase('Padel')).rejects.toThrow('Failed to fetch courts: boom');
  });
});

// ─────────────────────────────────────────────────────────────────
// API route: GET /api/courts?sport=
// ─────────────────────────────────────────────────────────────────
describe('GET /api/courts?sport=', () => {
  it('returns 200 with the matching court (was a 500 enum-ilike error)', async () => {
    const c = seed(ALL_COURTS);

    const res = await courtsGET(makeRequest('http://localhost/api/courts?sport=Padel'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.count).toBe(1);
    expect(json.data[0].sportType).toBe('Padel');
    expect(c.ilike).not.toHaveBeenCalled();
  });

  it('returns 200 with an empty list for a SQL-injection sport param', async () => {
    const c = seed(ALL_COURTS);

    const res = await courtsGET(
      makeRequest("http://localhost/api/courts?sport=%27%20OR%201%3D1--")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.count).toBe(0);
    expect(json.data).toEqual([]);
    expect(c.ilike).not.toHaveBeenCalled();
  });

  it('returns all courts when sport is missing or is "All"', async () => {
    const c = seed(ALL_COURTS);

    const missing = await (await courtsGET(makeRequest('http://localhost/api/courts'))).json();
    const all = await (
      await courtsGET(makeRequest('http://localhost/api/courts?sport=All'))
    ).json();

    expect(missing.count).toBe(3);
    expect(all.count).toBe(3);
    expect(c.ilike).not.toHaveBeenCalled();
  });
});
