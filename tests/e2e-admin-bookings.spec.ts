/**
 * Phase 2 — Admin Bookings Management (/admin/bookings)
 *
 * Covers, against the REAL app on PLAYWRIGHT_BASE_URL with REAL Supabase:
 *  - page renders with toolbar, status chips and table for an admin
 *  - non-admin users are redirected away
 *  - server-side search (match + filtered-empty + Clear filters)
 *  - date filter scoping
 *  - status chip filtering
 *  - details drawer open / Escape close
 *  - confirm Reserved → Confirmed via the drawer (existing Server Action)
 *  - cancel Confirmed → Cancelled via the drawer (2h-window action, rules unchanged)
 *  - walk-in bookings (user_id NULL) are listed
 *  - pagination controls render
 *
 * Test data is created/cleaned up with the SERVICE ROLE client only
 * (setup + cleanup), mirroring e2e-real-authorization.spec.ts. The UI
 * actions themselves run as the real signed-in admin through the app.
 */

import { test, expect, type Page } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

config({ path: resolve(__dirname, '../.env.local') });

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD!;
const USER_A_EMAIL = process.env.TEST_USER_A_EMAIL!;
const USER_A_PASSWORD = process.env.TEST_USER_A_PASSWORD!;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const sbAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const sbService: SupabaseClient = createClient(sbUrl, sbServiceKey);

async function realLogin(page: Page, email: string, password: string) {
  if (!new URL(page.url()).pathname.startsWith('/auth/login')) {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('input[type="password"]', { timeout: 30000 });
  await page.locator('input[placeholder="your@email.com"]').fill(email);
  await page.locator('input[placeholder="Enter your password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForFunction(
    () => !window.location.pathname.startsWith('/auth/login'),
    undefined,
    { timeout: 30000 }
  );
}

/** Cairo wall-clock date `daysAhead` days from now (digits only, Model B). */
function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function quotedRange(dateStr: string, start = '10:00', end = '11:00'): string {
  return `["${dateStr}T${start}:00+00","${dateStr}T${end}:00+00")`;
}

// ─── Test data (service-role setup/cleanup only) ──────────────────────────────

let courtId = '';
let reservedId = '';
let reservedNumber = '';
let reservedDate = '';
let confirmedId = '';
let confirmedNumber = '';
let walkInId: string | null = null;
let walkInNumber = '';

async function insertBooking(opts: {
  status: string;
  source: string;
  userId: string | null;
  dateStr: string;
}): Promise<{ id: string; number: string }> {
  const number = `KH-P2B-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const { data, error } = await sbService
    .from('bookings')
    .insert({
      booking_number: number,
      user_id: opts.userId,
      court_id: courtId,
      booking_range: quotedRange(opts.dateStr),
      duration_minutes: 60,
      total_price: 150,
      status: opts.status,
      booking_source: opts.source,
      user_name: 'Phase 2 Bookings Test',
      user_email: 'phase2b@test.local',
      user_phone: '+201111111111',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Booking setup failed: ${error.message}`);
  return { id: data.id as string, number };
}

test.describe.configure({ mode: 'serial' });

test.describe('Admin Bookings Management (Phase 2)', () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    const { data: court, error: courtError } = await sbService
      .from('courts')
      .select('id')
      .is('deleted_at', null)
      .limit(1)
      .single();
    if (courtError || !court) {
      throw new Error(`Could not load a court for setup: ${courtError?.message}`);
    }
    courtId = court.id as string;

    // Real user id for the ONLINE bookings (FK-safe); walk-in stays NULL.
    const { data: profile } = await sbService
      .from('profiles')
      .select('id')
      .neq('role', 'Admin')
      .limit(1)
      .single();
    if (!profile) throw new Error('No non-admin profile found for booking setup');
    const userId = profile.id as string;

    reservedDate = futureDate(40);
    const reserved = await insertBooking({
      status: 'Reserved',
      source: 'ONLINE',
      userId,
      dateStr: reservedDate,
    });
    reservedId = reserved.id;
    reservedNumber = reserved.number;

    const confirmed = await insertBooking({
      status: 'Confirmed',
      source: 'ONLINE',
      userId,
      dateStr: futureDate(41),
    });
    confirmedId = confirmed.id;
    confirmedNumber = confirmed.number;

    try {
      const walkIn = await insertBooking({
        status: 'Reserved',
        source: 'WALK_IN',
        userId: null,
        dateStr: futureDate(42),
      });
      walkInId = walkIn.id;
      walkInNumber = walkIn.number;
    } catch {
      // bookings.user_id may still be NOT NULL on live DB — walk-in test skips.
      walkInId = null;
    }
  });

  test.afterAll(async () => {
    // Delete only the bookings this test created, notifications first:
    // notifications.related_booking_id → bookings.id is a foreign key, so a
    // booking-only delete silently no-ops on rows that gained notifications
    // (e.g. via the confirm/cancel drawer actions).
    const ids = [reservedId, confirmedId, walkInId].filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;

    const { error: notifError } = await sbService
      .from('notifications')
      .delete()
      .in('related_booking_id', ids);
    if (notifError) {
      console.warn(`Cleanup warning (notifications): ${notifError.message}`);
    }

    const { error: bookingError } = await sbService
      .from('bookings')
      .delete()
      .in('id', ids);
    if (bookingError) {
      console.warn(`Cleanup warning (bookings): ${bookingError.message}`);
    }
  });

  test('admin sees the bookings page with toolbar, chips and table', async ({ page }) => {
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'All Bookings' })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByPlaceholder('Search booking #, name, email or phone')).toBeVisible();
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reserved', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Booking #' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
    // The seeded booking must be listed (searched below too, but proves the default list)
    await expect(page.getByText(reservedNumber).first()).toBeVisible({ timeout: 30000 });
  });

  test('non-admin user is redirected away from /admin/bookings', async ({ page }) => {
    await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);
    await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.pathname === '/', { timeout: 30000 });
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('search finds a booking by number; no-match shows empty state with Clear filters', async ({
    page,
  }) => {
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'All Bookings' })).toBeVisible({
      timeout: 30000,
    });

    await page.getByPlaceholder('Search booking #, name, email or phone').fill(reservedNumber);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText(reservedNumber).first()).toBeVisible({ timeout: 30000 });

    await page.getByPlaceholder('Search booking #, name, email or phone').fill('zzz-no-match-zzz-42');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('No bookings match your filters.')).toBeVisible({
      timeout: 30000,
    });

    // The toolbar renders the single Clear filters action whenever filters are active.
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByPlaceholder('Search booking #, name, email or phone')).toHaveValue('');
    await expect(page.getByText('No bookings match your filters.')).toBeHidden();
  });

  test('date filter scopes the listing to the selected day', async ({ page }) => {
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'All Bookings' })).toBeVisible({
      timeout: 30000,
    });

    await page.getByLabel('From date').fill(reservedDate);
    await page.getByLabel('To date').fill(reservedDate);
    await expect(page.getByText(reservedNumber).first()).toBeVisible({ timeout: 30000 });
  });

  test('details drawer opens with booking info and closes on Escape', async ({ page }) => {
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'All Bookings' })).toBeVisible({
      timeout: 30000,
    });

    await page.getByPlaceholder('Search booking #, name, email or phone').fill(confirmedNumber);
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    const row = page.getByRole('row', { name: new RegExp(confirmedNumber) });
    await expect(row).toBeVisible({ timeout: 30000 });
    await row.getByRole('button', { name: 'View' }).click();

    const dialog = page.getByRole('dialog', { name: new RegExp(confirmedNumber) });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Schedule')).toBeVisible();
    await expect(dialog.getByText('Customer')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('admin confirms a Reserved booking from the drawer', async ({ page }) => {
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'All Bookings' })).toBeVisible({
      timeout: 30000,
    });

    await page.getByPlaceholder('Search booking #, name, email or phone').fill(reservedNumber);
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    const row = page.getByRole('row', { name: new RegExp(reservedNumber) });
    await expect(row).toBeVisible({ timeout: 30000 });
    await expect(row.getByText('Reserved')).toBeVisible();

    await row.getByRole('button', { name: 'View' }).click();
    const dialog = page.getByRole('dialog', { name: new RegExp(reservedNumber) });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    await expect(
      page.getByText(`Booking ${reservedNumber} confirmed.`)
    ).toBeVisible({ timeout: 30000 });
    // Row refreshed with the new status
    await expect(row.getByText('Confirmed')).toBeVisible({ timeout: 30000 });
  });

  test('admin cancels a Confirmed booking from the drawer (window.confirm accepted)', async ({
    page,
  }) => {
    page.on('dialog', (dialog) => dialog.accept());

    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'All Bookings' })).toBeVisible({
      timeout: 30000,
    });

    await page.getByPlaceholder('Search booking #, name, email or phone').fill(confirmedNumber);
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    const row = page.getByRole('row', { name: new RegExp(confirmedNumber) });
    await expect(row).toBeVisible({ timeout: 30000 });

    await row.getByRole('button', { name: 'View' }).click();
    const dialog = page.getByRole('dialog', { name: new RegExp(confirmedNumber) });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel booking' }).click();

    await expect(
      page.getByText(`Booking ${confirmedNumber} cancelled.`)
    ).toBeVisible({ timeout: 30000 });
    await expect(row.getByText('Cancelled')).toBeVisible({ timeout: 30000 });
  });

  test('status chip filters by Cancelled and keeps the cancelled booking visible', async ({
    page,
  }) => {
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'All Bookings' })).toBeVisible({
      timeout: 30000,
    });

    await page.getByRole('button', { name: 'Cancelled', exact: true }).click();
    await expect(page.getByText(confirmedNumber).first()).toBeVisible({ timeout: 30000 });
    const row = page.getByRole('row', { name: new RegExp(confirmedNumber) });
    await expect(row.getByText('Cancelled')).toBeVisible();
  });

  test('walk-in bookings (user_id NULL) are listed with a Walk-in customer', async ({ page }) => {
    test.skip(walkInId === null, 'live DB does not yet allow NULL bookings.user_id');

    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'All Bookings' })).toBeVisible({
      timeout: 30000,
    });

    await page.getByPlaceholder('Search booking #, name, email or phone').fill(walkInNumber);
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    const row = page.getByRole('row', { name: new RegExp(walkInNumber) });
    await expect(row).toBeVisible({ timeout: 30000 });
    await expect(row.getByText('Walk-in')).toBeVisible();
  });

  test('pagination controls render with Previous disabled on the first page', async ({ page }) => {
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'All Bookings' })).toBeVisible({
      timeout: 30000,
    });

    await expect(page.getByText(/Page \d+ of \d+/)).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  });
});
