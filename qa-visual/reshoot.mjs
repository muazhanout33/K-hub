/* Targeted re-shoot driver — replaces stale/pre-hydration captures flagged during the first sweep
 * and fills grid gaps (court-detail, customer-detail, bell-dropdown).
 * Scratch tooling (untracked). Read-only usage: no form submissions.
 * Usage: RESHOOT_MODE=light|dark node qa-visual/reshoot.mjs
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

/* Wait until content actually rendered: main innerText grows past threshold
 * AND the theme toggle icons exist (hydration marker). Falls back after timeout. */
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
  /* let data fetches settle: wait until no "Loading" text visible in main */
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
  await page.waitForTimeout(1500); /* let the form hydrate before typing */
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

/* ── court detail: /courts/[id] is not linked from anywhere — resolve an id via the API ── */
async function courtDetail(page) {
  const res = await page.request.get(`${BASE}/api/courts`, { timeout: 30000 });
  const json = await res.json();
  const id = json?.data?.[0]?.id;
  if (!id) throw new Error('no courts returned by /api/courts');
  await page.goto(`${BASE}/courts/${id}`, { waitUntil: 'domcontentloaded', timeout: 150000 });
}

/* ── click-through: first customer View from /admin/customers → detail ── */
async function customerDetail(page) {
  await page.goto(`${BASE}/admin/customers`, { waitUntil: 'domcontentloaded', timeout: 150000 });
  await page.waitForFunction(
    () => {
      const main = document.querySelector('main') || document.body;
      return /ALL CUSTOMERS/.test(main.innerText) && document.querySelectorAll('a[href*="/admin/customers/"], button:has-text("View")').length > 0;
    },
    undefined, { timeout: 45000 }
  ).catch(() => false);
  const view = page.locator('a[href*="/admin/customers/"]').first();
  if (await view.count()) {
    await view.click({ timeout: 20000 });
  } else {
    await page.getByRole('link', { name: 'View' }).first().click({ timeout: 20000 }).catch(async () => {
      await page.locator('button:has-text("View")').first().click({ timeout: 20000 });
    });
  }
  await page.waitForLoadState('domcontentloaded');
}

/* ── click-through: open bell dropdown, keep open, shoot ── */
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
  for (const task of tasks) {
    const [kind, route, name, thresh] = task;
    try {
      if (kind === 'goto') {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 150000 });
        await waitForContent(page, thresh);
        await settleImages(page);
      } else if (kind === 'court-detail') {
        await gotoOrFallback(page, auth, mode, route, thresh);
        await courtDetail(page);
        await waitForContent(page, 200);
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

/* If a task route is a special walk (court-detail walk on /courts), just goto /courts first */
async function gotoOrFallback(page, auth, mode, route, thresh) {
  if (route) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 150000 });
    await waitForContent(page, thresh || 200);
  }
}

const browser = await chromium.launch();
const mode = process.env.RESHOOT_MODE;

if (mode === 'light') {
  // light, no auth — desktop
  await runGroup(browser, {
    mode: 'light',

    device: 'desktop',
    tasks: [
      ['court-detail', '/courts', 'court-detail-light-desktop', 200],
    ],
  });

  // light, no auth — mobile
  await runGroup(browser, {
    mode: 'light',
    device: 'mobile',
    tasks: [
      ['goto', '/', 'home-light-mobile-r2', 400],
      ['goto', '/events', 'events-light-mobile-r2', 250],
      ['goto', '/auth/login', 'login-light-mobile-r2', 200],
      ['court-detail', '', 'court-detail-light-mobile', 200],
    ],
  });

  // light + user — desktop
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

  // light + user — mobile
  await runGroup(browser, {
    mode: 'light',
    auth: { email: USER_EMAIL, password: USER_PASSWORD },
    device: 'mobile',
    tasks: [
      ['goto', '/notifications', 'notifications-light-mobile-r2', 200],
    ],
  });

  // light + admin — desktop
  await runGroup(browser, {
    mode: 'light',
    auth: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    device: 'desktop',
    tasks: [
      ['goto', '/admin/overview', 'admin-overview-light-desktop-r2', 300],
      ['goto', '/admin/bookings', 'admin-bookings-light-desktop-r2', 300],
      ['goto', '/admin/courts', 'admin-courts-light-desktop-r2', 300],
      ['goto', '/admin/customers', 'admin-customers-light-desktop-r2', 250],
      ['customer-detail', '', 'customer-detail-light-desktop', 200],
      ['goto', '/admin/notifications', 'admin-notifications-light-desktop-r2', 250],
      ['goto', '/admin/blocked-periods', 'admin-blocked-periods-light-desktop-r2', 250],
      ['goto', '/admin/settings', 'admin-settings-light-desktop-r2', 250],
      ['bell', '/admin/overview', 'bell-dropdown-light-desktop-admin', 250],
    ],
  });

  // light + admin — mobile
  await runGroup(browser, {
    mode: 'light',
    auth: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    device: 'mobile',
    tasks: [
      ['goto', '/admin/courts', 'admin-courts-light-mobile-r2', 250],
      ['goto', '/admin/customers', 'admin-customers-light-mobile-r2', 250],
      ['goto', '/admin/notifications', 'admin-notifications-light-mobile-r2', 250],
      ['goto', '/admin/blocked-periods', 'admin-blocked-periods-light-mobile-r2', 250],
      ['goto', '/admin/settings', 'admin-settings-light-mobile-r2', 250],
    ],
  });
} else if (mode === 'dark') {
  // dark, no auth — desktop
  await runGroup(browser, {
    mode: 'dark',
    device: 'desktop',
    tasks: [
      ['goto', '/', 'home-dark-desktop-r2', 400],
      ['court-detail', '/courts', 'court-detail-dark-desktop', 250],
    ],
  });

  // dark, no auth — mobile
  await runGroup(browser, {
    mode: 'dark',
    device: 'mobile',
    tasks: [
      ['goto', '/events', 'events-dark-mobile-r2', 250],
      ['goto', '/courts', 'courts-dark-mobile-r2', 300],
      ['court-detail', '', 'court-detail-dark-mobile', 200],
    ],
  });

  // dark + user — desktop
  await runGroup(browser, {
    mode: 'dark',
    auth: { email: USER_EMAIL, password: USER_PASSWORD },
    device: 'desktop',
    tasks: [
      ['goto', '/auth/profile', 'profile-dark-desktop-r2', 250],
      ['goto', '/bookings', 'bookings-dark-desktop-r2', 250],
      ['bell', '/bookings', 'bell-dropdown-dark-desktop', 250],
    ],
  });

  // dark + user — mobile
  await runGroup(browser, {
    mode: 'dark',
    auth: { email: USER_EMAIL, password: USER_PASSWORD },
    device: 'mobile',
    tasks: [
      ['goto', '/notifications', 'notifications-dark-mobile-r2', 200],
    ],
  });

  // dark + admin — desktop
  await runGroup(browser, {
    mode: 'dark',
    auth: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    device: 'desktop',
    tasks: [
      ['goto', '/admin/overview', 'admin-overview-dark-desktop-r2', 300],
      ['goto', '/admin/courts', 'admin-courts-dark-desktop-r2', 300],
      ['goto', '/admin/customers', 'admin-customers-dark-desktop-r2', 250],
      ['customer-detail', '', 'customer-detail-dark-desktop', 200],
      ['goto', '/admin/settings', 'admin-settings-dark-desktop-r2', 250],
      ['goto', '/admin/blocked-periods', 'admin-blocked-periods-dark-desktop-r2', 250],
      ['bell', '/admin/overview', 'bell-dropdown-dark-desktop-admin', 250],
    ],
  });

  // dark + admin — mobile
  await runGroup(browser, {
    mode: 'dark',
    auth: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    device: 'mobile',
    tasks: [
      ['goto', '/admin/courts', 'admin-courts-dark-mobile-r2', 250],
      ['goto', '/admin/customers', 'admin-customers-dark-mobile-r2', 250],
      ['goto', '/admin/notifications', 'admin-notifications-dark-mobile-r2', 250],
      ['goto', '/admin/blocked-periods', 'admin-blocked-periods-dark-mobile-r2', 250],
      ['goto', '/admin/settings', 'admin-settings-dark-mobile-r2', 250],
    ],
  });
}

await browser.close();
