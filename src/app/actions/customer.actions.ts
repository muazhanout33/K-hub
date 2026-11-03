'use server';

import { createClient } from '@/lib/supabase/server';
import { Booking, Customer, CustomerDetails } from '@/types';
import { DbBooking, DbProfile } from '@/types/database.types';
import { mapDbBookingToBooking } from '@/lib/mappers';
import { getCourtInfoMap } from '@/services/court.service';

const CUSTOMER_PAGE_SIZE = 25;
const CUSTOMER_STATUS_WHITELIST = ['Active', 'Inactive', 'Suspended'] as const;
const CUSTOMER_ROLE_WHITELIST = ['Guest', 'User', 'Admin'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENERIC_LIST_ERROR = 'Failed to load customers. Please try again.';
const GENERIC_DETAIL_ERROR = 'Failed to load customer details. Please try again.';
const GENERIC_HISTORY_ERROR = 'Failed to load customer bookings. Please try again.';
const GENERIC_UPDATE_ERROR = 'Failed to update customer status. Please try again.';

export interface CustomersPageQuery {
  page?: number;
  search?: string;
  status?: string;
  role?: string;
}

export interface CustomersPageResult {
  success: boolean;
  customers?: Customer[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
}

export interface CustomerDetailResult {
  success: boolean;
  customer?: CustomerDetails;
  error?: string;
}

export interface CustomerStatusUpdateResult {
  success: boolean;
  customer?: CustomerDetails;
  error?: string;
}

export interface CustomerBookingsPageQuery {
  page?: number;
}

export interface CustomerBookingsPageResult {
  success: boolean;
  bookings?: Booking[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function requireAdmin(): Promise<
  { ok: true; supabase: ServerClient } | { ok: false; error: string }
> {
  const supabase = await createClient();

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return { ok: false, error: 'Authentication required.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (!profile || (profile as { role?: string }).role !== 'Admin') {
    return { ok: false, error: 'Admin access required.' };
  }

  return { ok: true, supabase };
}

function mapDbProfileToCustomer(profile: DbProfile): Customer {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    phoneNumber: profile.phone_number,
    avatarUrl: profile.avatar_url,
    role: profile.role,
    status: profile.status,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

// Detail-only mapper: extends the list shape with sensitive profile fields.
// The list action never uses this, so those fields stay off list responses.
function mapDbProfileToCustomerDetails(profile: DbProfile): CustomerDetails {
  return {
    ...mapDbProfileToCustomer(profile),
    dateOfBirth: profile.date_of_birth,
    gender: profile.gender,
    address: profile.address,
    emergencyContact: profile.emergency_contact,
  };
}

/**
 * Server Action: Admin-only customer listing for the Customers read layer.
 * Offset pagination (25/page), optional name/email/phone search, status and
 * role filters. Admin accounts are excluded unless role is explicitly asked
 * for. Read-only: never writes, never logs search terms or profile fields.
 */
export async function getAdminCustomersPageAction(
  query: CustomersPageQuery = {}
): Promise<CustomersPageResult> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    const page = query.page === undefined ? 1 : query.page;
    if (!Number.isInteger(page) || page < 1) {
      return { success: false, error: 'Invalid page number.' };
    }

    const status = query.status ?? '';
    if (
      status &&
      !CUSTOMER_STATUS_WHITELIST.includes(status as (typeof CUSTOMER_STATUS_WHITELIST)[number])
    ) {
      return { success: false, error: 'Invalid status filter.' };
    }

    const role = query.role ?? '';
    if (role && !CUSTOMER_ROLE_WHITELIST.includes(role as (typeof CUSTOMER_ROLE_WHITELIST)[number])) {
      return { success: false, error: 'Invalid role filter.' };
    }

    // Strip characters that would break/split PostgREST `.or()` syntax, and
    // escape ILIKE wildcards so '%' and '_' are treated literally.
    // A SINGLE backslash is correct: postgres ILIKE's default escape char is
    // '\', and PostgREST passes the URL-decoded filter value through unchanged
    // (verified by read-only probe against the live REST API). A double
    // backslash would escape the backslash itself and leave the following
    // '%'/'_' acting as a live wildcard.
    const search = (query.search || '')
      .replace(/[,()"'\\]/g, ' ')
      .replace(/[%_]/g, (c) => '\\' + c)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);

    let request = supabase
      .from('profiles')
      .select(
        'id, full_name, email, phone_number, avatar_url, role, status, date_of_birth, gender, address, emergency_contact, created_at, updated_at',
        { count: 'exact' }
      )
      .order('full_name', { ascending: true })
      .order('created_at', { ascending: false })
      .range((page - 1) * CUSTOMER_PAGE_SIZE, page * CUSTOMER_PAGE_SIZE - 1);

    if (role) {
      request = request.eq('role', role);
    } else {
      request = request.neq('role', 'Admin');
    }
    if (status) {
      request = request.eq('status', status);
    }
    if (search) {
      request = request.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,phone_number.ilike.%${search}%`
      );
    }

    const { data, error, count } = await request;

    if (error) {
      console.error('getAdminCustomersPageAction failed (code):', error.code ?? 'unknown');
      return { success: false, error: GENERIC_LIST_ERROR };
    }

    const rows = (data as DbProfile[]) || [];

    return {
      success: true,
      customers: rows.map(mapDbProfileToCustomer),
      total: count ?? rows.length,
      page,
      pageSize: CUSTOMER_PAGE_SIZE,
    };
  } catch (err) {
    console.error(
      'getAdminCustomersPageAction threw:',
      err instanceof Error ? err.message : 'unknown'
    );
    return { success: false, error: GENERIC_LIST_ERROR };
  }
}

/**
 * Server Action: Admin-only single customer retrieval by profile UUID.
 * Read-only; validates the UUID format before querying.
 */
export async function getAdminCustomerDetailAction(
  customerId: string
): Promise<CustomerDetailResult> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    if (typeof customerId !== 'string' || !UUID_RE.test(customerId)) {
      return { success: false, error: 'Invalid customer id.' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_number, avatar_url, role, status, date_of_birth, gender, address, emergency_contact, created_at, updated_at')
      .eq('id', customerId)
      .maybeSingle();

    if (error) {
      console.error('getAdminCustomerDetailAction failed (code):', error.code ?? 'unknown');
      return { success: false, error: GENERIC_DETAIL_ERROR };
    }
    if (!data) {
      return { success: false, error: 'Customer not found.' };
    }

    return { success: true, customer: mapDbProfileToCustomerDetails(data as DbProfile) };
  } catch (err) {
    console.error(
      'getAdminCustomerDetailAction threw:',
      err instanceof Error ? err.message : 'unknown'
    );
    return { success: false, error: GENERIC_DETAIL_ERROR };
  }
}

/**
 * Server Action: Admin-only booking history for one customer, matched with
 * exact bookings.user_id equality (walk-in bookings have user_id NULL and
 * are never matched). Offset pagination (25/page), newest first.
 */
export async function getAdminCustomerBookingsPageAction(
  customerId: string,
  query: CustomerBookingsPageQuery = {}
): Promise<CustomerBookingsPageResult> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    if (typeof customerId !== 'string' || !UUID_RE.test(customerId)) {
      return { success: false, error: 'Invalid customer id.' };
    }

    const page = query.page === undefined ? 1 : query.page;
    if (!Number.isInteger(page) || page < 1) {
      return { success: false, error: 'Invalid page number.' };
    }

    const { data, error, count } = await supabase
      .from('bookings')
      .select('id, user_id, court_id, start_time, end_time, booking_date, status, total_price, payment_status, created_at, updated_at', { count: 'exact' })
      .eq('user_id', customerId)
      .order('created_at', { ascending: false })
      .range((page - 1) * CUSTOMER_PAGE_SIZE, page * CUSTOMER_PAGE_SIZE - 1);

    if (error) {
      console.error('getAdminCustomerBookingsPageAction failed (code):', error.code ?? 'unknown');
      return { success: false, error: GENERIC_HISTORY_ERROR };
    }

    const rows = (data as DbBooking[]) || [];
    const courtMap = await getCourtInfoMap(rows.map((b) => b.court_id));
    const bookings = rows.map((b) => mapDbBookingToBooking(b, courtMap.get(b.court_id)));

    return {
      success: true,
      bookings,
      total: count ?? rows.length,
      page,
      pageSize: CUSTOMER_PAGE_SIZE,
    };
  } catch (err) {
    console.error(
      'getAdminCustomerBookingsPageAction threw:',
      err instanceof Error ? err.message : 'unknown'
    );
    return { success: false, error: GENERIC_HISTORY_ERROR };
  }
}

/**
 * Server Action: Admin-only customer status update. Status values are
 * whitelisted (Active/Inactive/Suspended) and Admin accounts are excluded —
 * admins manage access through the auth layer, not profile status. Writes go
 * through the authenticated client; admin RLS policies permit the update.
 */
export async function updateCustomerStatusAction(
  customerId: string,
  status: string
): Promise<CustomerStatusUpdateResult> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    if (typeof customerId !== 'string' || !UUID_RE.test(customerId)) {
      return { success: false, error: 'Invalid customer id.' };
    }

    if (
      typeof status !== 'string' ||
      !CUSTOMER_STATUS_WHITELIST.includes(status as (typeof CUSTOMER_STATUS_WHITELIST)[number])
    ) {
      return { success: false, error: 'Invalid status value.' };
    }

    const { data: target, error: targetError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', customerId)
      .maybeSingle();

    if (targetError) {
      console.error('updateCustomerStatusAction failed (code):', targetError.code ?? 'unknown');
      return { success: false, error: GENERIC_UPDATE_ERROR };
    }
    if (!target) {
      return { success: false, error: 'Customer not found.' };
    }
    if ((target as { role?: string }).role === 'Admin') {
      return { success: false, error: 'Admin accounts cannot be modified.' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ status } as never)
      .eq('id', customerId)
      .select(
        'id, full_name, email, phone_number, avatar_url, role, status, date_of_birth, gender, address, emergency_contact, created_at, updated_at'
      )
      .maybeSingle();

    if (error) {
      console.error('updateCustomerStatusAction failed (code):', error.code ?? 'unknown');
      return { success: false, error: GENERIC_UPDATE_ERROR };
    }
    if (!data) {
      return { success: false, error: 'Customer not found.' };
    }

    return { success: true, customer: mapDbProfileToCustomerDetails(data as DbProfile) };
  } catch (err) {
    console.error(
      'updateCustomerStatusAction threw:',
      err instanceof Error ? err.message : 'unknown'
    );
    return { success: false, error: GENERIC_UPDATE_ERROR };
  }
}
