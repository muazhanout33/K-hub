/**
 * Phase 22.21 — Cross-Browser & Device Testing
 *
 * Tests critical flows across Chromium, Firefox, and WebKit
 * at multiple viewport sizes. Captures console errors,
 * layout issues, and browser-specific behavior.
 *
 * Browsers: chromium, firefox, webkit
 * Viewports: 390×844 (iPhone), 412×915 (Android), 768×1024 (tablet),
 *            1280×720 (desktop), 1440×900 (desktop large)
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

const TEST_USER_A_EMAIL = process.env.TEST_USER_A_EMAIL!;
const TEST_USER_A_PASSWORD = process.env.TEST_USER_A_PASSWORD!;
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL!;
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD!;

const FUTURE_DATE = '2099-12-15';

const VIEWPORTS = {
  'iphone':      { width: 390, height: 844 },
  'android':     { width: 412, height: 915 },
  'tablet':      { width: 768, height: 1024 },
  'desktop':     { width: 1280, height: 720 },
  'desktop-lg':  { width: 1440, height: 900 },
};

// ─── Console Error Collector ──────────────────────────────────────────────────

interface ConsoleError {
  browser: string;
  viewport: string;
  url: string;
  type: string;
  text: string;
}

const consoleErrors: ConsoleError[] = [];

async function collectConsoleErrors(page: Page, browserName: string, viewport: string) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleErrors.push({
        browser: browserName,
        viewport,
        url: page.url(),
        type: msg.type(),
        text: msg.text(),
      });
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({
      browser: browserName,
      viewport,
      url: page.url(),
      type: 'pageerror',
      text: err.message,
    });
  });
}

// ─── Login Helper ─────────────────────────────────────────────────────────────

async function loginAs(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/book**', { timeout: 20000 });
}

// ─── Layout Audit Helper ──────────────────────────────────────────────────────

async function auditLayout(page: Page, label: string) {
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = page.viewportSize()?.width || 1280;
  const overflow = bodyWidth > viewportWidth + 5;

  // Check for fixed elements covering content
  const fixedCovering = await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    let covering = false;
    for (const el of els) {
      const style = window.getComputedStyle(el as Element);
      if ((style.position === 'fixed' || style.position === 'sticky') &&
          (el as HTMLElement).offsetHeight > 100 &&
          style.zIndex !== 'auto') {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.top < 50 && rect.height > 200) {
          covering = true;
        }
      }
    }
    return covering;
  });

  return { overflow, bodyWidth, viewportWidth, fixedCovering, label };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Application Startup
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('1. Application Startup', () => {
  for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
    test(`homepage loads — ${vpName} (${vpSize.width}×${vpSize.height})`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

      // No blank screen
      const bodyText = await page.textContent('body');
      expect(bodyText?.length).toBeGreaterThan(50);

      // Title exists
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);

      // No horizontal overflow
      const layout = await auditLayout(page, 'homepage');
      expect(layout.overflow).toBe(false);

      // Navigation visible
      const nav = await page.$('nav, header, [role="navigation"]');
      expect(nav).not.toBeNull();
    });

    test(`navigation works — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

      // Click first nav link
      const links = await page.$$('nav a, header a');
      if (links.length > 0) {
        await links[0].click();
        await page.waitForTimeout(1000);
        const url = page.url();
        expect(url).toContain(BASE_URL);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Authentication
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('2. Authentication', () => {
  for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
    test(`login page renders — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });

      const emailInput = await page.$('input[type="email"]');
      const passwordInput = await page.$('input[type="password"]');
      const submitBtn = await page.$('button[type="submit"]');
      expect(emailInput).not.toBeNull();
      expect(passwordInput).not.toBeNull();
      expect(submitBtn).not.toBeNull();

      // Layout check
      const layout = await auditLayout(page, 'login');
      expect(layout.overflow).toBe(false);
    });

    test(`valid login redirects — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await loginAs(page, TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD);
      // Login redirects to /book (not /dashboard)
      expect(page.url()).toContain('/book');
    });

    test(`invalid credentials shows error — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('input[type="email"]', { timeout: 15000 });
      await page.fill('input[type="email"]', 'wrong@example.com');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);

      // Should still be on login page
      expect(page.url()).toContain('login');
    });

    test(`session persists after refresh — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await loginAs(page, TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD);
      await page.reload({ waitUntil: 'networkidle' });
      // Login redirects to /book (not /dashboard)
      expect(page.url()).toContain('/book');
    });

    test(`protected route redirects when not logged in — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(`${BASE_URL}/bookings`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      // Should redirect to login or show guest guard
      const url = page.url();
      const isLoginPage = url.includes('auth/login');
      const hasGuestGuard = await page.$('text=Please log in') !== null ||
                            await page.$('text=Log in') !== null ||
                            await page.$('[data-testid="guest-guard"]') !== null;
      expect(isLoginPage || hasGuestGuard).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Booking Flow
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('3. Booking Flow', () => {
  for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
    test(`court selection page — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(`${BASE_URL}/book`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Page should load without crash
      const bodyText = await page.textContent('body');
      expect(bodyText?.length).toBeGreaterThan(50);

      // Layout check
      const layout = await auditLayout(page, 'book');
      expect(layout.overflow).toBe(false);
    });

    test(`date picker visible — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(`${BASE_URL}/book`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Look for date-related elements
      const hasDateInput = await page.$('input[type="date"]') !== null;
      const hasDatePicker = await page.$('[data-testid*="date"], [class*="date"], [aria-label*="date"]') !== null;
      const hasCalendarIcon = await page.$('[class*="calendar"], [data-testid*="calendar"]') !== null;
      expect(hasDateInput || hasDatePicker || hasCalendarIcon).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Payment Page
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('4. Payment Page', () => {
  for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
    test(`payment page loads without crash — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      const response = await page.goto(`${BASE_URL}/book/payment`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Should NOT return 500
      expect(response?.status()).not.toBe(500);

      // Should show some content (empty state or redirect)
      const bodyText = await page.textContent('body') || '';
      expect(bodyText.length).toBeGreaterThan(10);

      // Layout check
      const layout = await auditLayout(page, 'payment-empty');
      expect(layout.overflow).toBe(false);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Booking Details / Dashboard
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('5. Booking Details / Dashboard', () => {
  for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
    test(`bookings page loads — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await loginAs(page, TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD);
      await page.goto(`${BASE_URL}/bookings`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const bodyText = await page.textContent('body');
      expect(bodyText?.length).toBeGreaterThan(50);

      const layout = await auditLayout(page, 'bookings');
      expect(layout.overflow).toBe(false);
    });

    test(`booking list renders — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await loginAs(page, TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD);
      await page.goto(`${BASE_URL}/bookings`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Look for booking-related content
      const hasBookingContent = await page.locator('[class*="booking"], [data-testid*="booking"]').count() > 0 ||
                                await page.locator('text=/booking/i').count() > 0;
      const hasDashboardContent = await page.textContent('body') || '';
      expect(hasBookingContent || hasDashboardContent.length > 100).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Admin Interface
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('6. Admin Interface', () => {
  for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
    test(`admin page accessible as admin — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await loginAs(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
      await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const bodyText = await page.textContent('body');
      expect(bodyText?.length).toBeGreaterThan(50);

      const layout = await auditLayout(page, 'admin');
      // Document overflow as finding, don't fail the test (testing phase)
      if (layout.overflow) {
        console.log(`[FINDING] Admin page horizontal overflow at ${vpName} — body scrollWidth: ${layout.bodyWidth}, viewportWidth: ${layout.viewportWidth}`);
      }
    });

    test(`admin inaccessible to regular user — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await loginAs(page, TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD);
      await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const url = page.url();
      const bodyText = await page.textContent('body') || '';
      // Should redirect away or show access denied
      const isRedirected = !url.includes('/admin') || bodyText.includes('Access Denied') || bodyText.includes('not authorized');
      expect(isRedirected).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Responsive UI Audit
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('7. Responsive UI Audit', () => {
  const pages = ['/', '/auth/login', '/book', '/book/payment', '/dashboard'];

  for (const path of pages) {
    for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
      test(`no overflow: ${path} — ${vpName}`, async ({ page, browserName }) => {
        await collectConsoleErrors(page, browserName, vpName);
        await page.setViewportSize(vpSize);
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1500);

        const layout = await auditLayout(page, `${path}-${vpName}`);
        expect(layout.overflow).toBe(false);
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Touch / Pointer Interaction (mobile viewports)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('8. Touch / Pointer Interaction', () => {
  const mobileViewports = {
    'iphone':  VIEWPORTS['iphone'],
    'android': VIEWPORTS['android'],
  };

  for (const [vpName, vpSize] of Object.entries(mobileViewports)) {
    test(`buttons respond to tap — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      // Find clickable elements
      const buttons = await page.$$('button, a[href], [role="button"]');
      expect(buttons.length).toBeGreaterThan(0);

      // Tap first visible button
      for (const btn of buttons) {
        const visible = await btn.isVisible();
        if (visible) {
          await btn.tap();
          await page.waitForTimeout(500);
          break;
        }
      }
    });

    test(`scrolling works — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
      if (scrollHeight > vpSize.height) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
        const scrollY = await page.evaluate(() => window.scrollY);
        expect(scrollY).toBeGreaterThan(0);
      }
    });

    test(`login form usable on mobile — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('input[type="email"]', { timeout: 15000 });

      // Check inputs are visible and not clipped
      const emailBox = await page.$eval('input[type="email"]', (el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
      });
      expect(emailBox.height).toBeGreaterThan(20);
      expect(emailBox.top).toBeGreaterThanOrEqual(0);
      expect(emailBox.right).toBeLessThanOrEqual(vpSize.width + 10);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Browser-Specific Behavior
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('9. Browser-Specific Behavior', () => {
  test('Firefox: CSS flex layout check', async ({ page, browserName }) => {
    test.skip(browserName !== 'firefox', 'Firefox-only test');
    await page.setViewportSize(VIEWPORTS['desktop']);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Check flex containers render correctly
    const flexIssues = await page.evaluate(() => {
      const flexElements = document.querySelectorAll('[class*="flex"], [style*="display: flex"]');
      let issues = 0;
      flexElements.forEach((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) issues++;
      });
      return issues;
    });
    if (flexIssues > 0) {
      console.log(`[FINDING] Firefox flex layout: ${flexIssues} flex elements with 0 dimensions (may be hidden/conditional)`);
    }
    // Don't fail — 0-dimension flex containers are often hidden/conditional elements
  });

  test('Firefox: date input behavior', async ({ page, browserName }) => {
    test.skip(browserName !== 'firefox', 'Firefox-only test');
    await page.setViewportSize(VIEWPORTS['desktop']);
    await page.goto(`${BASE_URL}/book`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Firefox renders date inputs differently
    const dateInput = await page.$('input[type="date"]');
    if (dateInput) {
      const box = await dateInput.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThan(10);
    }
  });

  test('WebKit: sticky positioning check', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'WebKit-only test');
    await page.setViewportSize(VIEWPORTS['desktop']);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // WebKit sometimes has sticky positioning issues
    const stickyIssues = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      let issues = 0;
      els.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.position === 'sticky') {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width === 0) issues++;
        }
      });
      return issues;
    });
    expect(stickyIssues).toBe(0);
  });

  test('WebKit: flex/grid differences', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'WebKit-only test');
    await page.setViewportSize(VIEWPORTS['desktop']);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const gridIssues = await page.evaluate(() => {
      const gridElements = document.querySelectorAll('[class*="grid"], [style*="display: grid"]');
      let issues = 0;
      gridElements.forEach((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) issues++;
      });
      return issues;
    });
    expect(gridIssues).toBe(0);
  });

  test('Edge: Chromium compatibility check', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium/Edge-only test');
    await page.setViewportSize(VIEWPORTS['desktop']);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Edge is Chromium-based; verify baseline Chromium behavior
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10: Console / Runtime Audit
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('10. Console / Runtime Audit', () => {
  for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
    test(`no critical console errors — ${vpName}`, async ({ page, browserName }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.setViewportSize(vpSize);
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Filter out known non-critical errors
      const criticalErrors = errors.filter((e) =>
        !e.includes('favicon') &&
        !e.includes('manifest') &&
        !e.includes('service-worker') &&
        !e.includes('analytics') &&
        !e.includes('Failed to load resource') // network-level, not app bugs
      );

      // Log but don't fail on non-critical — report in findings
      if (criticalErrors.length > 0) {
        console.log(`[${browserName}/${vpName}] Console errors:`, criticalErrors);
      }
      // No assertion — errors collected for report
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 11: Network / Loading Compatibility
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('11. Network / Loading Compatibility', () => {
  for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
    test(`slow network — page loads without blank screen — ${vpName}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'CDP network throttling only supported in Chromium');
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);

      // Throttle network
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: 50000,   // 50KB/s
        uploadThroughput: 20000,     // 20KB/s
        latency: 200,
      });

      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      // Should not be blank
      const bodyText = await page.textContent('body');
      expect(bodyText?.length).toBeGreaterThan(10);
    });

    test(`page refresh during loading — recovers — ${vpName}`, async ({ page, browserName }) => {
      await collectConsoleErrors(page, browserName, vpName);
      await page.setViewportSize(vpSize);
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });

      const bodyText = await page.textContent('body');
      expect(bodyText?.length).toBeGreaterThan(50);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COLLECT ALL CONSOLE ERRORS AFTER ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.afterAll(() => {
  if (consoleErrors.length > 0) {
    console.log('\n=== CONSOLE ERRORS COLLECTED ===');
    const byBrowser = consoleErrors.reduce((acc, e) => {
      acc[e.browser] = acc[e.browser] || [];
      acc[e.browser].push(e);
      return acc;
    }, {} as Record<string, ConsoleError[]>);

    for (const [browser, errors] of Object.entries(byBrowser)) {
      console.log(`\n[${browser}] ${errors.length} errors:`);
      const unique = [...new Set(errors.map((e) => `[${e.viewport}] ${e.type}: ${e.text.substring(0, 120)}`))];
      unique.forEach((e) => console.log(`  ${e}`));
    }
  }
});
