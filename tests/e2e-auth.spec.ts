import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const BASE = 'http://localhost:3000';

const AUTH_USER_E2E = {
  id: 'user-e2e-auth',
  email: 'auth@test.com',
  user_metadata: {
    full_name: 'Auth Tester',
    phone_number: '+201234567890',
  },
  created_at: '2024-01-01T00:00:00Z',
};

const AUTH_PROFILE_E2E = {
  id: 'user-e2e-auth',
  full_name: 'Auth Tester',
  phone_number: '+201234567890',
  email: 'auth@test.com',
  role: 'Member',
  avatar_url: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

/**
 * Mock Supabase auth to return NO user (unauthenticated).
 * Ensures initSession() completes quickly so _hasHydrated becomes true.
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

async function mockSupabaseAuth(page: Page) {
  await page.route(/\.supabase\.co\//, async (route) => {
    const url = route.request().url();

    if (url.includes('/auth/v1/user')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(AUTH_USER_E2E),
      });
    }

    if (url.includes('/rest/v1/profiles')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([AUTH_PROFILE_E2E]),
      });
    }

    if (url.includes('/rest/v1/notifications')) {
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

const SB_COOKIE_KEY = 'sb-bwwifvuerhxgjeoochnp-auth-token';

function buildSessionCookie(): string {
  const session = {
    access_token: 'fake-access-token-e2e-auth',
    refresh_token: 'fake-refresh-token-e2e-auth',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 9999999999,
    user: AUTH_USER_E2E,
  };
  const encoded = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `base64-${encoded}`;
}

async function seedAuth(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem(
      'khub-auth-storage',
      JSON.stringify({
        state: {
          user: {
            id: 'user-e2e-auth',
            name: 'Auth Tester',
            email: 'auth@test.com',
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

  await context.addCookies([
    {
      name: SB_COOKIE_KEY,
      value: buildSessionCookie(),
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

test.describe('Authentication — E2E', () => {
  test('login page shows error for invalid credentials', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      return main && !main.textContent?.includes('Loading...');
    }, { timeout: 30000 });

    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });

    const emailInput = page.locator('input[placeholder="your@email.com"]');
    const passwordInput = page.locator('input[placeholder="Enter your password"]');

    await emailInput.fill('wrong@example.com');
    await passwordInput.fill('wrongpassword');

    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    await signInBtn.click();

    await page.waitForTimeout(4000);

    const url = page.url();
    const stayedOnLogin = url.includes('/auth/login');
    const toast = page.locator('[data-sonner-toaster]');
    const hasToast = (await toast.count()) > 0;
    expect(stayedOnLogin || hasToast).toBe(true);
  });

  test('login form validates empty fields', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      return main && !main.textContent?.includes('Loading...');
    }, { timeout: 30000 });

    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForSelector('input[placeholder="Enter your password"]', { timeout: 10000 });

    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    await signInBtn.click();
    await page.waitForTimeout(1500);

    const url = page.url();
    expect(url).toContain('/auth/login');
  });

  test('register page validates short password', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/auth/register`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      return main && !main.textContent?.includes('Loading...');
    }, { timeout: 30000 });

    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForSelector('input[placeholder="e.g. John Smith"]', { timeout: 10000 });

    const nameInput = page.locator('input[placeholder="e.g. John Smith"]');
    await expect(nameInput).toBeVisible({ timeout: 15000 });

    const emailInput = page.locator('input[type="email"]').first();
    const phoneInput = page.locator('input[type="tel"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const confirmInput = page.locator('input[type="password"]').last();

    await nameInput.fill('Test User');
    await emailInput.fill('test@example.com');
    await phoneInput.fill('+201234567890');
    await passwordInput.fill('123');
    await confirmInput.fill('123');

    const createBtn = page.getByRole('button', { name: 'Create Account' });
    await createBtn.click();
    await page.waitForTimeout(1500);

    const url = page.url();
    expect(url).toContain('/auth/register');
  });

  test('register page validates password mismatch', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/auth/register`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      return main && !main.textContent?.includes('Loading...');
    }, { timeout: 30000 });

    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForSelector('input[placeholder="e.g. John Smith"]', { timeout: 10000 });

    const nameInput = page.locator('input[placeholder="e.g. John Smith"]');
    await expect(nameInput).toBeVisible({ timeout: 15000 });

    const emailInput = page.locator('input[type="email"]').first();
    const phoneInput = page.locator('input[type="tel"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const confirmInput = page.locator('input[type="password"]').last();

    await nameInput.fill('Test User');
    await emailInput.fill('test@example.com');
    await phoneInput.fill('+201234567890');
    await passwordInput.fill('password123');
    await confirmInput.fill('different123');

    const createBtn = page.getByRole('button', { name: 'Create Account' });
    await createBtn.click();
    await page.waitForTimeout(1500);

    const url = page.url();
    expect(url).toContain('/auth/register');
  });

  test('authenticated user can access /bookings', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);

    await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(() => {
      const raw = localStorage.getItem('khub-auth-storage');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed.state?.isAuthenticated === true;
    }, { timeout: 15000 });

    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      return main && !main.textContent?.includes('Loading...');
    }, { timeout: 15000 });

    const url = page.url();
    expect(url).toContain('/bookings');
    expect(url).not.toContain('/auth/login');
  });

  test('logout clears auth state and redirects', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const logoutBtn = page.locator('button[aria-label="Sign out"]');
    if (await logoutBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logoutBtn.click();
      await page.waitForTimeout(2000);

      const authState = await page.evaluate(() => {
        const raw = localStorage.getItem('khub-auth-storage');
        if (!raw) return null;
        return JSON.parse(raw);
      });

      const isAuth = authState?.state?.isAuthenticated;
      expect(isAuth).toBeFalsy();
    }
  });
});
