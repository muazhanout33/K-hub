/* Follow-up: capture only the shots missing after the first reshoot run.
 * Corrections: admin overview is /admin (NOT /admin/overview which 404s).
 * Usage: RESHOOT_MODE=light|dark node qa-visual/reshoot2.mjs
 */
import { chromium, devices } from 'playwright';
import { config } from 'dotenv';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002';
const ROOT = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(ROOT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const USER_EMAIL = process.env.TEST_USER_A_EMAIL;
const USER_PASSWORD = process.env.TEST_USER_A_PASSWORD;

async function initTheme(page, mode) {
  await page.addInitScript((m) => { try { localStorage.setItem('khub-theme', m); } catch (e) {} }, mode);
}

async function waitForContent(page, threshold, timeout = 60000) {
  await page.waitForFunction(
    (sel) => {
      const main = document.querySelector('main') || document.body;
      const text = main.innerText.trim().length;
      const hydrated = document.querySelectorAll('[aria-label]').length > 2;
      return text > sel && hydrated;
    },
    threshold,
    { timeout }
  ).catch(() => {});
  await page.waitForFunction(
    () => {
      const main = document.querySelector('main') || document.body;
      return !/Loading (courts|bookings|admin data|settings|notifications|blocked periods)/.test(main.innerText);
    },
    undefined,
    { timeout: 30000 }
  ).catch(() => {});
  await page.waitForTimeout(800);
}

async function settleImages(page) {
  await page.evaluate(() => Promise.all(
    Array.from(document.images).slice(0, 12).map((img) =>
      img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; })
    )
  ).catch(() => {}));
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(SHOTS, name.replace(/[^a-z0-9\-_.]/gi, '_') + '.png'), fullPage: false });
}

async function login(page, email, password) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 150000 });
  await page.waitForSelector('input[type="password"]', { timeout: 120000 });
  await page.waitForTimeout(1500);
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.locator('input[placeholder="your@email.com"]').fill(email);
    await page.locator('input[placeholder="Enter your password"]').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    const moved = await page
      .waitForFunction(() => !window.location.pathname.startsWith('/auth/login'), undefined, { timeout: 90000 })
      .then(() => true)
      .catch(() => false);
    if (moved) return;
    console.log(`  login attempt ${attempt} did not navigate — retrying`);
    await page.waitForTimeout(2000);
  }
  throw new Error(`login failed for ${email}`);
}

async function customerDetail(page) {
  await page.goto(`${BASE}/admin/customers`, { waitUntil: 'domcontentloaded', timeout: 150000 });
  await page.waitForFunction(
    () => {
      const main = document.querySelector('main') || document.body;
      return /ALL CUSTOMERS/.test(main.innerText) && document.querySelectorAll('a[href*="/admin/customers/"]').length > 0;
    },
    undefined, { timeout: 45000 }
  ).catch(() => false);
  await page.locator('a[href*="/admin/customers/"]').first().click({ timeout: 20000 });
  await page.waitForLoadState('domcontentloaded');
}

async function bellDropdown(page) {
  await page.locator('button[aria-label^="Notifications"]').first().click({ timeout: 20000 });
  await page.waitForTimeout(1000);
}

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function runGroup(browser, { mode, auth, device, tasks }) {
  const ctx = await browser.newContext(VIEWPORTS[device] || VIEWPORTS.desktop);
  const page = await ctx.newPage();
  await initTheme(page, mode);
  if (auth) {
    try {
      await login(page, auth.email, auth.password);
    } catch (e) {
      console.log(`SKIP group (${device}/${mode}): ${String(e).slice(0, 120)}`);
      await ctx.close();
      return;
    }
  }
  for (const [kind, route, name, thresh] of tasks) {
    try {
      if (kind === 'goto') {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 150000 });
        await waitForContent(page, thresh);
        await settleImages(page);
      } else if (kind === 'customer-detail') {
        await customerDetail(page);
        await waitForContent(page, 200);
        await settleImages(page);
      } else if (kind === 'bell') {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 150000 });
        await waitForContent(page, thresh);
        await bellDropdown(page);
      }
      await shot(page, name);
      console.log(`OK ${name}`);
    } catch (e) {
      console.log(`FAIL ${name}: ${String(e).slice(0, 160)}`);
      try { await shot(page, name + '-FAIL'); } catch (e2) {}
    }
  }
  await ctx.close();
}

const browser = await chromium.launch();
const mode = process.env.RESHOOT_MODE;

if (mode === 'light') {
  await runGroup(browser, {
    mode: 'light',
    auth: { email: USER_EMAIL, password: USER_PASSWORD },
    device: 'desktop',
    tasks: [
      ['goto', '/auth/profile', 'profile-light-desktop-r2', 250],
      ['goto', '/bookings', 'bookings-light-desktop-r2', 250],
      ['bell', '/bookings', 'bell-dropdown-light-desktop', 250],
    ],
  });
  await runGroup(browser, {
    mode: 'light',
    auth: { email: USER_EMAIL, password: USER_PASSWORD },
    device: 'mobile',
    tasks: [
      ['goto', '/notifications', 'notifications-light-mobile-r2', 200],
    ],
  });
  await runGroup(browser, {
    mode: 'light',
    auth: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    device: 'desktop',
    tasks: [
      ['goto', '/admin', 'admin-overview-light-desktop-r2', 300],
      ['bell', '/admin', 'bell-dropdown-light-desktop-admin', 300],
    ],
  });
} else if (mode === 'dark') {
  await runGroup(browser, {
    mode: 'dark',
    auth: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    device: 'desktop',
    tasks: [
      ['goto', '/admin', 'admin-overview-dark-desktop-r2', 300],
      ['goto', '/admin/courts', 'admin-courts-dark-desktop-r2', 300],
      ['goto', '/admin/customers', 'admin-customers-dark-desktop-r2', 250],
      ['customer-detail', '', 'customer-detail-dark-desktop', 200],
      ['goto', '/admin/settings', 'admin-settings-dark-desktop-r2', 250],
      ['goto', '/admin/blocked-periods', 'admin-blocked-periods-dark-desktop-r2', 250],
      ['bell', '/admin', 'bell-dropdown-dark-desktop-admin', 300],
    ],
  });
}

await browser.close();
