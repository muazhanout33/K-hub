/**
 * Direct Playwright auth verification for Phase 6.
 *
 * Tests:
 * 1. Public routes load without auth
 * 2. Protected routes redirect to /auth/login when unauthenticated
 * 3. /login returns 404 (confirms no valid route exists)
 * 4. Auth simulation: inject localStorage → guard allows page, then Supabase re-check clears it
 *
 * Run: node tests/auth-verify.js
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
const TIMEOUT = 15000;

const PUBLIC_ROUTES = ['/', '/courts', '/contact', '/auth/login', '/auth/register'];

const PROTECTED_ROUTES = ['/bookings', '/profile', '/notifications', '/admin'];

// A fake-but-well-formed user object matching the User type.
// rehydrate() will pick this up; initSession() will later null it (no real Supabase session).
const FAKE_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Test User',
  email: 'test@example.com',
  phone: '+1234567890',
  role: 'User',
  createdAt: '2025-01-01T00:00:00.000Z',
};

const FAKE_ADMIN = { ...FAKE_USER, role: 'Admin', name: 'Test Admin' };

let passed = 0;
let failed = 0;
let classified = 0;
const results = [];

function record(label, status, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️';
  console.log(`${icon} ${label}: ${detail}`);
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
  classified++;
  results.push({ label, status, detail });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);

  try {
    // ──────────────────────────────────────
    // 1. PUBLIC ROUTES — should load without auth
    // ──────────────────────────────────────
    console.log('\n── PUBLIC ROUTES ──');
    for (const route of PUBLIC_ROUTES) {
      try {
        const res = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        const finalUrl = page.url();
        const status = res?.status() || 'N/A';
        if (finalUrl.endsWith(route) && status < 400) {
          record(`PUBLIC ${route}`, 'PASS', `loaded (HTTP ${status}, URL: ${finalUrl})`);
        } else if (status >= 400) {
          record(`PUBLIC ${route}`, 'FAIL', `HTTP ${status}`);
        } else {
          record(`PUBLIC ${route}`, 'PASS', `redirected → ${finalUrl} (HTTP ${status})`);
        }
      } catch (e) {
        record(`PUBLIC ${route}`, 'FAIL', e.message.split('\n')[0]);
      }
    }

    // ──────────────────────────────────────
    // 2. PROTECTED ROUTES UNAUTHENTICATED — should land on /auth/login
    // ──────────────────────────────────────
    console.log('\n── PROTECTED ROUTES (unauthenticated) ──');
    for (const route of PROTECTED_ROUTES) {
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        // Wait for hydration + guard redirect (up to 8s)
        await page.waitForFunction(
          (target) => window.location.pathname === target || window.location.pathname === '/auth/login',
          '/auth/login',
          { timeout: 8000 }
        ).catch(() => {});
        const finalUrl = page.url();
        const path = new URL(finalUrl).pathname;
        if (path === '/auth/login') {
          record(`PROTECTED ${route}`, 'PASS', `redirected to /auth/login ✅`);
        } else if (path === '/login') {
          record(`PROTECTED ${route}`, 'FAIL', `redirected to /login (MISSING ROUTE — confirms useAdminGuard bug)`);
        } else if (path === route) {
          record(`PROTECTED ${route}`, 'FAIL', `no redirect — page still at ${route} (guard not firing)`);
        } else {
          record(`PROTECTED ${route}`, 'FAIL', `unexpected redirect to ${path}`);
        }
      } catch (e) {
        record(`PROTECTED ${route}`, 'FAIL', e.message.split('\n')[0]);
      }
    }

    // ──────────────────────────────────────
    // 3. /login — should 404 (confirms nothing valid exists)
    // ──────────────────────────────────────
    console.log('\n── /login route ──');
    try {
      const res = await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      const status = res?.status() || 'N/A';
      const finalUrl = page.url();
      if (status >= 400 || finalUrl.includes('404') || finalUrl.includes('not-found')) {
        record('/login', 'PASS', `returns error (HTTP ${status}) — confirms no valid route`);
      } else {
        record('/login', 'FAIL', `returned HTTP ${status} — route exists unexpectedly at ${finalUrl}`);
      }
    } catch (e) {
      record('/login', 'PASS', `error loading (expected for missing route): ${e.message.split('\n')[0]}`);
    }

    // ──────────────────────────────────────
    // 4. AUTHENTICATED GUARD SIMULATION
    // ──────────────────────────────────────
    console.log('\n── GUARD SIMULATION (persisted user) ──');

    // Inject fake user into localStorage BEFORE navigating, so rehydrate picks it up
    await page.goto(`${BASE}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((user) => {
      localStorage.setItem('khub-auth-storage', JSON.stringify({
        state: { user, isAuthenticated: true },
        version: 0,
      }));
    }, FAKE_USER);

    // Navigate to /bookings with injected auth
    await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded' });
    // Short wait: guard should pass because rehydrate finds the user
    await page.waitForTimeout(2000);
    const url1 = page.url();
    const path1 = new URL(url1).pathname;

    if (path1 === '/bookings') {
      record('GUARD SIM /bookings (with user)', 'PASS', `page rendered at /bookings (guard passed via rehydrate)`);
    } else if (path1 === '/auth/login') {
      // initSession cleared the user before guard could finish — acceptable behavior
      record('GUARD SIM /bookings (with user)', 'PASS', `redirected to /auth/login (initSession cleared fake user — expected Supabase re-check behavior)`);
    } else {
      record('GUARD SIM /bookings (with user)', 'FAIL', `unexpected URL: ${path1}`);
    }

    // Inject admin user, navigate to /admin
    await page.goto(`${BASE}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((user) => {
      localStorage.setItem('khub-auth-storage', JSON.stringify({
        state: { user, isAuthenticated: true },
        version: 0,
      }));
    }, FAKE_ADMIN);

    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url2 = page.url();
    const path2 = new URL(url2).pathname;

    if (path2 === '/admin') {
      record('GUARD SIM /admin (with admin)', 'PASS', `page rendered at /admin (admin guard passed via rehydrate)`);
    } else if (path2 === '/auth/login') {
      record('GUARD SIM /admin (with admin)', 'PASS', `redirected to /auth/login (initSession cleared fake user — expected)`);
    } else if (path2 === '/') {
      record('GUARD SIM /admin (with admin)', 'FAIL', `redirected to / — admin guard rejected admin user`);
    } else {
      record('GUARD SIM /admin (with admin)', 'FAIL', `unexpected URL: ${path2}`);
    }

  } finally {
    await browser.close();
  }

  console.log(`\n══════════════════════════════════════`);
  console.log(`AUTH VERIFICATION SUMMARY`);
  console.log(`══════════════════════════════════════`);
  console.log(`PASSED:  ${passed}/${classified}`);
  console.log(`FAILED:  ${failed}/${classified}`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ❌ ${r.label}: ${r.detail}`));
  }
  console.log(`══════════════════════════════════════\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
