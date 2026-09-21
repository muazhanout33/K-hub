/**
 * Phase 22.15 — Real Authentication E2E
 *
 * ALL tests are REAL — no mocked Supabase, no mocked Auth, no mocked sessions,
 * no fake JWTs, no fake users, no service-role simulation.
 *
 * Every test exercises:
 *   Real Browser → Real K-HUB App → Real Supabase Auth → Real PostgreSQL + RLS
 *
 * Execution layer: REAL BROWSER + REAL APP + REAL SUPABASE AUTH + REAL DB
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// ─── Environment variables (never hardcode passwords) ────────────────────────
const USER_A_EMAIL = process.env.TEST_USER_A_EMAIL!;
const USER_A_PASSWORD = process.env.TEST_USER_A_PASSWORD!;
const USER_B_EMAIL = process.env.TEST_USER_B_EMAIL!;
const USER_B_PASSWORD = process.env.TEST_USER_B_PASSWORD!;
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD!;

// Fail fast if credentials are missing
for (const [key, val] of Object.entries({
  TEST_USER_A_EMAIL: USER_A_EMAIL,
  TEST_USER_A_PASSWORD: USER_A_PASSWORD,
  TEST_USER_B_EMAIL: USER_B_EMAIL,
  TEST_USER_B_PASSWORD: USER_B_PASSWORD,
  TEST_ADMIN_EMAIL: ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD: ADMIN_PASSWORD,
})) {
  if (!val) {
    throw new Error(`Missing required env var: ${key}. Ensure .env.local is configured.`);
  }
}

const BASE = 'http://localhost:3000';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Perform a real login through the K-HUB login UI.
 * No mocking. Real form submission. Real Supabase Auth.
 */
async function realLogin(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });

  // Wait for hydration + guest guard to settle
  await page.waitForFunction(() => {
    const main = document.querySelector('main');
    return main && !main.textContent?.includes('Loading...');
  }, { timeout: 30000 });

  await page.waitForSelector('input[type="password"]', { timeout: 15000 });

  await page.locator('input[placeholder="your@email.com"]').fill(email);
  await page.locator('input[placeholder="Enter your password"]').fill(password);

  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for real Supabase Auth to complete and redirect to /book
  await page.waitForURL('**/book', { timeout: 30000 });
}

/**
 * Wait for the Zustand auth store to be hydrated and session initialized.
 */
async function waitForAuthHydration(page: Page) {
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('khub-auth-storage');
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return parsed.state?.isAuthenticated === true && parsed.state?.user != null;
    } catch {
      return false;
    }
  }, { timeout: 30000 });
}

/**
 * Get the current auth state from localStorage.
 */
async function getAuthState(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('khub-auth-storage');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed.state;
    } catch {
      return null;
    }
  });
}

/**
 * Check if a Supabase session cookie exists.
 */
async function hasSessionCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
}

// ─── Responsive helpers ──────────────────────────────────────────────────────

/**
 * Detect if the current viewport is mobile (< 1280px = below xl breakpoint).
 */
async function isMobileViewport(page: Page): Promise<boolean> {
  return page.evaluate(() => window.innerWidth < 1280);
}

/**
 * Open the mobile hamburger menu (only exists on mobile viewports).
 */
async function openMobileMenu(page: Page) {
  const hamburger = page.locator('button[aria-label="Toggle menu"]');
  await hamburger.click();
  // Wait for the mobile drawer to appear
  await page.waitForSelector('.xl\\:hidden.fixed.inset-0.z-40', { timeout: 5000 });
}

/**
 * Close the mobile hamburger menu.
 */
async function closeMobileMenu(page: Page) {
  // Click the backdrop or X button inside the drawer
  const drawer = page.locator('.xl\\:hidden.fixed.inset-0.z-40');
  if (await drawer.isVisible().catch(() => false)) {
    // Click the backdrop (first child overlay)
    await drawer.locator('div').first().click({ force: true });
    await page.waitForTimeout(300);
  }
}

/**
 * Perform logout on mobile: open hamburger menu → click "Sign Out" button.
 */
async function clickMobileSignOut(page: Page) {
  await openMobileMenu(page);
  // The mobile Sign Out is a plain button with text "Sign Out" inside the drawer
  const signOutBtn = page.locator('.xl\\:hidden.fixed.inset-0.z-40 button:has-text("Sign Out")');
  await signOutBtn.click();
}

/**
 * Verify that the mobile drawer shows the Admin link.
 */
async function verifyMobileAdminLink(page: Page) {
  await openMobileMenu(page);
  const adminLink = page.locator('.xl\\:hidden.fixed.inset-0.z-40 a:has-text("Admin")');
  await expect(adminLink).toBeVisible({ timeout: 10000 });
  await closeMobileMenu(page);
}

/**
 * Assert authentication indicator — responsive-aware.
 *
 * Desktop: checks for the desktop Sign out button (aria-label="Sign out").
 * Mobile: checks for the user profile avatar button (aria-label="My profile"),
 *         which is visible on both viewports.
 */
async function expectAuthenticatedIndicator(page: Page) {
  const mobile = await isMobileViewport(page);
  if (mobile) {
    // On mobile, the profile avatar button is visible in the top bar
    const profileBtn = page.locator('button[aria-label="My profile"]');
    await expect(profileBtn).toBeVisible({ timeout: 10000 });
  } else {
    // On desktop, the Sign out button is visible
    const signOutBtn = page.locator('button[aria-label="Sign out"]');
    await expect(signOutBtn).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Logout — responsive-aware.
 *
 * Desktop: clicks the desktop Sign out button directly.
 * Mobile: opens hamburger menu, then clicks "Sign Out" in the drawer.
 */
async function responsiveLogout(page: Page) {
  const mobile = await isMobileViewport(page);
  if (mobile) {
    await clickMobileSignOut(page);
  } else {
    const signOutBtn = page.locator('button[aria-label="Sign out"]');
    await expect(signOutBtn).toBeVisible({ timeout: 10000 });
    await signOutBtn.click();
  }
}

/**
 * Assert admin link visible — responsive-aware.
 *
 * Desktop: checks for the desktop nav Admin link.
 * Mobile: opens hamburger, checks for Admin link in drawer.
 */
async function expectAdminLinkVisible(page: Page) {
  const mobile = await isMobileViewport(page);
  if (mobile) {
    await verifyMobileAdminLink(page);
  } else {
    const adminLink = page.locator('nav a:has-text("Admin")');
    await expect(adminLink).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Assert admin link NOT present — responsive-aware.
 *
 * Desktop: checks that no Admin link exists in nav.
 * Mobile: opens hamburger, checks no Admin link in drawer.
 */
async function expectAdminLinkAbsent(page: Page) {
  const mobile = await isMobileViewport(page);
  if (mobile) {
    await openMobileMenu(page);
    const adminLink = page.locator('.xl\\:hidden.fixed.inset-0.z-40 a:has-text("Admin")');
    await expect(adminLink).toHaveCount(0);
    await closeMobileMenu(page);
  } else {
    const adminLink = page.locator('nav a:has-text("Admin")');
    await expect(adminLink).toHaveCount(0);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Phase 22.15 — Real Authentication E2E', () => {
  // ─── 1. REAL LOGIN E2E ────────────────────────────────────────────────────

  test.describe('1. Real Login E2E', () => {
    test('TEST_USER_A: real login succeeds, session established, correct identity', async ({
      page,
      context,
    }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Verify redirected to /book
      expect(page.url()).toContain('/book');

      // Wait for hydration
      await waitForAuthHydration(page);

      // Verify Zustand auth state
      const authState = await getAuthState(page);
      expect(authState?.isAuthenticated).toBe(true);
      expect(authState?.user).toBeTruthy();
      expect(authState?.user?.email).toBe(USER_A_EMAIL);
      expect(authState?.user?.role).toBe('User');

      // Verify Supabase session cookie exists
      const hasCookie = await hasSessionCookie(context);
      expect(hasCookie).toBe(true);

      // Verify navbar shows authenticated state (responsive-aware)
      await expectAuthenticatedIndicator(page);
    });

    test('TEST_USER_B: real login succeeds, correct identity', async ({ page, context }) => {
      await realLogin(page, USER_B_EMAIL, USER_B_PASSWORD);

      expect(page.url()).toContain('/book');
      await waitForAuthHydration(page);

      const authState = await getAuthState(page);
      expect(authState?.isAuthenticated).toBe(true);
      expect(authState?.user?.email).toBe(USER_B_EMAIL);
      expect(authState?.user?.role).toBe('User');

      const hasCookie = await hasSessionCookie(context);
      expect(hasCookie).toBe(true);
    });

    test('TEST_ADMIN: real login succeeds, correct identity, Admin role', async ({
      page,
      context,
    }) => {
      await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

      expect(page.url()).toContain('/book');
      await waitForAuthHydration(page);

      const authState = await getAuthState(page);
      expect(authState?.isAuthenticated).toBe(true);
      expect(authState?.user?.email).toBe(ADMIN_EMAIL);
      expect(authState?.user?.role).toBe('Admin');

      const hasCookie = await hasSessionCookie(context);
      expect(hasCookie).toBe(true);

      // Verify Admin nav link is visible (responsive-aware)
      await expectAdminLinkVisible(page);
    });
  });

  // ─── 2. INVALID LOGIN ─────────────────────────────────────────────────────

  test.describe('2. Invalid Login', () => {
    test('invalid credentials: auth fails, stays on login, no session created', async ({
      page,
      context,
    }) => {
      await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });

      await page.waitForFunction(() => {
        const main = document.querySelector('main');
        return main && !main.textContent?.includes('Loading...');
      }, { timeout: 30000 });

      await page.waitForSelector('input[type="password"]', { timeout: 15000 });

      await page.locator('input[placeholder="your@email.com"]').fill('nonexistent@test.com');
      await page.locator('input[placeholder="Enter your password"]').fill('wrongpassword123');

      await page.getByRole('button', { name: 'Sign In' }).click();

      // Wait for error response
      await page.waitForTimeout(5000);

      // Should stay on login page
      expect(page.url()).toContain('/auth/login');

      // No session cookie should be set
      const hasCookie = await hasSessionCookie(context);
      expect(hasCookie).toBe(false);

      // Zustand should not be authenticated
      const authState = await getAuthState(page);
      expect(authState?.isAuthenticated).toBeFalsy();
    });

    test('empty fields: form does not submit', async ({ page }) => {
      await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });

      await page.waitForFunction(() => {
        const main = document.querySelector('main');
        return main && !main.textContent?.includes('Loading...');
      }, { timeout: 30000 });

      await page.waitForSelector('input[type="password"]', { timeout: 15000 });

      // Click Sign In without filling fields
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForTimeout(2000);

      // Should stay on login page
      expect(page.url()).toContain('/auth/login');
    });
  });

  // ─── 3. SESSION PERSISTENCE ────────────────────────────────────────────────

  test.describe('3. Session Persistence', () => {
    test('session persists after page reload', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Verify authenticated
      let authState = await getAuthState(page);
      expect(authState?.isAuthenticated).toBe(true);
      const userId = authState?.user?.id;

      // Reload the page
      await page.reload({ waitUntil: 'domcontentloaded' });

      // Wait for hydration
      await waitForAuthHydration(page);

      // Verify still authenticated with same user
      authState = await getAuthState(page);
      expect(authState?.isAuthenticated).toBe(true);
      expect(authState?.user?.id).toBe(userId);
      expect(authState?.user?.email).toBe(USER_A_EMAIL);

      // Should NOT redirect to login
      expect(page.url()).not.toContain('/auth/login');
    });

    test('session persists across navigation between protected pages', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Navigate to profile
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);
      expect(page.url()).toContain('/profile');

      const authState = await getAuthState(page);
      expect(authState?.isAuthenticated).toBe(true);
      expect(authState?.user?.email).toBe(USER_A_EMAIL);

      // Navigate to bookings
      await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);
      expect(page.url()).toContain('/bookings');

      // Navigate to notifications
      await page.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);
      expect(page.url()).toContain('/notifications');
    });

    test('session persists in new browser context (cookie-based)', async ({
      page,
      context,
    }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Get the session cookie
      const cookies = await context.cookies();
      const sessionCookie = cookies.find(
        (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
      );
      expect(sessionCookie).toBeTruthy();

      // Create a new page in the same context (shares cookies)
      const newPage = await context.newPage();
      await newPage.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });

      // Wait for hydration — should be authenticated via cookie
      await waitForAuthHydration(newPage);

      const authState = await getAuthState(newPage);
      expect(authState?.isAuthenticated).toBe(true);
      expect(authState?.user?.email).toBe(USER_A_EMAIL);
    });
  });

  // ─── 4. LOGOUT ────────────────────────────────────────────────────────────

  test.describe('4. Logout', () => {
    test('logout invalidates session, clears auth state, redirects', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Verify authenticated
      let authState = await getAuthState(page);
      expect(authState?.isAuthenticated).toBe(true);

      // Click the Sign out button (responsive-aware)
      await responsiveLogout(page);

      // Wait for logout to complete and redirect
      await page.waitForTimeout(3000);

      // Verify auth state is cleared
      authState = await getAuthState(page);
      expect(authState?.isAuthenticated).toBeFalsy();
      expect(authState?.user).toBeFalsy();

      // Verify the Supabase session cookie is removed/expired
      const hasCookie = await hasSessionCookie(page.context());
      expect(hasCookie).toBe(false);
    });

    test('after logout, protected routes redirect to login', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Logout (responsive-aware)
      await responsiveLogout(page);
      await page.waitForTimeout(3000);

      // Attempt to access protected route
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });

      // Wait for hydration and guard redirect
      await page.waitForTimeout(5000);

      // Should redirect to login
      expect(page.url()).toContain('/auth/login');
    });

    test('after logout, protected data is not accessible', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Logout (responsive-aware)
      await responsiveLogout(page);
      await page.waitForTimeout(3000);

      // Attempt to access bookings
      await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);

      // Should redirect to login, not show bookings
      expect(page.url()).toContain('/auth/login');
    });
  });

  // ─── 5. PROTECTED ROUTES ──────────────────────────────────────────────────

  test.describe('5. Protected Routes', () => {
    test('unauthenticated: /profile redirects to login', async ({ page }) => {
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      expect(page.url()).toContain('/auth/login');
    });

    test('unauthenticated: /bookings redirects to login', async ({ page }) => {
      await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      expect(page.url()).toContain('/auth/login');
    });

    test('unauthenticated: /notifications redirects to login', async ({ page }) => {
      await page.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      expect(page.url()).toContain('/auth/login');
    });

    test('unauthenticated: /admin redirects to login', async ({ page }) => {
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      expect(page.url()).toContain('/auth/login');
    });

    test('authenticated: /profile is accessible', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);
      expect(page.url()).toContain('/profile');
      expect(page.url()).not.toContain('/auth/login');
    });

    test('authenticated: /bookings is accessible', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);
      await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);
      expect(page.url()).toContain('/bookings');
      expect(page.url()).not.toContain('/auth/login');
    });

    test('authenticated: /notifications is accessible', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);
      await page.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);
      expect(page.url()).toContain('/notifications');
      expect(page.url()).not.toContain('/auth/login');
    });

    test('public routes: /, /courts, /about accessible without auth', async ({ page }) => {
      for (const route of ['/', '/courts', '/about']) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
        expect(page.url()).toContain(route);
        expect(page.url()).not.toContain('/auth/login');
      }
    });
  });

  // ─── 6. USER IDENTITY BOUNDARY ────────────────────────────────────────────

  test.describe('6. User Identity Boundary', () => {
    test('profile page shows correct email from server, not client-manipulated', async ({
      page,
    }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Navigate to profile
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);

      // The email field should show USER_A_EMAIL (disabled, read-only)
      const emailInput = page.locator('input[type="email"][disabled]');
      await expect(emailInput).toBeVisible({ timeout: 10000 });
      const emailValue = await emailInput.inputValue();
      expect(emailValue).toBe(USER_A_EMAIL);
    });

    test('client-side userId manipulation cannot change identity via admin route', async ({
      page,
    }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Verify current identity
      let authState = await getAuthState(page);
      const originalUserId = authState?.user?.id;
      expect(originalUserId).toBeTruthy();
      expect(authState?.user?.role).toBe('User');

      // Attempt to manipulate the Zustand store via localStorage to grant Admin
      await page.evaluate(() => {
        const raw = localStorage.getItem('khub-auth-storage');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed.state?.user) {
          parsed.state.user.role = 'Admin';
        }
        localStorage.setItem('khub-auth-storage', JSON.stringify(parsed));
      });

      // Navigate to admin — useAdminGuard checks role from store
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);

      // After initSession() runs, role is re-fetched from Supabase session
      // The guard should detect the real role (User) and redirect away
      const authStateAfter = await getAuthState(page);
      // The real role from Supabase should override the manipulation
      expect(authStateAfter?.user?.role).toBe('User');
      expect(authStateAfter?.user?.email).toBe(USER_A_EMAIL);
    });
  });

  // ─── 7. ROLE VERIFICATION ─────────────────────────────────────────────────

  test.describe('7. Role Verification', () => {
    test('TEST_USER_A: role = User, admin page inaccessible', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Verify role in auth state
      const authState = await getAuthState(page);
      expect(authState?.user?.role).toBe('User');

      // Admin nav link should NOT be visible
      const adminLink = page.locator('nav a:has-text("Admin")');
      await expect(adminLink).toHaveCount(0);

      // Attempt to navigate to /admin directly
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);

      // Should redirect away (to / because useAdminGuard redirects non-admins)
      expect(page.url()).not.toContain('/admin');
    });

    test('TEST_ADMIN: role = Admin, admin page accessible', async ({ page }) => {
      await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

      // Verify role in auth state
      const authState = await getAuthState(page);
      expect(authState?.user?.role).toBe('Admin');

      // Admin nav link should be visible (responsive-aware)
      await expectAdminLinkVisible(page);

      // Navigate to admin page
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);
      await page.waitForTimeout(3000);

      // Should stay on admin page
      expect(page.url()).toContain('/admin');

      // Verify admin dashboard content
      const heading = page.locator('h1:has-text("Admin Dashboard")');
      await expect(heading).toBeVisible({ timeout: 15000 });
    });

    test('client-side role manipulation cannot grant admin access', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Verify not admin
      let authState = await getAuthState(page);
      expect(authState?.user?.role).toBe('User');

      // Attempt to manipulate role in localStorage
      await page.evaluate(() => {
        const raw = localStorage.getItem('khub-auth-storage');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed.state?.user) {
          parsed.state.user.role = 'Admin';
        }
        localStorage.setItem('khub-auth-storage', JSON.stringify(parsed));
      });

      // Navigate to admin
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);

      // useAdminGuard checks role from store, but initSession re-fetches from Supabase
      // The page should either redirect or show non-admin state
      const url = page.url();
      // Admin page should redirect non-admins to /
      // After initSession runs, role is restored to 'User' from Supabase
      // So the guard should redirect to /
      const isRedirectedAway = !url.includes('/admin') || url.includes('/auth/login');
      // Even if URL still shows /admin momentarily, the content should not show admin dashboard
      const adminHeading = page.locator('h1:has-text("Admin Dashboard")');
      const hasAdminContent = await adminHeading.isVisible().catch(() => false);
      expect(isRedirectedAway || !hasAdminContent).toBe(true);
    });
  });

  // ─── 8. SESSION / COOKIE SECURITY ─────────────────────────────────────────

  test.describe('8. Session / Cookie Security', () => {
    test('session cookie exists with expected attributes', async ({ page, context }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      const cookies = await context.cookies();
      const sessionCookie = cookies.find(
        (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
      );

      // Supabase SSR cookie should exist
      expect(sessionCookie).toBeTruthy();
      // Cookie should have a reasonable expiry (not session-only)
      expect(sessionCookie!.expires).toBeGreaterThan(0);
      // Cookie should be scoped to the app's domain
      expect(sessionCookie!.domain).toContain('localhost');
    });

    test('service-role key is not exposed to browser', async ({ page }) => {
      await page.goto(`${BASE}`, { waitUntil: 'domcontentloaded' });

      // Check that SUPABASE_SERVICE_ROLE_KEY is not in any client-side JS
      const hasServiceRole = await page.evaluate(() => {
        // Check window/env for service role key exposure
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          if (script.textContent?.includes('service_role') || script.textContent?.includes('SERVICE_ROLE')) {
            return true;
          }
        }
        return false;
      });

      expect(hasServiceRole).toBe(false);
    });

    test('no passwords logged in console', async ({ page }) => {
      const consoleMessages: string[] = [];
      page.on('console', (msg) => {
        consoleMessages.push(msg.text());
      });

      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Check no password appears in console output
      for (const msg of consoleMessages) {
        expect(msg).not.toContain(USER_A_PASSWORD);
        expect(msg).not.toContain(ADMIN_PASSWORD);
        expect(msg).not.toContain(USER_B_PASSWORD);
      }
    });
  });

  // ─── 9. AUTH + PROFILE INTEGRATION ────────────────────────────────────────

  test.describe('9. Auth + Profile Integration', () => {
    test('TEST_USER_A: login → session → profile → correct ID and role', async ({ page }) => {
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);

      // Navigate to profile page
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);

      // Verify profile page shows correct data
      const emailInput = page.locator('input[type="email"][disabled]');
      await expect(emailInput).toBeVisible({ timeout: 10000 });
      expect(await emailInput.inputValue()).toBe(USER_A_EMAIL);

      // Verify role badge
      const roleBadge = page.locator('span:has-text("User")').first();
      await expect(roleBadge).toBeVisible({ timeout: 10000 });

      // Verify auth state
      const authState = await getAuthState(page);
      expect(authState?.user?.email).toBe(USER_A_EMAIL);
      expect(authState?.user?.role).toBe('User');
      expect(authState?.user?.id).toBeTruthy();
    });

    test('TEST_USER_B: login → session → profile → correct ID and role', async ({ page }) => {
      await realLogin(page, USER_B_EMAIL, USER_B_PASSWORD);

      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);

      const emailInput = page.locator('input[type="email"][disabled]');
      await expect(emailInput).toBeVisible({ timeout: 10000 });
      expect(await emailInput.inputValue()).toBe(USER_B_EMAIL);

      const authState = await getAuthState(page);
      expect(authState?.user?.email).toBe(USER_B_EMAIL);
      expect(authState?.user?.role).toBe('User');
    });

    test('TEST_ADMIN: login → session → profile → correct ID and Admin role', async ({
      page,
    }) => {
      await realLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await waitForAuthHydration(page);

      const emailInput = page.locator('input[type="email"][disabled]');
      await expect(emailInput).toBeVisible({ timeout: 10000 });
      expect(await emailInput.inputValue()).toBe(ADMIN_EMAIL);

      // Admin role badge
      const roleBadge = page.locator('span:has-text("Admin")').first();
      await expect(roleBadge).toBeVisible({ timeout: 10000 });

      const authState = await getAuthState(page);
      expect(authState?.user?.email).toBe(ADMIN_EMAIL);
      expect(authState?.user?.role).toBe('Admin');
    });

    test('user A and user B have different IDs', async ({ page, context }) => {
      // Login as User A
      await realLogin(page, USER_A_EMAIL, USER_A_PASSWORD);
      const stateA = await getAuthState(page);
      const idA = stateA?.user?.id;

      // Logout (responsive-aware)
      await responsiveLogout(page);
      await page.waitForTimeout(3000);

      // Login as User B
      await realLogin(page, USER_B_EMAIL, USER_B_PASSWORD);
      const stateB = await getAuthState(page);
      const idB = stateB?.user?.id;

      // IDs must be different
      expect(idA).toBeTruthy();
      expect(idB).toBeTruthy();
      expect(idA).not.toBe(idB);
    });
  });

  // ─── 10. SIGNUP ───────────────────────────────────────────────────────────

  test.describe('10. Signup', () => {
    test('signup page exists and has registration form', async ({ page }) => {
      await page.goto(`${BASE}/auth/register`, { waitUntil: 'domcontentloaded' });

      await page.waitForFunction(() => {
        const main = document.querySelector('main');
        return main && !main.textContent?.includes('Loading...');
      }, { timeout: 30000 });

      // Verify registration form elements exist
      await expect(page.locator('input[placeholder="e.g. John Smith"]')).toBeVisible({
        timeout: 10000,
      });
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
      await expect(page.locator('input[type="tel"]').first()).toBeVisible();
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
    });

    test('signup validates short password', async ({ page }) => {
      await page.goto(`${BASE}/auth/register`, { waitUntil: 'domcontentloaded' });

      await page.waitForFunction(() => {
        const main = document.querySelector('main');
        return main && !main.textContent?.includes('Loading...');
      }, { timeout: 30000 });

      await page.locator('input[placeholder="e.g. John Smith"]').fill('Test E2E');
      await page.locator('input[type="email"]').first().fill('shortpwd@test.com');
      await page.locator('input[type="tel"]').first().fill('+201234567890');
      await page.locator('input[type="password"]').first().fill('123');
      await page.locator('input[type="password"]').last().fill('123');

      await page.getByRole('button', { name: 'Create Account' }).click();
      await page.waitForTimeout(2000);

      // Should stay on register page
      expect(page.url()).toContain('/auth/register');
    });

    test('signup validates password mismatch', async ({ page }) => {
      await page.goto(`${BASE}/auth/register`, { waitUntil: 'domcontentloaded' });

      await page.waitForFunction(() => {
        const main = document.querySelector('main');
        return main && !main.textContent?.includes('Loading...');
      }, { timeout: 30000 });

      await page.locator('input[placeholder="e.g. John Smith"]').fill('Test E2E');
      await page.locator('input[type="email"]').first().fill('mismatch@test.com');
      await page.locator('input[type="tel"]').first().fill('+201234567890');
      await page.locator('input[type="password"]').first().fill('password123');
      await page.locator('input[type="password"]').last().fill('different456');

      await page.getByRole('button', { name: 'Create Account' }).click();
      await page.waitForTimeout(2000);

      expect(page.url()).toContain('/auth/register');
    });
  });
});
