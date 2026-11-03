import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DbBooking, DbProfile } from '@/types/database.types';

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

const getCourtInfoMapMock = vi.fn();
vi.mock('@/services/court.service', () => ({
  getCourtInfoMap: (...args: unknown[]) => getCourtInfoMapMock(...args),
  getCourtInfoForBooking: vi.fn(),
  // mappers.mapDbBookingToBooking falls back to this constant when a booking
  // has no court info; without it the mocked module throws at call time.
  FALLBACK_COURT_IMAGE: '/images/courts/fallback.jpg',
}));

import {
  getAdminCustomersPageAction,
  getAdminCustomerDetailAction,
  getAdminCustomerBookingsPageAction,
  updateCustomerStatusAction,
} from '@/app/actions/customer.actions';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

interface MockChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  maybeSingle: () => Promise<QueryResult>;
  then: (resolve: (value: QueryResult) => void) => void;
}

function makeChain(state: { maybeSingle?: QueryResult[]; then?: QueryResult[] }): MockChain {
  const chain = {} as MockChain;
  const msQueue = [...(state.maybeSingle ?? [])];
  const thenQueue = [...(state.then ?? [])];
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(() => {
    const next = msQueue.length > 1 ? msQueue.shift() : msQueue[0];
    return Promise.resolve(next ?? { data: null, error: null });
  });
  chain.then = (resolve) => {
    const next = thenQueue.length > 1 ? thenQueue.shift() : thenQueue[0];
    resolve(next ?? { data: null, error: null });
  };
  return chain;
}

const ADMIN_ROLE: QueryResult = { data: { role: 'Admin' }, error: null };
const ADMIN_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CUSTOMER_ID = '0f0f8a5e-1234-4abc-9def-0123456789ab';

let profilesChain: MockChain;
let bookingsChain: MockChain;

function resetChains(
  overrides: {
    profilesMaybeSingle?: QueryResult[];
    profilesThen?: QueryResult[];
    bookingsThen?: QueryResult[];
  } = {}
) {
  profilesChain = makeChain({
    maybeSingle: overrides.profilesMaybeSingle ?? [ADMIN_ROLE],
    then: overrides.profilesThen ?? [],
  });
  bookingsChain = makeChain({
    then: overrides.bookingsThen ?? [],
  });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return profilesChain;
    if (table === 'bookings') return bookingsChain;
    throw new Error(`unexpected table: ${table}`);
  });
}

function makeProfile(overrides: Partial<DbProfile> = {}): DbProfile {
  return {
    id: CUSTOMER_ID,
    full_name: 'Sara Hassan',
    email: 'sara.hassan@example.com',
    phone_number: '+201001112233',
    avatar_url: null,
    role: 'User',
    status: 'Active',
    date_of_birth: null,
    gender: null,
    address: null,
    emergency_contact: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-02T10:00:00Z',
    ...overrides,
  };
}

function makeBooking(overrides: Partial<DbBooking> = {}): DbBooking {
  return {
    id: 'b1b1b1b1-2222-4333-8444-555555555555',
    booking_number: 'KH-1001',
    user_id: CUSTOMER_ID,
    court_id: 'c1c1c1c1-1111-4222-8333-999999999999',
    booking_range: '[2026-11-01 10:00:00+00, 2026-11-01 11:00:00+00)',
    duration_minutes: 60,
    total_price: 250,
    status: 'Confirmed',
    booking_source: 'ONLINE',
    user_name: 'Sara Hassan',
    user_email: 'sara.hassan@example.com',
    user_phone: '+201001112233',
    created_at: '2026-10-20T09:00:00Z',
    updated_at: '2026-10-20T09:00:00Z',
    cancelled_at: null,
    cancellation_reason: null,
    ...overrides,
  };
}

describe('customer.actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
    getCourtInfoMapMock.mockResolvedValue(new Map());
  });

  describe('getAdminCustomersPageAction', () => {
    it('rejects unauthenticated callers before touching the database', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await getAdminCustomersPageAction();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication required.');
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('rejects non-admin authenticated users', async () => {
      resetChains({
        profilesMaybeSingle: [{ data: { role: 'Customer' }, error: null }],
      });

      const result = await getAdminCustomersPageAction();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Admin access required.');
      expect(profilesChain.neq).not.toHaveBeenCalled();
      expect(profilesChain.range).not.toHaveBeenCalled();
    });

    it('rejects when the caller profile row is missing', async () => {
      resetChains({ profilesMaybeSingle: [{ data: null, error: null }] });

      const result = await getAdminCustomersPageAction();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Admin access required.');
      expect(profilesChain.range).not.toHaveBeenCalled();
    });

    it('re-checks admin role via profiles.role before listing', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile()], error: null, count: 1 }],
      });

      await getAdminCustomersPageAction();

      expect(profilesChain.select).toHaveBeenNthCalledWith(1, 'role');
      expect(profilesChain.eq).toHaveBeenNthCalledWith(1, 'id', ADMIN_ID);
      expect(profilesChain.maybeSingle).toHaveBeenCalledTimes(1);
    });

    it('returns page 1 with offset range 0-24 and fixed pageSize 25', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile()], error: null, count: 42 }],
      });

      const result = await getAdminCustomersPageAction();

      expect(result.success).toBe(true);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.total).toBe(42);
      expect(profilesChain.range).toHaveBeenCalledWith(0, 24);
    });

    it('applies page 2 as offset range 25-49', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile()], error: null, count: 42 }],
      });

      const result = await getAdminCustomersPageAction({ page: 2 });

      expect(result.success).toBe(true);
      expect(result.page).toBe(2);
      expect(profilesChain.range).toHaveBeenCalledWith(25, 49);
    });

    it.each([0, -1, 1.5, '2' as unknown as number])(
      'rejects invalid page %p before listing',
      async (page) => {
        const result = await getAdminCustomersPageAction({ page });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid page number.');
        expect(profilesChain.range).not.toHaveBeenCalled();
      }
    );

    it('requests exact total count alongside rows', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile()], error: null, count: 7 }],
      });

      await getAdminCustomersPageAction();

      expect(profilesChain.select).toHaveBeenCalledWith(
        'id, full_name, email, phone_number, avatar_url, role, status, date_of_birth, gender, address, emergency_contact, created_at, updated_at',
        { count: 'exact' }
      );
    });

    it('excludes Admin accounts by default', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile()], error: null, count: 1 }],
      });

      const result = await getAdminCustomersPageAction();

      expect(result.success).toBe(true);
      expect(profilesChain.neq).toHaveBeenCalledWith('role', 'Admin');
      expect(profilesChain.eq).not.toHaveBeenCalledWith('role', 'Admin');
    });

    it('includes Admin accounts when role=Admin is explicitly requested', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile({ role: 'Admin' })], error: null, count: 1 }],
      });

      const result = await getAdminCustomersPageAction({ role: 'Admin' });

      expect(result.success).toBe(true);
      expect(profilesChain.neq).not.toHaveBeenCalled();
      expect(profilesChain.eq).toHaveBeenCalledWith('role', 'Admin');
    });

    it('rejects an invalid role filter', async () => {
      const result = await getAdminCustomersPageAction({ role: 'SuperAdmin' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid role filter.');
      expect(profilesChain.range).not.toHaveBeenCalled();
    });

    it('rejects an invalid status filter', async () => {
      const result = await getAdminCustomersPageAction({ status: 'Banned' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid status filter.');
      expect(profilesChain.range).not.toHaveBeenCalled();
    });

    it('applies a valid status filter with equality', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile({ status: 'Suspended' })], error: null, count: 1 }],
      });

      const result = await getAdminCustomersPageAction({ status: 'Suspended' });

      expect(result.success).toBe(true);
      expect(profilesChain.eq).toHaveBeenCalledWith('status', 'Suspended');
    });

    it('searches name, email and phone via a single sanitized .or()', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile()], error: null, count: 1 }],
      });

      const result = await getAdminCustomersPageAction({ search: 'jane,doe' });

      expect(result.success).toBe(true);
      expect(profilesChain.or).toHaveBeenCalledWith(
        'full_name.ilike.%jane doe%,email.ilike.%jane doe%,phone_number.ilike.%jane doe%'
      );
    });

    it('strips PostgREST .or() injection characters from the search term', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile()], error: null, count: 1 }],
      });

      await getAdminCustomersPageAction({ search: `a,b(c)'d"e\\f` });

      const orArg = profilesChain.or.mock.calls[0][0] as string;
      expect(orArg).toContain('full_name.ilike.%a b c d e f%');
      expect(orArg).not.toContain(`'`);
      expect(orArg).not.toContain(`"`);
      expect(orArg).not.toContain('\\');
    });

    it('caps the search term at 100 characters', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile()], error: null, count: 1 }],
      });

      await getAdminCustomersPageAction({ search: 'x'.repeat(150) });

      const orArg = profilesChain.or.mock.calls[0][0] as string;
      expect(orArg).toContain('x'.repeat(100));
      expect(orArg).not.toContain('x'.repeat(101));
    });

    it('issues no .or() when search is empty', async () => {
      resetChains({
        profilesThen: [{ data: [], error: null, count: 0 }],
      });

      const result = await getAdminCustomersPageAction({ search: '   ' });

      expect(result.success).toBe(true);
      expect(profilesChain.or).not.toHaveBeenCalled();
    });

    it('escapes ILIKE wildcards so % and _ match literally', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile()], error: null, count: 1 }],
      });

      const result = await getAdminCustomersPageAction({ search: '50%_off' });

      expect(result.success).toBe(true);
      const orArg = profilesChain.or.mock.calls[0][0] as string;
      // A single escaping backslash before each wildcard so postgres ILIKE
      // (default escape '\') treats them literally. PostgREST passes the
      // URL-decoded filter value through unchanged, so a double backslash
      // would escape the backslash itself and leave '%'/'_' live.
      expect(orArg).toContain('50\\%\\_off');
      expect(orArg).not.toContain('50%');
      // Regression: the old double-escape produced `50\\%\\_off` (two
      // backslashes), which postgres reads as a literal '\' plus a live '%'.
      expect(orArg).not.toContain('50\\\\%');
    });

    it('applies the wildcard escape to every column in the .or()', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile()], error: null, count: 1 }],
      });

      const result = await getAdminCustomersPageAction({ search: '100%_done' });

      expect(result.success).toBe(true);
      expect(profilesChain.or).toHaveBeenCalledWith(
        'full_name.ilike.%100\\%\\_done%,email.ilike.%100\\%\\_done%,phone_number.ilike.%100\\%\\_done%'
      );
    });

    it('maps snake_case profile rows to Customer shape', async () => {
      resetChains({
        profilesThen: [{ data: [makeProfile({ phone_number: null })], error: null, count: 1 }],
      });

      const result = await getAdminCustomersPageAction();

      expect(result.customers).toHaveLength(1);
      expect(result.customers?.[0]).toEqual({
        id: CUSTOMER_ID,
        fullName: 'Sara Hassan',
        email: 'sara.hassan@example.com',
        phoneNumber: null,
        avatarUrl: null,
        role: 'User',
        status: 'Active',
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: '2026-09-02T10:00:00Z',
      });
    });

    it('returns a generic error on query failure without leaking the search term to logs', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      resetChains({
        profilesThen: [
          {
            data: null,
            error: {
              message: `syntax error near "canary.pii@example.com"`,
              code: 'PGRST2005',
            },
          },
        ],
      });

      const result = await getAdminCustomersPageAction({
        search: 'canary.pii@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to load customers. Please try again.');
      expect(consoleSpy).toHaveBeenCalledWith(
        'getAdminCustomersPageAction failed (code):',
        'PGRST2005'
      );
      for (const call of consoleSpy.mock.calls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain('canary.pii@example.com');
        }
      }
      consoleSpy.mockRestore();
    });
  });

  describe('getAdminCustomerDetailAction', () => {
    it('rejects unauthenticated callers before touching the database', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await getAdminCustomerDetailAction(CUSTOMER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication required.');
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('rejects a malformed customer id', async () => {
      const result = await getAdminCustomerDetailAction('not-a-uuid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid customer id.');
      expect(profilesChain.eq).toHaveBeenCalledTimes(1);
      expect(profilesChain.maybeSingle).toHaveBeenCalledTimes(1);
    });

    it('returns Customer not found when no row matches', async () => {
      resetChains({
        profilesMaybeSingle: [ADMIN_ROLE, { data: null, error: null }],
      });

      const result = await getAdminCustomerDetailAction(CUSTOMER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Customer not found.');
      expect(profilesChain.eq).toHaveBeenNthCalledWith(2, 'id', CUSTOMER_ID);
    });

    it('returns the mapped customer for a matching UUID', async () => {
      resetChains({
        profilesMaybeSingle: [ADMIN_ROLE, { data: makeProfile(), error: null }],
      });

      const result = await getAdminCustomerDetailAction(CUSTOMER_ID);

      expect(result.success).toBe(true);
      expect(result.customer?.id).toBe(CUSTOMER_ID);
      expect(result.customer?.fullName).toBe('Sara Hassan');
      expect(result.customer?.phoneNumber).toBe('+201001112233');
      expect(result.customer?.role).toBe('User');
      expect(result.customer?.status).toBe('Active');
    });

    it('returns sensitive profile fields on the detail action', async () => {
      resetChains({
        profilesMaybeSingle: [
          ADMIN_ROLE,
          {
            data: makeProfile({
              date_of_birth: '1995-04-12',
              gender: 'Female',
              address: '12 Nile St, Giza',
              emergency_contact: '+201122334455',
            }),
            error: null,
          },
        ],
      });

      const result = await getAdminCustomerDetailAction(CUSTOMER_ID);

      expect(result.success).toBe(true);
      expect(result.customer?.dateOfBirth).toBe('1995-04-12');
      expect(result.customer?.gender).toBe('Female');
      expect(result.customer?.address).toBe('12 Nile St, Giza');
      expect(result.customer?.emergencyContact).toBe('+201122334455');
    });

    it('returns a generic error when the query fails', async () => {
      resetChains({
        profilesMaybeSingle: [
          ADMIN_ROLE,
          { data: null, error: { message: 'boom', code: 'XX000' } },
        ],
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await getAdminCustomerDetailAction(CUSTOMER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to load customer details. Please try again.');
      consoleSpy.mockRestore();
    });
  });

  describe('updateCustomerStatusAction', () => {
    it('rejects unauthenticated callers before touching the database', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await updateCustomerStatusAction(CUSTOMER_ID, 'Suspended');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication required.');
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('rejects non-admin authenticated users', async () => {
      resetChains({
        profilesMaybeSingle: [{ data: { role: 'Customer' }, error: null }],
      });

      const result = await updateCustomerStatusAction(CUSTOMER_ID, 'Suspended');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Admin access required.');
      expect(profilesChain.update).not.toHaveBeenCalled();
    });

    it('rejects a malformed customer id without updating', async () => {
      const result = await updateCustomerStatusAction('not-a-uuid', 'Suspended');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid customer id.');
      expect(profilesChain.update).not.toHaveBeenCalled();
    });

    it.each(['Archived', 'pending', '', 42])(
      'rejects the non-whitelisted status %p without updating',
      async (status) => {
        const result = await updateCustomerStatusAction(CUSTOMER_ID, status as string);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid status value.');
        expect(profilesChain.update).not.toHaveBeenCalled();
      }
    );

    it('returns Customer not found when the target row is missing', async () => {
      resetChains({
        profilesMaybeSingle: [ADMIN_ROLE, { data: null, error: null }],
      });

      const result = await updateCustomerStatusAction(CUSTOMER_ID, 'Suspended');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Customer not found.');
      expect(profilesChain.update).not.toHaveBeenCalled();
      expect(profilesChain.eq).toHaveBeenNthCalledWith(2, 'id', CUSTOMER_ID);
    });

    it('rejects status changes targeting an Admin account', async () => {
      resetChains({
        profilesMaybeSingle: [ADMIN_ROLE, { data: { role: 'Admin' }, error: null }],
      });

      const result = await updateCustomerStatusAction(CUSTOMER_ID, 'Suspended');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Admin accounts cannot be modified.');
      expect(profilesChain.update).not.toHaveBeenCalled();
    });

    it('updates the status and returns the refreshed customer', async () => {
      resetChains({
        profilesMaybeSingle: [
          ADMIN_ROLE,
          { data: { role: 'User' }, error: null },
          { data: makeProfile({ status: 'Suspended' }), error: null },
        ],
      });

      const result = await updateCustomerStatusAction(CUSTOMER_ID, 'Suspended');

      expect(result.success).toBe(true);
      expect(result.customer?.id).toBe(CUSTOMER_ID);
      expect(result.customer?.status).toBe('Suspended');
      expect(profilesChain.update).toHaveBeenCalledWith({ status: 'Suspended' });
      expect(profilesChain.eq).toHaveBeenNthCalledWith(3, 'id', CUSTOMER_ID);
      expect(profilesChain.select).toHaveBeenNthCalledWith(
        3,
        'id, full_name, email, phone_number, avatar_url, role, status, date_of_birth, gender, address, emergency_contact, created_at, updated_at'
      );
    });

    it('returns a generic error when the update fails', async () => {
      resetChains({
        profilesMaybeSingle: [
          ADMIN_ROLE,
          { data: { role: 'User' }, error: null },
          { data: null, error: { message: 'boom', code: 'XX000' } },
        ],
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await updateCustomerStatusAction(CUSTOMER_ID, 'Inactive');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update customer status. Please try again.');
      consoleSpy.mockRestore();
    });
  });

  describe('getAdminCustomerBookingsPageAction', () => {
    it('rejects unauthenticated callers before touching the database', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await getAdminCustomerBookingsPageAction(CUSTOMER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication required.');
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('rejects a malformed customer id', async () => {
      const result = await getAdminCustomerBookingsPageAction('nope');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid customer id.');
      expect(bookingsChain.eq).not.toHaveBeenCalled();
    });

    it('matches booking history with exact bookings.user_id equality only', async () => {
      resetChains({
        bookingsThen: [{ data: [makeBooking()], error: null, count: 1 }],
      });

      const result = await getAdminCustomerBookingsPageAction(CUSTOMER_ID);

      expect(result.success).toBe(true);
      expect(bookingsChain.eq).toHaveBeenCalledWith('user_id', CUSTOMER_ID);
      expect(bookingsChain.or).not.toHaveBeenCalled();
    });

    it('paginates history with offset range and exact count', async () => {
      resetChains({
        bookingsThen: [{ data: [makeBooking()], error: null, count: 30 }],
      });

      const result = await getAdminCustomerBookingsPageAction(CUSTOMER_ID, { page: 2 });

      expect(result.success).toBe(true);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(25);
      expect(result.total).toBe(30);
      expect(bookingsChain.select).toHaveBeenCalledWith(
        'id, user_id, court_id, start_time, end_time, booking_date, status, total_price, payment_status, created_at, updated_at',
        { count: 'exact' }
      );
      expect(bookingsChain.range).toHaveBeenCalledWith(25, 49);
      expect(bookingsChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('rejects an invalid page before querying', async () => {
      const result = await getAdminCustomerBookingsPageAction(CUSTOMER_ID, { page: 0 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid page number.');
      expect(bookingsChain.eq).not.toHaveBeenCalled();
    });

    it('maps history rows with court info and returns mapped bookings', async () => {
      getCourtInfoMapMock.mockResolvedValue(
        new Map([
          [
            'c1c1c1c1-1111-4222-8333-999999999999',
            { name: 'Panoramic Court', image: '/images/courts/p.jpg', sportType: 'Padel' },
          ],
        ])
      );
      resetChains({
        bookingsThen: [{ data: [makeBooking()], error: null, count: 1 }],
      });

      const result = await getAdminCustomerBookingsPageAction(CUSTOMER_ID);

      expect(result.success).toBe(true);
      expect(getCourtInfoMapMock).toHaveBeenCalledWith([
        'c1c1c1c1-1111-4222-8333-999999999999',
      ]);
      expect(result.bookings?.[0].courtName).toBe('Panoramic Court');
      expect(result.bookings?.[0].bookingNumber).toBe('KH-1001');
      expect(result.bookings?.[0].userId).toBe(CUSTOMER_ID);
      expect(result.bookings?.[0].date).toBe('2026-11-01');
      expect(result.bookings?.[0].startTime).toBe('10:00');
    });

    it('returns a generic error when the query fails', async () => {
      resetChains({
        bookingsThen: [{ data: null, error: { message: 'boom', code: 'XX001' } }],
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await getAdminCustomerBookingsPageAction(CUSTOMER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to load customer bookings. Please try again.');
      consoleSpy.mockRestore();
    });
  });

  it('never issues a write operation from any read action', async () => {
    resetChains({
      profilesMaybeSingle: [ADMIN_ROLE, { data: makeProfile(), error: null }],
      profilesThen: [{ data: [makeProfile()], error: null, count: 1 }],
      bookingsThen: [{ data: [makeBooking()], error: null, count: 1 }],
    });
    getCourtInfoMapMock.mockResolvedValue(new Map());

    await getAdminCustomersPageAction();
    await getAdminCustomerDetailAction(CUSTOMER_ID);
    await getAdminCustomerBookingsPageAction(CUSTOMER_ID);

    for (const chain of [profilesChain, bookingsChain]) {
      expect(chain.insert).not.toHaveBeenCalled();
      expect(chain.update).not.toHaveBeenCalled();
      expect(chain.delete).not.toHaveBeenCalled();
    }
  });
});
