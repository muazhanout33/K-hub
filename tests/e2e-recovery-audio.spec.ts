/**
 * Targeted browser regression tests for the three production bugs:
 *
 * 1. Durable payment -> booking confirmation recovery across reload/redirect
 *    (never "No booking in progress" when a paid booking is recoverable,
 *     never asking the user to pay again, payments not duplicated).
 * 2. Confirmation page durable recovery: no bounce to /book while a durable
 *    id exists, truthful failure + a "Try Again" that performs a REAL refetch.
 * 3. Notification audio: silent for old notifications on refresh, unlocked by
 *    the first user gesture (silent warm-up, never an audible old sound).
 * 4. Light/Dark theme preservation on the touched pages.
 *
 * Runs against the dev server (PLAYWRIGHT_BASE_URL, default :3002). The
 * "mobile" project is a SIMULATED mobile viewport (375x812) — not a real
 * Android/iOS device. Payments use the platform mock provider (no real
 * money), and every server action here runs unauthenticated, so no
 * production records are created or changed.
 */

import { test, expect, type Page } from '@playwright/test';

const PAYMENT_KEY = 'khub-payment-storage';
const BOOKING_KEY = 'khub-booking-storage';
const NOTIFICATIONS_KEY = 'khub-notifications-storage';
const THEME_KEY = 'wego-theme';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3002';

type SeedStorage = Record<string, { state: unknown; version: number }>;

async function seedStorage(page: Page, data: SeedStorage) {
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  }, data as unknown as Record<string, unknown>);
}

async function trackPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

/** Payment record — camelCase fields of the `Payment` domain type. */
function makePaidPayment(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    paymentId: 'e2e-pay-1',
    bookingId: 'e2e-booking-1',
    // Smallest currency unit (piastres for EGP): EGP 350.00
    amount: 35000,
    currency: 'EGP',
    status: 'Paid',
    createdAt: now,
    updatedAt: now,
    idempotencyKey: 'pay-e2e-booking-1',
    ...overrides,
  };
}

/** Local booking — exact shape of the `Booking` domain type. */
function makeLocalBooking(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: 'e2e-booking-1',
    bookingNumber: 'KH-E2E-000001',
    courtId: 'court-1',
    courtName: 'Test Court',
    courtImage: '/globe.svg',
    sportType: 'Padel',
    date: '2026-12-01',
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
    totalPrice: 350,
    status: 'Reserved',
    bookingSource: 'ONLINE',
    createdAt: now,
    updatedAt: now,
    userId: 'e2e-user',
    userName: 'E2E Tester',
    userEmail: 'e2e.tester@example.com',
    userPhone: '+201000000000',
    selectedSlotIds: ['slot-1'],
    ...overrides,
  };
}

test.describe('payment confirmation recovery', () => {
  test('recovers a paid booking after reload instead of "No booking in progress"', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors = await trackPageErrors(page);

    // Durable context: one Paid payment + a pending confirmation op + the
    // local booking (amount source). No selections — they do not survive
    // refresh in production either.
    await seedStorage(page, {
      [PAYMENT_KEY]: {
        version: 1,
        state: {
          payments: [makePaidPayment()],
          pendingConfirmation: {
            bookingId: 'e2e-booking-1',
            paymentId: 'e2e-pay-1',
            phase: 'confirming',
            attempts: 1,
            lastError: null,
            startedAt: Date.now() - 60_000,
            updatedAt: Date.now() - 30_000,
          },
          lastBookingId: 'e2e-booking-1',
        },
      },
      [BOOKING_KEY]: {
        version: 5,
        state: {
          bookings: [makeLocalBooking()],
          userName: 'E2E Tester',
          userEmail: 'e2e.tester@example.com',
          userPhone: '+201000000000',
        },
      },
    });

    await page.goto(`${BASE_URL}/book/payment`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // Durable context is recognised after hydration (banner for either
    // phase — auto-recovery may already have flipped it to 'failed').
    const banner = page.getByText(/finishing your booking|you will not be charged/i).first();
    await expect(banner).toBeVisible({ timeout: 45_000 });

    // Auto-recovery runs and fails deterministically here (server actions
    // require authentication in this isolated run) and must land on the
    // truthful recovery panel — not a dead-end.
    const panelHeading = page.getByRole('heading', { name: /booking confirmation issue/i });
    await expect(panelHeading).toBeVisible({ timeout: 120_000 });

    // Truthful message for a Paid payment — never asks the user to pay again.
    await expect(
      page.getByText(/your payment was received but booking confirmation failed/i).first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('button', { name: /retry confirmation/i }).first()
    ).toBeVisible();

    // The misleading dead-end must not appear at any point.
    await expect(page.getByText(/no booking in progress/i)).toHaveCount(0);

    // The user must never be asked to pay again.
    await expect(page.getByRole('button', { name: /pay egp/i })).toHaveCount(0);

    // Retry from the panel/main button is wired up: pressing it re-enters
    // processing (panel hides) and, on continued failure, the panel returns.
    await page.getByRole('button', { name: /retry confirmation/i }).first().click();
    await expect(panelHeading).not.toBeVisible({ timeout: 15_000 });
    await expect(panelHeading).toBeVisible({ timeout: 120_000 });
    await expect(
      page.getByText(/your payment was received but booking confirmation failed/i).first()
    ).toBeVisible();

    // Still on the payment page (no bounce to a dead-end) and no duplicate
    // payment was created (the Paid payment is reused).
    expect(page.url()).toContain('/book/payment');
    const paymentCount = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return 0;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.state?.payments) ? parsed.state.payments.length : 0;
      } catch {
        return -1;
      }
    }, PAYMENT_KEY);
    expect(paymentCount).toBe(1);

    // Durable op survives the failed retries (still recoverable later).
    const op = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw)?.state?.pendingConfirmation ?? null;
      } catch {
        return null;
      }
    }, PAYMENT_KEY);
    expect(op?.bookingId).toBe('e2e-booking-1');

    expect(errors).toEqual([]);
  });

  test('still shows the start-booking empty state when there is genuinely nothing to recover', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto(`${BASE_URL}/book/payment`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await expect(page.getByText(/no booking in progress/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByRole('button', { name: /start booking/i }).first()).toBeVisible();
    // No recovery banner and no failure panel for a truly empty state.
    await expect(page.getByRole('heading', { name: /booking confirmation issue/i })).toHaveCount(0);
  });
});

test.describe('confirmation page recovery', () => {
  test('surfaces recovery failure truthfully and "Try Again" performs a real refetch', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = await trackPageErrors(page);

    // Durable booking id only — the local booking list is empty, exactly
    // like after a refresh / on another device.
    await seedStorage(page, {
      [PAYMENT_KEY]: {
        version: 1,
        state: {
          payments: [],
          pendingConfirmation: null,
          lastBookingId: 'e2e-booking-1',
        },
      },
    });

    // Count server-action POSTs to this route (Next.js sends server
    // actions as POSTs to the current pathname).
    let actionPosts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/book/confirmation')) {
        actionPosts += 1;
      }
    });

    await page.goto(`${BASE_URL}/book/confirmation`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // The page must NOT redirect to /book while a durable id exists —
    // that was the "No booking in progress" bug.
    await page.waitForTimeout(3_000);
    expect(page.url()).toContain('/book/confirmation');

    // Recovery ran against the server and failed (authentication required
    // in this isolated run) — the failure must be truthfully surfaced with
    // a retry path, never a silent redirect or fake success.
    await expect(
      page.getByText(/authentication required|could not be loaded right now|unable to load/i).first()
    ).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('button', { name: /try again/i }).first()).toBeVisible();
    expect(actionPosts).toBeGreaterThanOrEqual(1);

    // "Try Again" must trigger a REAL refetch (regression: the old retry
    // only reset local state, so the effect never re-ran and the user was
    // stuck on the failure screen forever).
    const beforeRetry = actionPosts;
    await page.getByRole('button', { name: /try again/i }).first().click();
    await expect
      .poll(() => actionPosts, { timeout: 60_000 })
      .toBeGreaterThan(beforeRetry);

    // Still truthful after the retry: no redirect, no fake success.
    await expect(
      page.getByText(/authentication required|could not be loaded right now|unable to load/i).first()
    ).toBeVisible({ timeout: 60_000 });
    expect(page.url()).toContain('/book/confirmation');
    expect(errors).toEqual([]);
  });

  test('redirects to /book only when there is truly no booking to show', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`${BASE_URL}/book/confirmation`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await page.waitForURL('**/book', { timeout: 60_000 });
    expect(page.url()).not.toContain('/book/confirmation');
  });
});

test.describe('notification audio', () => {
  test('is silent for old notifications on refresh and unlocks on first user gesture', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = await trackPageErrors(page);

    // Instrument audio primitives BEFORE any app code runs:
    //  - silentPlays:   play() of the notification sound at volume 0
    //                   (the gesture warm-up — proves unlock ran, inaudible)
    //  - audiblePlays:  play() of the notification sound with volume > 0
    //                   (must stay 0: old notifications never make noise)
    //  - audioCreated:  new Audio(...) constructions
    //  - contextCreated: AudioContext constructions (delta must grow on
    //                   the gesture — the module constructs its own ctx)
    await page.addInitScript(() => {
      const w = window as unknown as {
        __kh: {
          silentPlays: number;
          audiblePlays: number;
          audioCreated: number;
          contextCreated: number;
        };
      };
      w.__kh = { silentPlays: 0, audiblePlays: 0, audioCreated: 0, contextCreated: 0 };

      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        try {
          const src = this.currentSrc || this.src || '';
          if (src.includes('notification')) {
            if (this.volume === 0) w.__kh.silentPlays += 1;
            else w.__kh.audiblePlays += 1;
          }
        } catch {
          // Instrumentation must never break playback.
        }
        return originalPlay.call(this);
      };

      const OriginalAudio = window.Audio;
      window.Audio = function (this: unknown, ...args: unknown[]) {
        w.__kh.audioCreated += 1;
        return new (OriginalAudio as unknown as new (...a: unknown[]) => HTMLAudioElement)(
          ...args
        );
      } as unknown as typeof Audio;
      window.Audio.prototype = OriginalAudio.prototype;

      const w2 = window as unknown as Record<string, unknown>;
      for (const name of ['AudioContext', 'webkitAudioContext']) {
        const OriginalCtx = w2[name];
        if (typeof OriginalCtx !== 'function') continue;
        const Counted = function (this: unknown, ...args: unknown[]) {
          w.__kh.contextCreated += 1;
          return new (OriginalCtx as new (...a: unknown[]) => unknown)(...args);
        };
        Counted.prototype = (OriginalCtx as { prototype: unknown }).prototype;
        w2[name] = Counted;
      }
    });

    // An OLD notification from a previous session (as if the tab was
    // refreshed), with sound enabled. Persisted shape is exactly the
    // store's partialize: { notifications, soundEnabled } (version 0).
    await seedStorage(page, {
      [NOTIFICATIONS_KEY]: {
        version: 0,
        state: {
          notifications: [
            {
              id: 'e2e-old-notification',
              userId: 'e2e-user',
              type: 'booking_confirmed',
              title: 'Booking Confirmed',
              message: 'Your court booking is confirmed.',
              isRead: false,
              createdAt: new Date(Date.now() - 3_600_000).toISOString(),
            },
          ],
          soundEnabled: true,
        },
      },
    });

    // Public page — no auth wall; exercises the same HydrationProvider +
    // notification store + sound pipeline as any in-app page.
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Let hydration + the initial notification fetch settle.
    await page.waitForTimeout(6_000);

    // Refresh behaviour: old notifications must NOT play — audible or even
    // silently (initial fetch/refetches are gated out of the sound queue).
    const beforeGesture = await page.evaluate(() => {
      const k = (window as unknown as { __kh?: Record<string, number> }).__kh;
      return {
        silentPlays: k?.silentPlays ?? -1,
        audiblePlays: k?.audiblePlays ?? -1,
        contextCreated: k?.contextCreated ?? -1,
      };
    });
    expect(beforeGesture.silentPlays).toBe(0);
    expect(beforeGesture.audiblePlays).toBe(0);

    // First user gesture unlocks audio: AudioContext construction/resume
    // + an INAUDIBLE warm-up (volume 0) — never an audible old sound.
    await page.keyboard.press('Tab');
    await page.waitForTimeout(2_000);

    const afterGesture = await page.evaluate(() => {
      const k = (window as unknown as { __kh?: Record<string, number> }).__kh;
      return {
        silentPlays: k?.silentPlays ?? -1,
        audiblePlays: k?.audiblePlays ?? -1,
        contextCreated: k?.contextCreated ?? -1,
      };
    });
    expect(afterGesture.silentPlays).toBeGreaterThanOrEqual(1);
    expect(afterGesture.audiblePlays).toBe(0);
    expect(afterGesture.contextCreated).toBeGreaterThan(beforeGesture.contextCreated);

    // The notification sound asset is reachable (relative path, audio MIME).
    const wavResponse = await page.request.get(`${BASE_URL}/notification.wav`);
    expect(wavResponse.status()).toBe(200);
    expect(wavResponse.headers()['content-type']).toContain('audio');

    expect(errors).toEqual([]);
  });
});

test.describe('theme preservation', () => {
  test('dark mode set by the user stays dark on the payment page', async ({ page }) => {
    test.setTimeout(120_000);

    // Only seed when absent, so a later programmatic switch to 'light'
    // survives the reload.
    await page.addInitScript(
      ([key]) => {
        if (!window.localStorage.getItem(key)) {
          window.localStorage.setItem(key, 'dark');
        }
      },
      [THEME_KEY] as [string]
    );

    await page.goto(`${BASE_URL}/book/payment`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 30_000 });

    // ...and light stays light.
    await page.evaluate((key) => window.localStorage.setItem(key, 'light'), THEME_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).not.toHaveClass(/dark/, { timeout: 30_000 });
  });
});
