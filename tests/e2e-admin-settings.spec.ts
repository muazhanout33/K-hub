import { test, expect, type Page } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD!;
const USER_A_EMAIL = process.env.TEST_USER_A_EMAIL!;
const USER_A_PASSWORD = process.env.TEST_USER_A_PASSWORD!;

/** Login without assuming the post-login landing URL (that varies with `next`). */
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

/** Navigate to /admin/settings and wait until the settings UI has rendered. */
async function openSettings(page: Page) {
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('settings-section-booking')).toBeVisible({
    timeout: 30000,
  });
}

/** Counts server-action POSTs issued to the settings page (no DB writes in this suite). */
function trackActionPosts(page: Page): { count: () => number } {
  let n = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/admin/settings') {
      n += 1;
    }
  });
  return { count: () => n };
}

test.describe('Admin Settings (Phase 5)', () => {
  // The app ships a strict production CSP (next.config.ts) that restricts
  // `connect-src` to `*.supabase.co`. This suite runs the browser against the
  // LOCAL Supabase stack (`http://127.0.0.1:54321`), which the browser would
  // otherwise block before any auth request leaves the page. Bypass CSP in the
  // test browser context only — the application's CSP is never weakened.
  test.use({ bypassCSP: true });

  test('anonymous visit → redirected to the login page, no settings content', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });

    // Server-side admin layout guard fails closed for signed-out visitors.
    await page.waitForURL((u) => u.pathname === '/auth/login', { timeout: 30000 });
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('settings-section-booking')).toHaveCount(0);
    await expect(page.getByTestId('settings-empty-banner')).toHaveCount(0);
  });

  test('non-admin user → redirected away from /admin/settings', async ({ page }) => {
    test.setTimeout(120_000);
    await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

    await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => u.pathname === '/', { timeout: 30000 });
    await expect(page.getByTestId('settings-section-booking')).toHaveCount(0);
    await expect(page.getByTestId('settings-section-notifications')).toHaveCount(0);
  });

  test('admin: four sections render with info banner, page title, and active nav state', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openSettings(page);

    for (const id of ['booking', 'club', 'system', 'notifications']) {
      await expect(page.getByTestId(`settings-section-${id}`)).toBeVisible();
    }

    // Stored-only explanation banner (settings are not wired into live flows).
    await expect(page.locator('[role="note"]')).toContainText('not yet enforced');

    // Header title branch + active navigation state.
    await expect(page.locator('header h2')).toHaveText('Settings');
    await expect(
      page.locator('nav[aria-label="Admin navigation"] a[href="/admin/settings"]')
    ).toHaveAttribute('aria-current', 'page');

    // Every DB-backed field is labelled as stored-only; clean form → Save disabled.
    await expect(page.getByText('Stored only').first()).toBeVisible();
    await expect(page.getByTestId('settings-save-booking')).toBeDisabled();
    await expect(page.getByTestId('settings-save-club')).toBeDisabled();
    await expect(page.getByTestId('settings-save-system')).toBeDisabled();
  });

  test('invalid value is rejected client-side with a field error — no server call', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openSettings(page);

    // Attach after initial load so the mount-time getSettingsAction isn't counted.
    const posts = trackActionPosts(page);

    const input = page.getByTestId('setting-input-booking.cancellation_window_hours');
    await input.fill('-5');
    // The controlled input keeps the entered text; validation is deferred to Save.
    await expect(input).toHaveValue('-5');

    await page.getByTestId('settings-save-booking').click();

    // Field-level validation surfaces immediately on Save; save never reaches
    // the server. `aria-invalid` is set by handleSave alongside the field error.
    const section = page.getByTestId('settings-section-booking');
    await expect(section.getByRole('alert').first()).toContainText(
      'Must be at least 0 hours.'
    );
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('settings-save-error')).toHaveCount(0);

    await page.waitForTimeout(500);
    expect(posts.count()).toBe(0);
  });

  test('notification sound toggle persists across reload; test sound does not crash', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const pageErrors: Error[] = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openSettings(page);

    const toggle = page.getByTestId('notification-sound-toggle');
    // Fresh profile → store default is sound ON.
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Persistence after reload (Zustand persist → localStorage).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('settings-section-notifications')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('notification-sound-toggle')).toHaveAttribute(
      'aria-checked',
      'false'
    );

    // Preview button plays through the shared audio service, which must never throw.
    await page.getByTestId('test-sound-button').click();
    await page.waitForTimeout(500);
    expect(pageErrors).toHaveLength(0);
  });

  test('responsive: no horizontal overflow at 320/375/768/1024/1440', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openSettings(page);

    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250); // allow layout reflow

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
        clientWidth + 1
      );

      // Content stays reachable at every width.
      await expect(page.getByTestId('settings-section-booking')).toBeVisible();
      await expect(page.getByTestId('settings-section-notifications')).toBeVisible();
    }

    // Desktop width: the admin sidebar (and its active Settings link) is visible.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(
      page.locator('nav[aria-label="Admin navigation"] a[href="/admin/settings"]')
    ).toBeVisible();
  });

  test('public mobile drawer: Profile → /profile, Contact link preserved', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Any signed-in user exposes the Profile entry in the public drawer.
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Open navigation menu' }).click();

    const drawer = page.getByRole('dialog', { name: 'Navigation menu' });
    await expect(drawer).toBeVisible();

    // Unrelated public navigation is preserved.
    await expect(drawer.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      '/contact'
    );

    // Profile entry routes to /profile and renders the profile page.
    await drawer.getByRole('link', { name: 'Profile' }).click();
    await page.waitForURL((u) => u.pathname === '/profile', { timeout: 30000 });
    await expect(page.locator('h1', { hasText: 'My Profile' })).toBeVisible({
      timeout: 30000,
    });
  });
});
