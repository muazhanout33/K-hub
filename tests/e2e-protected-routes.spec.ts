import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const BASE = 'http://localhost:3000';

const AUTH_USER_PROTECTED = {
  id: 'user-e2e-protected',
  email: 'protected@test.com',
  user_metadata: {
    full_name: 'Protected Tester',
    phone_number: '+201234567890',
  },
  created_at: '2024-01-01T00:00:00Z',
};

const AUTH_PROFILE_PROTECTED = {
  id: 'user-e2e-protected',
  full_name: 'Protected Tester',
  phone_number: '+201234567890',
  email: 'protected@test.com',
  role: 'Member',
  avatar_url: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const SB_COOKIE_KEY = 'sb-bwwifvuerhxgjeoochnp-auth-token';

function buildSessionCookie(): string {
  const session = {
    access_token: 'fake-access-token-e2e-protected',
    refresh_token: 'fake-refresh-token-e2e-protected',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 9999999999,
    user: AUTH_USER_PROTECTED,
  };
  const encoded = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `base64-${encoded}`;
}

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
        body: JSON.stringify(AUTH_USER_PROTECTED),
      });
    }

    if (url.includes('/rest/v1/profiles')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([AUTH_PROFILE_PROTECTED]),
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

async function seedAuth(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem(
      'khub-auth-storage',
      JSON.stringify({
        state: {
          user: {
            id: 'user-e2e-protected',
            name: 'Protected Tester',
            email: 'protected@test.com',
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

test.describe('Protected Routes — E2E', () => {
  test('unauthenticated /bookings redirects to login', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForURL('**/auth/login', { timeout: 15000 });

    const url = page.url();
    expect(url).toContain('/auth/login');
    expect(url).not.toContain('/bookings');
  });

  test('unauthenticated /notifications redirects to login', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForURL('**/auth/login', { timeout: 15000 });

    const url = page.url();
    expect(url).toContain('/auth/login');
    expect(url).not.toContain('/notifications');
  });

  test('unauthenticated /admin redirects to login', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForURL('**/auth/login', { timeout: 15000 });

    const url = page.url();
    expect(url).toContain('/auth/login');
    expect(url).not.toContain('/admin');
  });

  test('authenticated user sees bookings page content', async ({ page, context }) => {
    await seedAuth(context);
    await mockSupabaseAuth(page);

    await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const url = page.url();
    expect(url).toContain('/bookings');
    expect(url).not.toContain('/auth/login');
  });

  test('protected routes do not expose server errors', async ({ page }) => {
    await mockSupabaseNoAuth(page);
    const routes = ['/bookings', '/notifications', '/admin'];

    for (const route of routes) {
      const response = await page.goto(`${BASE}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      const status = response?.status() ?? 0;
      expect(status).toBeLessThan(500);
    }
  });
});
