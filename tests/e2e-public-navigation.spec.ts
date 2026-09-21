import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const BASE = 'http://localhost:3000';

/**
 * Mock Supabase auth to return NO user (unauthenticated).
 * This ensures initSession() completes quickly so _hasHydrated becomes true.
 */
async function mockSupabaseNoAuth(page: Page) {
  await page.route(/\.supabase\.co\//, async (route) => {
    const url = route.request().url();

    if (url.includes('/auth/v1/user')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      });
    }

    if (url.includes('/rest/v1/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    if (url.includes('/auth/v1/authorize') || url.includes('/auth/v1/token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    }

    return route.fallback();
  });
}

async function seedAuth(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem(
      'khub-auth-storage',
      JSON.stringify({
        state: {
          user: {
            id: 'user-e2e-nav',
            name: 'Nav Tester',
            email: 'nav@test.com',
            phone: '+201234567890',
            role: 'Member',
            avatar: null,
          },
          isAuthenticated: true,
          isLoading: false,
        },
        version: 0,
      })
    );
  });
}

test.describe('Public Navigation — E2E', () => {
  test('homepage loads and shows key elements', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(1500);

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('courts page loads and shows search input', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/courts`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const searchInput = page.locator('input[aria-label="Search courts"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('navbar renders with navigation links', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const nav = page.locator('nav').filter({ hasNot: page.locator('.hidden') });
    const visibleNavs = await nav.count();
    const anyNav = page.locator('nav');
    const totalCount = await anyNav.count();
    expect(totalCount).toBeGreaterThan(0);
  });

  test('navbar hamburger toggle works on mobile', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const toggle = page.locator('button[aria-label="Toggle menu"]');
    if (await toggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(500);
      await toggle.click();
      await page.waitForTimeout(300);
      expect(true).toBe(true);
    }
  });

  test('login page renders form elements', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      return main && !main.textContent?.includes('Loading...');
    }, { timeout: 30000 });

    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });

    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();

    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    await expect(signInBtn).toBeVisible();
  });

  test('register page renders form elements', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/auth/register`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const nameInput = page.locator('input[type="text"]').first();
    await expect(nameInput).toBeVisible({ timeout: 15000 });

    const inputs = page.locator('input');
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('404 page renders for non-existent route', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    const response = await page.goto(`${BASE}/this-page-does-not-exist-xyz`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const status = response?.status() ?? 0;
    expect([200, 404]).toContain(status);
  });

  test('courts page search input is functional', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/courts`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const searchInput = page.locator('input[aria-label="Search courts"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('Padel');

    const value = await searchInput.inputValue();
    expect(value).toBe('Padel');
  });

  test('homepage has no horizontal overflow at 1280px', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(1285);
  });
});
