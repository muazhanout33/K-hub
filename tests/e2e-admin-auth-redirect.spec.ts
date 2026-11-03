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
  // Preserve a caller-set login URL (e.g. /auth/login?next=...) — only navigate if needed.
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

function trackNavigations(page: Page, sink: string[]) {
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) sink.push(frame.url());
  });
}

function paths(navs: string[]): string[] {
  return navs.map((u) => {
    try {
      return new URL(u).pathname;
    } catch {
      return u;
    }
  });
}

test.describe('Admin auth redirect fixes (Phase 1 follow-up)', () => {
  test('valid server session + empty localStorage → /admin renders, no login bounce', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Simulate "logged in on another origin (e.g. :3000)": cookie valid, storage empty
    await page.evaluate(() => localStorage.clear());

    const navs: string[] = [];
    trackNavigations(page, navs);

    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin$/, { timeout: 30000 });
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible({
      timeout: 30000,
    });

    const seen = paths(navs);
    expect(seen).not.toContain('/book');
    expect(seen).not.toContain('/auth/login');
  });

  test('stale localStorage user + no valid session → login page, never /book, no loop', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await context.addInitScript(() => {
      localStorage.setItem(
        'khub-auth-storage',
        JSON.stringify({
          state: {
            user: {
              id: 'stale-user-id',
              name: 'Stale Admin',
              email: 'stale@example.com',
              phone: '+201000000000',
              role: 'Admin',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            isAuthenticated: true,
          },
          version: 0,
        })
      );
    });
    await context.clearCookies();

    const navs: string[] = [];
    trackNavigations(page, navs);

    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.pathname === '/auth/login', { timeout: 30000 });

    // No false authentication: the real login form must render
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('h1:has-text("Sign In to WEGO")')).toBeVisible();

    // No redirect loop to /book
    await page.waitForTimeout(3000);
    expect(new URL(page.url()).pathname).toBe('/auth/login');
    expect(paths(navs)).not.toContain('/book');
  });

  test('non-admin user → denied, never reaches admin content', async ({ page }) => {
    test.setTimeout(120_000);
    await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

    const navs: string[] = [];
    trackNavigations(page, navs);

    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(`${BASE}/`, { timeout: 30000 });

    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toHaveCount(0);
    expect(paths(navs)).not.toContain('/admin');
  });

  test('login with next=/admin → returns to /admin', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/auth/login?next=%2Fadmin`, { waitUntil: 'domcontentloaded' });
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.waitForFunction(
      () => window.location.pathname === '/admin',
      undefined,
      { timeout: 30000 }
    );
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible({
      timeout: 30000,
    });
  });

  test('unsafe next value for regular user → rejected, falls back to /book', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(
      `${BASE}/auth/login?next=${encodeURIComponent('https://evil.com')}`,
      { waitUntil: 'domcontentloaded' }
    );
    await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

    await page.waitForFunction(
      () => window.location.pathname === '/book',
      undefined,
      { timeout: 30000 }
    );
    expect(page.url()).not.toContain('evil.com');
    expect(new URL(page.url()).pathname).toBe('/book');
  });

  test('unsafe next value for admin → rejected, falls back to /admin', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(
      `${BASE}/auth/login?next=${encodeURIComponent('https://evil.com')}`,
      { waitUntil: 'domcontentloaded' }
    );
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.waitForFunction(
      () => window.location.pathname === '/admin',
      undefined,
      { timeout: 30000 }
    );
    expect(page.url()).not.toContain('evil.com');
    expect(new URL(page.url()).pathname).toBe('/admin');
  });

  test('ordinary login without next for regular user → lands on /book', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
    await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

    await page.waitForFunction(
      () => window.location.pathname === '/book',
      undefined,
      { timeout: 30000 }
    );
    expect(new URL(page.url()).pathname).toBe('/book');
  });

  test('ordinary login without next for Admin → lands on /admin, never /book', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const navs: string[] = [];
    trackNavigations(page, navs);

    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.waitForFunction(
      () => window.location.pathname === '/admin',
      undefined,
      { timeout: 30000 }
    );
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible({
      timeout: 30000,
    });
    expect(paths(navs)).not.toContain('/book');
  });

  test('admin signed in on public website navigates to /admin → stays on /admin after refresh', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Sign in as Admin on public site
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
    await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const navs: string[] = [];
    trackNavigations(page, navs);

    // Navigate directly to /admin
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin$/, { timeout: 30000 });
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible({
      timeout: 30000,
    });

    // Refresh at /admin
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin$/, { timeout: 30000 });
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible({
      timeout: 30000,
    });

    const seen = paths(navs);
    expect(seen).not.toContain('/book');
    expect(seen).not.toContain('/auth/login');
  });
});
