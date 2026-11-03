'use server';

import { createClient } from '@/lib/supabase/server';
import { BlockedPeriod } from '@/types';
import { DbBlockedPeriod } from '@/types/database.types';
import { formatTstzrange, mapDbBlockedPeriodToBlockedPeriod } from '@/lib/mappers';

// ── Result & payload contracts (project convention: narrow, per-action) ──

export interface AdminBlockedPeriodsResult {
  success: boolean;
  blockedPeriods?: BlockedPeriod[];
  error?: string;
}

export interface CreateBlockedPeriodPayload {
  courtId: string;
  /** YYYY-MM-DD (Cairo calendar date). */
  date: string;
  /** HH:mm, Africa/Cairo wall-clock. */
  startTime: string;
  /** HH:mm. Must be strictly after startTime — same-day only (decision #3). */
  endTime: string;
  reason: string;
}

export interface CreateBlockedPeriodResult {
  success: boolean;
  blockedPeriod?: BlockedPeriod;
  /** Safe, user-facing message — never raw database output. */
  error?: string;
  /**
   * True when the rejection was caused by overlapping Reserved/Confirmed
   * bookings. The response deliberately exposes NO booking numbers and NO
   * conflict counts — browsers (Server-Actions protocol) can read every
   * field of a Server Action's return value.
   */
  hasBookingConflict?: boolean;
}

export interface DeleteBlockedPeriodResult {
  success: boolean;
  id?: string;
  error?: string;
}

// ── Validation constants (same conventions as court.actions.ts) ──

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The project's own definition of a blocking booking — byte-for-byte the
 * WHERE clause of the `prevent_double_booking` GiST constraint
 * (docs/0001_supabase_schema.sql:147-150) and the pre-existing conflict
 * pre-check in court.actions.ts:267. Expired/Cancelled never block.
 */
const BLOCKING_BOOKING_STATUSES = ['Reserved', 'Confirmed'] as const;

const LIST_ERROR = 'Failed to load blocked periods. Please try again.';
const CREATE_ERROR = 'Could not save the blocked period. Please try again.';
const DELETE_ERROR = 'Failed to delete the blocked period. Please try again.';
const OVERLAP_CHECK_ERROR = 'Could not verify existing bookings. Please try again.';
const BOOKING_CONFLICT_MESSAGE =
  'This time overlaps existing bookings. Please choose a different time.';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AdminGate =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * A3 authorization gate (identical semantics to court.actions.ts:35-48):
 * `auth.getUser()` → RLS-protected `profiles.role` re-check → fail closed.
 * Never trusts a client-supplied identity or role; uses the caller's own
 * session client (anon key, RLS always on — no service role).
 */
async function requireAdmin(supabase: SupabaseServerClient): Promise<AdminGate> {
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

  return { ok: true, userId: authData.user.id };
}

/**
 * Real calendar-date validation (not just string shape): round-trip the
 * components through leap-year-aware month lengths. Pure integer
 * arithmetic — no Date/toISOString/timezone conversion of any kind, so
 * the Model B Cairo wall-clock convention is never touched.
 */
function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [
    31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ];
  return day <= daysInMonth[month - 1];
}

/**
 * Server-side, authoritative validation for the create payload.
 * Returns the first failure message, or null when the payload is valid.
 * IMPORTANT: `endTime <= startTime` is rejected here, BEFORE any call to
 * `formatTstzrange` — that helper would silently roll an equal or
 * end-before-start pair into a next-day (24-hour) range, and
 * overnight/cross-midnight blocks are out of scope (decision #3).
 */
function validateCreatePayload(payload: CreateBlockedPeriodPayload | undefined): string | null {
  if (typeof payload?.courtId !== 'string' || !UUID_RE.test(payload.courtId)) {
    return 'Invalid court id.';
  }
  if (typeof payload.date !== 'string' || !DATE_RE.test(payload.date)) {
    return 'Date must be YYYY-MM-DD.';
  }
  if (!isRealCalendarDate(payload.date)) {
    return 'Date is not a valid calendar date.';
  }
  if (typeof payload.startTime !== 'string' || !TIME_RE.test(payload.startTime)) {
    return 'Start time must be HH:mm.';
  }
  if (typeof payload.endTime !== 'string' || !TIME_RE.test(payload.endTime)) {
    return 'End time must be HH:mm.';
  }
  // Lexicographic compare is exact for equal-length zero-padded HH:mm.
  if (payload.endTime <= payload.startTime) {
    return 'End time must be after start time.';
  }
  if (typeof payload.reason !== 'string' || payload.reason.trim().length === 0) {
    return 'Reason is required.';
  }
  return null;
}

/**
 * Server Action: List blocked periods for the admin interface
 * (`/admin/blocked-periods`).
 *
 * - Authorization: A3 (auth.getUser + RLS profiles.role re-check), fail closed.
 * - Scope: returns the admin-facing rows only (id, courtId, date, window,
 *   reason, createdAt) via the real mapper. The RLS `Admin read blocked
 *   periods` SELECT policy makes this data admin-scoped — it is NOT, and is
 *   not treated as, customer-visible availability (customer-facing blocked
 *   display is a separate, unimplemented concern).
 * - Errors: raw database messages logged server-side only.
 */
export async function getBlockedPeriodsAction(): Promise<AdminBlockedPeriodsResult> {
  try {
    const supabase = await createClient();

    const gate = await requireAdmin(supabase);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    const { data, error } = await supabase
      .from('blocked_periods')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getBlockedPeriodsAction: blocked periods query failed:', error.message);
      return { success: false, error: LIST_ERROR };
    }

    const blockedPeriods = ((data as DbBlockedPeriod[]) ?? []).map((row) =>
      mapDbBlockedPeriodToBlockedPeriod(row)
    );

    return { success: true, blockedPeriods };
  } catch (err: unknown) {
    console.error('getBlockedPeriodsAction failed:', err);
    return { success: false, error: LIST_ERROR };
  }
}

/**
 * Server Action: Admin-only blocked-period creation (Phase 3 Step C, Unit 1).
 *
 * - Authorization: A3 re-check, fail closed; RLS `Admins manage blocked periods`
 *   is the real write boundary; no service-role, no schema/RLS changes.
 * - Validation: server-authoritative — UUID court id, real calendar date,
 *   strict HH:mm, endTime > startTime (rejected BEFORE formatTstzrange so an
 *   equal/end-before-start pair can never become a next-day 24h block),
 *   non-empty trimmed reason. Court must exist and not be soft-deleted
 *   (same visibility rule as Step A/B). Past dates are deliberately NOT
 *   checked — past-date policy is an unresolved product decision.
 * - Booking conflict (approved decision #1): overlaps with Reserved/Confirmed
 *   bookings are rejected with a clear message. Bookings are NEVER cancelled,
 *   updated or otherwise mutated — this action only reads them.
 *   The read runs on the admin's session, under which the bookings SELECT
 *   policy (`own OR is_admin()`) makes every row visible; if that query
 *   errors the action FAILS CLOSED — an unreadable result is never treated
 *   as proof that no booking overlaps.
 * - LIMITATION (documented, not hidden): this is an application-level
 *   pre-check. It does not close the check-then-insert race, and it cannot
 *   substitute for database-level enforcement on other booking paths
 *   (e.g. POST /api/bookings has no check at all). DB enforcement is a
 *   separate, unimplemented unit — do not treat this action as completing it.
 * - Errors: raw database messages logged server-side only; clients receive
 *   static validation/conflict/generic messages.
 */
export async function createBlockedPeriodAction(
  payload: CreateBlockedPeriodPayload
): Promise<CreateBlockedPeriodResult> {
  try {
    const supabase = await createClient();

    // ── A3: server-side Admin role re-check (fail closed) ──
    const gate = await requireAdmin(supabase);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    // ── Input validation (server-side, authoritative) ──
    const validationError = validateCreatePayload(payload);
    if (validationError) {
      return { success: false, error: validationError };
    }
    const reason = payload.reason.trim();

    // ── Court existence (active courts only — Step A/B visibility rule) ──
    const { data: courtRow, error: courtError } = await supabase
      .from('courts')
      .select('id')
      .eq('id', payload.courtId)
      .is('deleted_at', null)
      .maybeSingle();

    if (courtError) {
      console.error('createBlockedPeriodAction: court fetch failed:', courtError.message);
      return { success: false, error: CREATE_ERROR };
    }
    if (!courtRow) {
      return { success: false, error: 'Court not found.' };
    }

    // ── Model B range (Cairo wall-clock digits annotated +00).
    // endTime > startTime is guaranteed above, so this is always a
    // same-day range — no midnight rollover can occur here. ──
    const blockedRange = formatTstzrange(payload.date, payload.startTime, payload.endTime);

    // ── Booking conflict pre-check (decision #1) — read-only; fail closed ──
    // Selects ids only: booking numbers are never fetched, so none can ever
    // leak into the action's browser-facing response (privacy decision).
    const { data: overlapRows, error: overlapError } = await supabase
      .from('bookings')
      .select('id')
      .eq('court_id', payload.courtId)
      .in('status', [...BLOCKING_BOOKING_STATUSES])
      .filter('booking_range', 'ov', blockedRange);

    if (overlapError) {
      // Fail closed: without a trustworthy pre-check we must not risk
      // covering an existing booking. Raw diagnostics stay server-side.
      console.error('createBlockedPeriodAction: booking overlap pre-check failed:', overlapError.message);
      return { success: false, error: OVERLAP_CHECK_ERROR };
    }

    const overlaps = (overlapRows ?? []) as { id: string }[];
    if (overlaps.length > 0) {
      return {
        success: false,
        hasBookingConflict: true,
        error: BOOKING_CONFLICT_MESSAGE,
      };
    }

    // ── Insert (RLS `Admins manage blocked periods` is the boundary) ──
    // NOTE: supabase-js v2.112's insert() generic resolves to `never[]` for
    // this hand-written Database type (the same repo-wide typing gap that led
    // court.actions.ts to cast `as never` on update) — the inline payload
    // object remains the real type contract while keeping lint clean.
    const { data: insertedRow, error: insertError } = await supabase
      .from('blocked_periods')
      .insert({
        court_id: payload.courtId,
        blocked_range: blockedRange,
        reason,
        created_by: gate.userId,
      } as never)
      .select('*')
      .single();

    if (insertError) {
      console.error('createBlockedPeriodAction: blocked period insert failed:', insertError.message);
      // Existing GiST exclusion constraint → stable, user-safe message
      if (
        insertError.code === '23P01' ||
        insertError.message.includes('prevent_overlapping_blocked_periods')
      ) {
        return { success: false, error: 'This time range overlaps an existing blocked period.' };
      }
      return { success: false, error: CREATE_ERROR };
    }

    return {
      success: true,
      blockedPeriod: mapDbBlockedPeriodToBlockedPeriod(insertedRow as DbBlockedPeriod),
    };
  } catch (err: unknown) {
    console.error('createBlockedPeriodAction failed:', err);
    return { success: false, error: CREATE_ERROR };
  }
}

/**
 * Server Action: Admin-only blocked-period deletion by primary key.
 *
 * - Authorization: A3 re-check, fail closed.
 * - Scoping: deletes exactly the requested `id` — nothing else; bookings and
 *   related records are never touched.
 * - Outcome verification: the delete is followed by `.select('id')` so both
 *   the database error AND the affected-row count are checked; success is
 *   returned only when a row was actually deleted (zero rows → not-found).
 * - Errors: raw database messages logged server-side only.
 */
export async function deleteBlockedPeriodAction(id: string): Promise<DeleteBlockedPeriodResult> {
  try {
    const supabase = await createClient();

    // ── A3: server-side Admin role re-check (fail closed) ──
    const gate = await requireAdmin(supabase);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return { success: false, error: 'Invalid blocked period id.' };
    }

    const { data: deletedRows, error } = await supabase
      .from('blocked_periods')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      console.error('deleteBlockedPeriodAction: delete failed:', error.message);
      return { success: false, error: DELETE_ERROR };
    }

    const rows = (deletedRows ?? []) as { id: string }[];
    if (rows.length === 0) {
      // RLS-hidden or already-deleted row — never report success.
      return { success: false, error: 'Blocked period not found.' };
    }

    return { success: true, id: rows[0].id };
  } catch (err: unknown) {
    console.error('deleteBlockedPeriodAction failed:', err);
    return { success: false, error: DELETE_ERROR };
  }
}
