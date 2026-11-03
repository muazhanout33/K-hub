/* Visual QA driver — Dark/Light pass over all major routes.
 * Scratch tooling (untracked). Read-only DB usage except realLOGIN authentication.
 * Produces: qa-visual/shots/*.png  and  qa-visual/qa-log.json
 */
import { chromium, devices } from 'playwright';
import { config } from 'dotenv';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
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

const log = { routes: {}, theme: {}, servers: [] };
function logFor(suffix) {
  if (!log.routes[suffix]) log.routes[suffix] = [];
  return (entry) => log.routes[suffix].push(entry);
}

function attachCapture(page, suffix) {
  const push = logFor(suffix);
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') {
      const txt = m.text();
      if (txt.includes('scroll-behavior')) return; // known dev-mode hint, not a defect
      push({ kind: 'console-' + t, text: txt.slice(0, 500) });
    }
  });
  page.on('pageerror', (e) => push({ kind: 'pageerror', text: String(e).slice(0, 500) }));
  page.on('requestfailed', (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/_next/webpack-hmr')) {
      push({ kind: 'requestfailed', text: `${r.method()} ${u.pathname} -> ${r.failure()?.errorText}` });
    }
  });
}

async function initTheme(page, mode) {
  await page.addInitScript(
    (m) => { try { localStorage.setItem('khub-theme', m); } catch (e) {} }, mode);
}

async function settle(page, extraListener) {
  try { await page.waitForLoadState('networkidle', { timeout: 12000 }); } catch (e) {}
  await page.waitForTimeout(1500);
  if (extraListener) { try { await extraListener(); } catch (e) { log.servers.push({ note: 'listener-ignored: ' + e.message?.slice(0, 120) }); } }
  await page.waitForTimeout(600);
}

async function shot(page, name) {
  const file = resolve(SHOTS, name.replace(/[^a-z0-9\-_.]/gi, '_') + '.png');
  await page.screenshot({ path: file, fullPage: false });
}

async function realLogin(page, email, password) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 150000 });
  await page.waitForSelector('input[type="password"]', { timeout: 120000 });
  await page.locator('input[placeholder="your@email.com"]').fill(email);
  await page.locator('input[placeholder="Enter your password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForFunction(
    () => !window.location.pathname.startsWith('/auth/login'),
    undefined,
    { timeout: 60000 }
  );
}

async function gotoRoute(page, route, withAuth) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    settle_ok: {
      await settle(page);
    }
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------------- Route definitions ---------------- */
// Each route: name, path, needsAuth ('user' | 'admin' | null), interactions per theme.
const ROUTES = [
  { slug: 'home', path: '/', auth: null },
  { slug: 'about', path: '/about', auth: null },
  { slug: 'membership', path: '/membership', auth: null },
  { slug: 'events', path: '/events', auth: null },
  { slug: 'sponsors-apply', path: '/sponsors/apply', auth: null },
  { slug: 'advertise', path: '/advertise', auth: null },
  { slug: 'contact', path: '/contact', auth: null },
  { slug: 'login', path: '/auth/login', auth: null },
  { slug: 'register', path: '/auth/register', auth: null },
  { slug: 'courts', path: '/courts', auth: null },
  { slug: 'court-detail', path: null, auth: null, via: '/courts', nav: 'a[href^="/courts/"]' },
  { slug: 'sponsors', path: '/sponsors', auth: null },
];

const ROUTES_USER = [
  { slug: 'profile', path: '/profile', auth: 'user' },
  { slug: 'bookings', path: '/bookings', auth: 'user' },
  { slug: 'notifications', path: '/notifications', auth: 'user' },
  { slug: 'book-wizard', path: '/book', auth: 'user' },
];

const ROUTES_ADMIN = [
  { slug: 'admin-overview', path: '/admin', auth: 'admin', interactions: 'admin-overview' },
  { slug: 'admin-bookings', path: '/admin/bookings', auth: 'admin', interactions: 'drawer-booking' },
  { slug: 'admin-courts', path: '/admin/courts', auth: 'admin', interactions: 'drawer-court' },
  { slug: 'admin-customers', path: '/admin/customers', auth: 'admin', interactions: 'goto-customer-detail' },
  { slug: 'customer-detail', path: null, auth: 'admin', via: '/admin/customers', nav: 'a[href^="/admin/customers/"]' },
  { slug: 'admin-notifications', path: '/admin/notifications', auth: 'admin', interactions: 'drawer-notification' },
  { slug: 'admin-blocked-periods', path: '/admin/blocked-periods', auth: 'admin' },
  { slug: 'admin-settings', path: '/admin/settings', auth: 'admin' },
];

const VIEWPORTS = [
  { key: 'desktop', viewport: { width: 1440, height: 900 } },
  { key: 'mobile', ...devices['iPhone 13'] },
];

const THEMES = ['light', 'dark'];

async function visitRoute(browser, route, credentials, suffix) {
  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      const sfx = `${suffix}-${theme}-${vp.key}`;
      const ctx = await browser.newContext({ ...vp, baseURL: BASE });
      const page = await ctx.newPage();
      await initTheme(page, theme);
      attachCapture(page, sfx);
      let ok = false;
      try {
        if (credentials) {
          await realLogin(page, credentials.email, credentials.password);
        }
        let nav = route.path;
        await page.goto(`${BASE}${nav}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
        await settle(page);
        await shot(page, `${sfx}`);
        ok = true;

        // route-specific interactions (dark surfaces live in overlays)
        if (route.interactions) await doInteractions(page, route.interactions, sfx);
        if (route.nav) {
          const link = page.locator(route.nav).first();
          await link.click({ timeout: 20000 });
          await settle(page);
          await shot(page, `${sfx}-detail`);
        }

        // one per-theme console snapshot of the html class
        const cls = await page.evaluate(() => document.documentElement.className);
        logFor(sfx)({ kind: 'theme-class', value: cls });
      } catch (e) {
        logFor(sfx)({ kind: 'driver-error', text: String(e).slice(0, 300) });
      }
      await ctx.close();
    }
  }
}

async function doInteractions(page, kind, sfx) {
  const tryClick = async (sel, label, name) => {
    try {
      await page.locator(sel).first().click({ timeout: 15000 });
      await settle(page);
      await shot(page, `${sfx}-${name}`);
    } catch (e) {
      logFor(sfx)({ kind: 'interaction-skipped', text: `${label}: ${String(e).slice(0, 160)}` });
    }
  };

  if (kind === 'drawer-booking') {
    await tryClick('.cursor-pointer', 'booking row', 'drawer-booking');
    // close
    try { await page.keyboard.press('Escape'); } catch (e) {}
    await settle(page);
  }
  if (kind === 'drawer-court') {
    await tryClick('button:has-text("Edit"), .cursor-pointer', 'court row', 'drawer-court');
    try { await page.keyboard.press('Escape'); } catch (e) {}
    await settle(page);
  }
  if (kind === 'drawer-notification') {
    await tryClick(
      'button:has-text("Compose"), button:has-text("New notification"), button:has-text("Send notification")',
      'compose button',
      'drawer-compose'
    );
    try { await page.keyboard.press('Escape'); } catch (e) {}
  }
  if (kind === 'admin-overview') {
    // notification bell dropdown in AdminShell
    await tryClick('button:has(font-awesome), button[title*="notification" i]', 'bell', 'bell-dropdown');
  }
}

/* ---------------- Theme persistence & switching checks ---------------- */
async function themeChecks(browser) {
  const vp = VIEWPORTS[0];
  const ctx = await browser.newContext({ ...vp, baseURL: BASE, colorScheme: 'dark' });
  const page = await ctx.newPage();
  attachCapture(page, 'theme-persistence');
  await page.addInitScript(() => localStorage.setItem('khub-theme', 'dark'));

  // tolerant click helper
  const clickTheme = async (label) => {
    const btn = page.getByRole('button', { name: label }).first();
    for (let i = 0; i < 3; i++) {
      try { await btn.waitFor({ state: 'visible', timeout: 60000 }); break; } catch (e) {}
      await page.waitForTimeout(3000);
    }
    try { await btn.click({ timeout: 30000 }); } catch (e) {
      log.theme[`${label}-click`] = { failed: String(e).slice(0, 150) };
    }
  };

  // 1. persistence after refresh
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await settle(page);
  const afterLoad = await page.evaluate(() => ({
    cls: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('khub-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  log.theme['reload-with-dark'] = afterLoad;
  await shot(page, 'theme-persist-dark-home');

  // 2. switch Light
  await clickTheme('Light Mode');
  await page.waitForTimeout(800);
  log.theme['switch-light'] = await page.evaluate(() => ({
    cls: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('khub-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  await shot(page, 'theme-switch-light-home');

  // 3. switch System (context colorScheme=dark -> should resolve dark)
  await clickTheme('System Mode');
  await page.waitForTimeout(800);
  log.theme['switch-system-dark-os'] = await page.evaluate(() => ({
    cls: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('khub-theme'),
  }));

  // 4. refresh in system mode persists class through no-flash script
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(page);
  log.theme['system-after-reload'] = await page.evaluate(() => ({
    cls: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('khub-theme'),
  }));

  // 5. Dark via UI + shot
  await clickTheme('Dark Mode');
  await page.waitForTimeout(800);
  await shot(page, 'theme-switch-dark-home');
  await ctx.close();

  // system mode with LIGHT OS preference
  const ctx2 = await browser.newContext({ ...vp, baseURL: BASE, colorScheme: 'light' });
  const page2 = await ctx2.newPage();
  attachCapture(page2, 'theme-persistence-light-os');
  await page2.addInitScript(() => localStorage.setItem('khub-theme', 'system'));
  await page2.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await settle(page2);
  log.theme['system-light-os'] = await page2.evaluate(() => ({
    cls: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('khub-theme'),
  }));
  await ctx2.close();
}

/* ---------------- Main ---------------- */
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE, { method: 'GET' });
      if (r.ok) return true;
    } catch (e) {}
    await new Promise((res) => setTimeout(res, 5000));
  }
  return false;
}

(async () => {
  const up = await waitForServer();
  if (!up) { log.servers.push({ note: 'dev server never came up' }); writeFileSync(resolve(ROOT, 'qa-log.json'), JSON.stringify(log, null, 2)); process.exit(1); }
  log.servers.push({ note: 'server up at ' + BASE });

  const browser = await chromium.launch({ headless: true });
  try {
    await themeChecks(browser);

    for (const r of ROUTES) await visitRoute(browser, r, null, r.slug);
    for (const r of ROUTES_USER) {
      if (!USER_EMAIL || !USER_PASSWORD) { log.servers.push({ note: 'no user A creds' }); break; }
      await visitRoute(browser, r, { email: USER_EMAIL, password: USER_PASSWORD }, r.slug);
    }
    for (const r of ROUTES_ADMIN) {
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) { log.servers.push({ note: 'no admin creds' }); break; }
      await visitRoute(browser, r, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, r.slug);
    }
  } finally {
    await browser.close();
    writeFileSync(resolve(ROOT, 'qa-log.json'), JSON.stringify(log, null, 2));
  }
})();
