'use server';

import { createClient } from '@/lib/supabase/server';
import { Court } from '@/types';
import { DbCourt, CourtStatusEnum, SportTypeEnum } from '@/types/database.types';
import { mapDbCourtToCourt, parseTstzrange } from '@/lib/mappers';
import { isWithinWorkingHours, isEndTimeWithinWorkingHours } from '@/lib/availability';

export interface AdminCourtsResult {
  success: boolean;
  courts?: Court[];
  error?: string;
}

/**
 * Server Action: Read-only court listing for the Admin Courts page
 * (`/admin/courts`).
 *
 * - Authorization: A3 pattern — `supabase.auth.getUser()` then an
 *   RLS-protected `profiles.role` re-check (fail closed). RLS
 *   `Public read courts` / `Admins write courts` is the real boundary;
 *   no service-role key and no RLS changes.
 * - Visibility (documented Step A decision): active courts only
 *   (`deleted_at IS NULL`) — byte-for-byte the same visibility rule as
 *   `getCourtsFromSupabase` (src/services/court.service.ts). Pass
 *   `{ includeArchived: true }` (Phase 3) to also list soft-deleted
 *   (archived) courts — visible to admins only, via the admin branch of
 *   the SELECT policy; the public court-service behavior is untouched.
 * - Mapping: real `mapDbCourtToCourt` (same data layer as the public site).
 */
export async function getAdminCourtsAction(
  options: { includeArchived?: boolean } = {}
): Promise<AdminCourtsResult> {
  try {
    const supabase = await createClient();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Authentication required.' };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile || (profile as { role?: string }).role !== 'Admin') {
      return { success: false, error: 'Admin access required.' };
    }

    const base = supabase
      .from('courts')
      .select('*')
      .order('created_at', { ascending: true });

    const { data, error } = await (options.includeArchived ? base : base.is('deleted_at', null));

    if (error) {
      // Keep the raw database message server-side only; clients get a safe,
      // generic message (no schema/driver details leak to the browser).
      console.error('getAdminCourtsAction: courts query failed:', error.message);
      return { success: false, error: 'Failed to load courts. Please try again.' };
    }

    const courts = ((data as DbCourt[]) ?? []).map((row) => mapDbCourtToCourt(row));

    return { success: true, courts };
  } catch (err: unknown) {
    console.error('getAdminCourtsAction failed:', err);
    return { success: false, error: 'Failed to load courts. Please try again.' };
  }
}

// ── Court editing (Phase 3, Step B) ──────────────────────────────

/**
 * The seven approved editable fields (Step B decision D2) — nothing else
 * is ever written. `slot_duration_minutes`, rating, review_count, capacity,
 * is_indoor, gallery, description, features, rules and deleted_at are
 * deliberately absent (D5: slot duration is never included in the payload).
 */
export interface UpdateCourtPayload {
  courtId: string;
  name: string;
  sportType: string;
  surface: string;
  pricePerHour: number;
  /** HH:mm, Africa/Cairo wall-clock. */
  workingHoursOpen: string;
  /** HH:mm. close < open = overnight session (allowed); close == open rejected (D4). */
  workingHoursClose: string;
  /**
   * Omit to preserve the court's current status (review fix #1). When provided
   * it is whitelist-validated to 'Available' | 'Maintenance' (approved decision
   * #7) — the only values this action will ever write to `status`.
   */
  status?: string;
  /** Local `/images/...` path or absolute HTTPS URL (D1), max 500 chars. */
  imageUrl: string;
  /** Set by the client only after the admin acknowledges the outside-hours warning. */
  acknowledgeOutsideHours?: boolean;
}

export interface UpdateCourtResult {
  success: boolean;
  court?: Court;
  /** Safe, user-facing message — never raw database output. */
  error?: string;
  /** Present when proposed working hours would strand existing bookings. */
  warningCode?: 'OUTSIDE_WORKING_HOURS';
  affectedBookingCount?: number;
}

const EDITABLE_SPORT_TYPES: readonly string[] = ['Football', 'Tennis', 'Padel'];
const EDITABLE_COURT_STATUSES: readonly string[] = ['Available', 'Maintenance'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const MAX_NAME_LENGTH = 120;
const MAX_SURFACE_LENGTH = 80;
const MAX_IMAGE_URL_LENGTH = 500;
const MAX_PRICE_PER_HOUR = 100_000;
const COURT_UPDATE_ERROR = 'Failed to save court changes. Please try again.';

/**
 * D1: accept only local `/images/...` paths or absolute HTTPS URLs.
 * Rejects empty/oversized values, whitespace, `http://`, `javascript:`,
 * other schemes, and malformed URLs.
 */
function isValidImageUrl(value: string): boolean {
  if (value.length === 0 || value.length > MAX_IMAGE_URL_LENGTH) return false;
  if (/\s/.test(value)) return false;
  if (value.startsWith('/images/')) return value.length > '/images/'.length;
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** D3: finite number, 0 … 100,000, at most two decimal places. */
function isValidPrice(price: number): boolean {
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE_PER_HOUR) return false;
  return Math.abs(price * 100 - Math.round(price * 100)) < 1e-6;
}

/** D4: strict HH:mm within a real day; equal open/close rejected (overnight allowed). */
function isValidWorkingHour(time: string): boolean {
  return TIME_RE.test(time);
}

/**
 * Server Action: Admin-only court update (Phase 3 Step B).
 *
 * - Authorization: A3 re-check (auth.getUser + RLS profiles.role), fail closed.
 * - Validation: server-side and authoritative — status/sport whitelists, price
 *   bounds (D3), HH:mm working hours incl. overnight rule (D4), image URL rule (D1).
 * - Payload: explicit partial update with ONLY the seven approved fields (D2/D5);
 *   `status` is written only when explicitly provided (review fix #1), so a
 *   non-editable current status (Booked / Starts Soon) is never silently changed.
 * - Hours warning: if the proposed hours differ from the current ones and would
 *   place existing Reserved/Confirmed bookings outside them, returns
 *   `warningCode: 'OUTSIDE_WORKING_HOURS'` without writing; the admin re-sends
 *   with `acknowledgeOutsideHours: true` to proceed. If the pre-check query
 *   itself fails, the action fails closed without writing (review fix #2).
 *   Bookings are never cancelled, modified or hidden by this action.
 * - Errors: raw database messages are logged server-side only; clients receive
 *   generic or static validation messages.
 * - RLS `Admins write courts` is the boundary; no service-role, no schema/RLS changes.
 */
export async function updateCourtAction(payload: UpdateCourtPayload): Promise<UpdateCourtResult> {
  try {
    const supabase = await createClient();

    // ── A3: server-side Admin role re-check (fail closed) ──
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Authentication required.' };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile || (profile as { role?: string }).role !== 'Admin') {
      return { success: false, error: 'Admin access required.' };
    }

    // ── Input validation (server-side, authoritative) ──
    if (typeof payload?.courtId !== 'string' || !UUID_RE.test(payload.courtId)) {
      return { success: false, error: 'Invalid court id.' };
    }

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      return { success: false, error: `Enter a court name (${MAX_NAME_LENGTH} characters max).` };
    }

    const surface = typeof payload.surface === 'string' ? payload.surface.trim() : '';
    if (surface.length === 0 || surface.length > MAX_SURFACE_LENGTH) {
      return { success: false, error: `Enter a surface (${MAX_SURFACE_LENGTH} characters max).` };
    }

    if (!EDITABLE_SPORT_TYPES.includes(payload.sportType)) {
      return { success: false, error: 'Invalid sport type.' };
    }

    if (!isValidPrice(payload.pricePerHour)) {
      return {
        success: false,
        error: 'Price must be a number between 0 and 100,000 EGP with at most two decimal places.',
      };
    }

    if (
      !isValidWorkingHour(payload.workingHoursOpen) ||
      !isValidWorkingHour(payload.workingHoursClose)
    ) {
      return { success: false, error: 'Working hours must be valid HH:mm times (e.g. 07:00).' };
    }
    if (payload.workingHoursOpen === payload.workingHoursClose) {
      return { success: false, error: 'Opening and closing times cannot be the same.' };
    }

    if (payload.status !== undefined && !EDITABLE_COURT_STATUSES.includes(payload.status)) {
      return { success: false, error: "Status must be 'Available' or 'Maintenance'." };
    }

    const imageUrl = typeof payload.imageUrl === 'string' ? payload.imageUrl.trim() : '';
    if (!isValidImageUrl(imageUrl)) {
      return {
        success: false,
        error:
          'Image URL must be a local /images/ path or an absolute HTTPS URL (max 500 characters).',
      };
    }

    // ── Existence check (active courts only — matches Step A visibility) ──
    const { data: courtRow, error: fetchError } = await supabase
      .from('courts')
      .select('*')
      .eq('id', payload.courtId)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchError) {
      console.error('updateCourtAction: court fetch failed:', fetchError.message);
      return { success: false, error: COURT_UPDATE_ERROR };
    }
    if (!courtRow) {
      return { success: false, error: 'Court not found.' };
    }
    const existing = courtRow as DbCourt;

    // ── Outside-hours warning (advisory; bookings are never modified) ──
    const openStr = `${payload.workingHoursOpen}:00`;
    const closeStr = `${payload.workingHoursClose}:00`;
    const hoursChanged =
      existing.working_hours_open !== openStr || existing.working_hours_close !== closeStr;

    if (hoursChanged && !payload.acknowledgeOutsideHours) {
      const { data: bookingRows, error: bookingsError } = await supabase
        .from('bookings')
        .select('booking_range')
        .eq('court_id', payload.courtId)
        .in('status', ['Reserved', 'Confirmed']);

      if (bookingsError) {
        // Review fix #2: fail closed — without a trustworthy pre-check we must
        // not risk stranding existing bookings. Raw diagnostics stay server-side.
        console.error('updateCourtAction: outside-hours pre-check failed:', bookingsError.message);
        return {
          success: false,
          error:
            'Could not verify existing bookings against the new working hours. Please try again.',
        };
      }
      if (bookingRows && bookingRows.length > 0) {
        const proposedHours = { open: payload.workingHoursOpen, close: payload.workingHoursClose };
        const affected = bookingRows.filter((row) => {
          const { date, startTime, endTime } = parseTstzrange(
            (row as { booking_range: string }).booking_range
          );
          if (!date) return false;
          return (
            !isWithinWorkingHours(startTime, proposedHours) ||
            !isEndTimeWithinWorkingHours(date, startTime, endTime, proposedHours)
          );
        }).length;

        if (affected > 0) {
          return {
            success: false,
            warningCode: 'OUTSIDE_WORKING_HOURS',
            affectedBookingCount: affected,
            error: `New working hours would leave ${affected} existing booking${
              affected === 1 ? '' : 's'
            } outside opening hours.`,
          };
        }
      }
    }

    // ── Explicit partial update — ONLY the seven approved fields (D2/D5) ──
    const updatePayload: {
      name: string;
      sport_type: SportTypeEnum;
      surface: string;
      price_per_hour: number;
      working_hours_open: string;
      working_hours_close: string;
      image_url: string;
      status?: CourtStatusEnum;
    } = {
      name,
      sport_type: payload.sportType as SportTypeEnum,
      surface,
      price_per_hour: payload.pricePerHour,
      working_hours_open: openStr,
      working_hours_close: closeStr,
      image_url: imageUrl,
    };
    // Review fix #1: `status` is written only when explicitly provided —
    // an omitted value preserves whatever status the row currently has.
    if (payload.status !== undefined) {
      updatePayload.status = payload.status as CourtStatusEnum;
    }

    // NOTE: supabase-js v2.112's update() generic resolves to `never` for this
    // hand-written Database type (the same repo-wide typing gap that led
    // booking.actions.ts to cast `as any`) — `as never` keeps this file lint-clean
    // while the explicit payload object above remains the real type contract.
    const { data: updatedRow, error } = await supabase
      .from('courts')
      .update(updatePayload as never)
      .eq('id', payload.courtId)
      // Review fix #3: guard the write itself — the row must still be active
      // even if it was soft-deleted between the existence check and this write.
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) {
      console.error('updateCourtAction: courts update failed:', error.message);
      // Review fix #3: zero affected rows (soft-delete race / vanished row)
      // surfaces as PGRST116 — report as not-found instead of generic.
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Court not found.' };
      }
      return { success: false, error: COURT_UPDATE_ERROR };
    }

    return { success: true, court: mapDbCourtToCourt(updatedRow as DbCourt) };
  } catch (err: unknown) {
    console.error('updateCourtAction failed:', err);
    return { success: false, error: COURT_UPDATE_ERROR };
  }
}

// ── Court creation & archive lifecycle (Phase 3 close) ───────────

/**
 * Payload for Admin court creation. Identical field rules to
 * `UpdateCourtPayload` (same validators), minus `courtId`.
 */
export interface CreateCourtPayload {
  name: string;
  sportType: string;
  surface: string;
  pricePerHour: number;
  /** HH:mm, Africa/Cairo wall-clock (Model B convention). */
  workingHoursOpen: string;
  /** HH:mm. close < open = overnight session (allowed); close == open rejected. */
  workingHoursClose: string;
  /** Local `/images/...` path or absolute HTTPS URL (D1), max 500 chars. */
  imageUrl: string;
  /** Optional; the DB default 'Available' applies when omitted. */
  status?: string;
}

export interface CreateCourtResult {
  success: boolean;
  court?: Court;
  /** Safe, user-facing message — never raw database output. */
  error?: string;
}

const COURT_CREATE_ERROR = 'Failed to create the court. Please try again.';

/**
 * Server Action: Admin-only court creation (Phase 3).
 *
 * - Authorization: A3 re-check, fail closed; RLS `Admins write courts`
 *   (FOR ALL, WITH CHECK = USING) is the insert boundary; no service-role.
 * - Validation: server-side and authoritative — the exact same rules as
 *   `updateCourtAction` (sport whitelist, price bounds D3, strict HH:mm
 *   with the D4 overnight rule, image URL rule D1, status whitelist).
 *   Status is written only when provided; otherwise the DB default
 *   'Available' applies.
 * - Payload minimality: only columns the admin actually provided are
 *   written; every schema default (is_indoor, capacity, rating,
 *   gallery_urls, features, rules, slot_duration_minutes, timestamps)
 *   is left to the database.
 * - Errors: raw database messages logged server-side only; clients
 *   receive static messages.
 */
export async function createCourtAction(payload: CreateCourtPayload): Promise<CreateCourtResult> {
  try {
    const supabase = await createClient();

    // ── A3: server-side Admin role re-check (fail closed) ──
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Authentication required.' };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile || (profile as { role?: string }).role !== 'Admin') {
      return { success: false, error: 'Admin access required.' };
    }

    // ── Input validation (server-side, authoritative — same rules as update) ──
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      return { success: false, error: `Enter a court name (${MAX_NAME_LENGTH} characters max).` };
    }

    const surface = typeof payload?.surface === 'string' ? payload.surface.trim() : '';
    if (surface.length === 0 || surface.length > MAX_SURFACE_LENGTH) {
      return { success: false, error: `Enter a surface (${MAX_SURFACE_LENGTH} characters max).` };
    }

    if (!EDITABLE_SPORT_TYPES.includes(payload.sportType)) {
      return { success: false, error: 'Invalid sport type.' };
    }

    if (!isValidPrice(payload.pricePerHour)) {
      return {
        success: false,
        error: 'Price must be a number between 0 and 100,000 EGP with at most two decimal places.',
      };
    }

    if (
      !isValidWorkingHour(payload.workingHoursOpen) ||
      !isValidWorkingHour(payload.workingHoursClose)
    ) {
      return { success: false, error: 'Working hours must be valid HH:mm times (e.g. 07:00).' };
    }
    if (payload.workingHoursOpen === payload.workingHoursClose) {
      return { success: false, error: 'Opening and closing times cannot be the same.' };
    }

    if (payload.status !== undefined && !EDITABLE_COURT_STATUSES.includes(payload.status)) {
      return { success: false, error: "Status must be 'Available' or 'Maintenance'." };
    }

    const imageUrl = typeof payload.imageUrl === 'string' ? payload.imageUrl.trim() : '';
    if (!isValidImageUrl(imageUrl)) {
      return {
        success: false,
        error:
          'Image URL must be a local /images/ path or an absolute HTTPS URL (max 500 characters).',
      };
    }

    // ── Insert (RLS `Admins write courts` is the boundary) ──
    const insertPayload: {
      name: string;
      sport_type: SportTypeEnum;
      surface: string;
      price_per_hour: number;
      working_hours_open: string;
      working_hours_close: string;
      image_url: string;
      status?: CourtStatusEnum;
    } = {
      name,
      sport_type: payload.sportType as SportTypeEnum,
      surface,
      price_per_hour: payload.pricePerHour,
      working_hours_open: `${payload.workingHoursOpen}:00`,
      working_hours_close: `${payload.workingHoursClose}:00`,
      image_url: imageUrl,
    };
    if (payload.status !== undefined) {
      insertPayload.status = payload.status as CourtStatusEnum;
    }

    // Same repo-wide supabase-js v2.112 insert() generic gap as the other
    // actions — `as never` keeps this file lint-clean while the explicit
    // payload object above remains the real type contract.
    const { data: insertedRow, error } = await supabase
      .from('courts')
      .insert(insertPayload as never)
      .select('*')
      .single();

    if (error) {
      console.error('createCourtAction: courts insert failed:', error.message);
      return { success: false, error: COURT_CREATE_ERROR };
    }

    return { success: true, court: mapDbCourtToCourt(insertedRow as DbCourt) };
  } catch (err: unknown) {
    console.error('createCourtAction failed:', err);
    return { success: false, error: COURT_CREATE_ERROR };
  }
}

export interface SetCourtArchivedPayload {
  courtId: string;
  /** true = archive (set deleted_at); false = restore (clear deleted_at). */
  archived: boolean;
}

export interface SetCourtArchivedResult {
  success: boolean;
  courtId?: string;
  /** Safe, user-facing message — never raw database output. */
  error?: string;
}

const COURT_ARCHIVE_ERROR = 'Failed to update the court archive state. Please try again.';

/**
 * Server Action: Admin-only archive/restore (soft delete) of a court.
 *
 * - Authorization: A3 re-check, fail closed; RLS `Admins write courts` is
 *   the write boundary (USING is admin() also matches already-archived
 *   rows, so restoring works).
 * - Guarantees: writes ONLY `deleted_at` on exactly one court row. Existing
 *   bookings and blocked periods are NEVER modified, cancelled or hidden by
 *   this action. Archiving hides the court from the public site through the
 *   existing `Public read courts` policy — no data is deleted.
 * - Outcome verification: the update is followed by `.select('id')` so BOTH
 *   the database error AND the affected-row count are checked (zero rows →
 *   'Court not found.').
 */
export async function setCourtArchivedAction(
  payload: SetCourtArchivedPayload
): Promise<SetCourtArchivedResult> {
  try {
    const supabase = await createClient();

    // ── A3: server-side Admin role re-check (fail closed) ──
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: 'Authentication required.' };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile || (profile as { role?: string }).role !== 'Admin') {
      return { success: false, error: 'Admin access required.' };
    }

    if (typeof payload?.courtId !== 'string' || !UUID_RE.test(payload.courtId)) {
      return { success: false, error: 'Invalid court id.' };
    }
    if (typeof payload?.archived !== 'boolean') {
      return { success: false, error: 'Invalid archive state.' };
    }

    const { data: affectedRows, error } = await supabase
      .from('courts')
      .update({ deleted_at: payload.archived ? new Date().toISOString() : null } as never)
      .eq('id', payload.courtId)
      .select('id');

    if (error) {
      console.error('setCourtArchivedAction: courts update failed:', error.message);
      return { success: false, error: COURT_ARCHIVE_ERROR };
    }

    const rows = (affectedRows ?? []) as { id: string }[];
    if (rows.length === 0) {
      return { success: false, error: 'Court not found.' };
    }

    return { success: true, courtId: rows[0].id };
  } catch (err: unknown) {
    console.error('setCourtArchivedAction failed:', err);
    return { success: false, error: COURT_ARCHIVE_ERROR };
  }
}
