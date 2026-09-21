import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase server client ──────────────────────────────────
const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockThen = vi.fn();
const mockInsert = vi.fn();

function makeChain(terminalResult: any) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    insert: mockInsert.mockReturnValue({
      single: vi.fn(() => Promise.resolve(terminalResult)),
    }),
    single: vi.fn(() => Promise.resolve(terminalResult)),
    maybeSingle: vi.fn(() => Promise.resolve(terminalResult)),
    // For count queries that use .then()
    then: vi.fn((resolve: any) => Promise.resolve(resolve(terminalResult))),
  };
  // Make .then work when called as a thenable
  chain[Symbol.toStringTag] = 'Promise';
  return chain;
}

let bookingsChain: any;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'bookings') return bookingsChain;
      if (table === 'courts') {
        return makeChain({
          data: { id: 'court-1', price_per_hour: 200, status: 'Available' },
          error: null,
        });
      }
      if (table === 'blocked_periods') {
        const chain = makeChain({ data: [], error: null });
        chain.then = (resolve: any) => Promise.resolve(resolve({ data: [], error: null }));
        return chain;
      }
      if (table === 'notifications') {
        return { insert: vi.fn(() => Promise.resolve({ data: null, error: null })) };
      }
      return makeChain({ data: null, error: null });
    },
  })),
}));

vi.mock('@/services/court.service', () => ({
  getCourtInfoForBooking: vi.fn(() => Promise.resolve({
    id: 'court-1', name: 'Court 1', image: '', sportType: 'Padel',
  })),
  getCourtInfoMap: vi.fn(() => Promise.resolve(new Map())),
}));

vi.mock('@/lib/pricing', () => ({
  calculateBookingPrice: vi.fn(() => 200),
}));

vi.mock('@/lib/timezone', () => ({
  isSlotPast: vi.fn(() => false),
}));

import { createBookingAction } from '@/app/actions/booking.actions';

const VALID_INPUT = {
  courtId: 'court-1',
  date: '2099-06-15',
  startTime: '10:00',
  endTime: '11:00',
  durationMinutes: 60,
  totalPrice: 200,
  userName: 'Test User',
  userEmail: 'test@example.com',
  userPhone: '+1234567890',
};

describe('Server Action Integrity — createBookingAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
    });
    // Default bookings chain: no existing bookings, insert succeeds
    bookingsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: { id: 'new-booking' }, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: vi.fn((resolve: any) => Promise.resolve(resolve({ count: 0, error: null }))),
      [Symbol.toStringTag]: 'Promise',
    };
  });

  describe('Authentication guard', () => {
    it('rejects unauthenticated requests', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await createBookingAction(VALID_INPUT);
      expect(result.success).toBe(false);
      expect(result.error).toContain('sign in');
    });
  });

  describe('Court validation', () => {
    it('rejects non-existent court', async () => {
      // Override the mock to return null for courts
      const mod = await import('@/lib/supabase/server');
      vi.mocked(mod.createClient).mockResolvedValueOnce({
        auth: { getUser: mockGetUser },
        from: (table: string) => makeChain({ data: null, error: null }),
      } as any);

      const result = await createBookingAction({ ...VALID_INPUT, courtId: 'non-existent' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Court not found');
    });
  });

  describe('23P01 Exclusion Constraint Violation handling', () => {
    it('returns user-friendly error on 23P01 code', async () => {
      bookingsChain.insert = vi.fn().mockReturnThis();
      bookingsChain.single = vi.fn(() => Promise.resolve({
        data: null,
        error: {
          code: '23P01',
          message: 'new row violates exclusion constraint "prevent_double_booking"',
        },
      }));

      const result = await createBookingAction(VALID_INPUT);
      expect(result.success).toBe(false);
      expect(result.error).toContain('already been booked');
    });

    it('returns user-friendly error when message contains prevent_double_booking', async () => {
      bookingsChain.insert = vi.fn().mockReturnThis();
      bookingsChain.single = vi.fn(() => Promise.resolve({
        data: null,
        error: {
          code: '23P01',
          message: 'conflict with prevent_double_booking constraint',
        },
      }));

      const result = await createBookingAction(VALID_INPUT);
      expect(result.success).toBe(false);
      expect(result.error).toContain('already been booked');
    });

    it('returns generic error for other DB errors', async () => {
      bookingsChain.insert = vi.fn().mockReturnThis();
      bookingsChain.single = vi.fn(() => Promise.resolve({
        data: null,
        error: {
          code: '42501',
          message: 'permission denied for table bookings',
        },
      }));

      const result = await createBookingAction(VALID_INPUT);
      expect(result.success).toBe(false);
      expect(result.error).toBe('permission denied for table bookings');
      expect(result.error).not.toContain('already been booked');
    });
  });

  describe('Active booking limit', () => {
    it('rejects when user has 5 active bookings', async () => {
      bookingsChain.then = vi.fn((resolve: any) => Promise.resolve(resolve({ count: 5, error: null })));
      bookingsChain[Symbol.toStringTag] = 'Promise';

      const result = await createBookingAction(VALID_INPUT);
      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum of 5');
    });
  });
});
