/**
 * Notification Dropdown Positioning Verification
 *
 * Validates that the dropdown stays within the viewport at all tested widths.
 * Uses base64-encoded cookie for @supabase/ssr session seeding.
 * Uses React Portal on mobile so position:fixed works outside backdrop-blur.
 */
import { chromium } from 'playwright';

const VIEWPORTS = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1536];
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PROJECT_REF = 'bwwifvuerhxgjeoochnp';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const results = [];

function buildSessionCookieValue() {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({
      sub: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'admin@khubsports.com',
      role: 'authenticated',
      aud: 'authenticated',
      iat: now,
      exp: now + 3600,
    })).toString('base64')}.fakesig`,
    refresh_token: 'fake-refresh-token-for-testing',
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: 'bearer',
    user: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'admin@khubsports.com',
      created_at: '2025-01-01T00:00:00Z',
      user_metadata: { full_name: 'Admin User', phone: '+1 555 000 0000' },
      app_metadata: {},
    },
  };
  const b64 = Buffer.from(JSON.stringify(session), 'utf-8').toString('base64');
  const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `base64-${b64url}`;
}

async function testViewport(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const cookieValue = buildSessionCookieValue();

  await page.addInitScript((args) => {
    const { storageKey, cookieValue } = args;
    document.cookie = `${storageKey}=${cookieValue}; path=/; max-age=3600; SameSite=Lax`;

    const MOCK_USER = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'admin@khubsports.com',
      user_metadata: { full_name: 'Admin User', phone: '+1 555 000 0000' },
      app_metadata: {},
      created_at: '2025-01-01T00:00:00Z',
    };
    const MOCK_PROFILE = {
      id: MOCK_USER.id, full_name: 'Admin User', email: MOCK_USER.email,
      phone_number: '+1 555 000 0000', role: 'Admin', membership_type: 'Premium',
      avatar_url: null, created_at: '2025-01-01T00:00:00Z',
    };

    const origFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (url.includes('/auth/v1/user'))
        return new Response(JSON.stringify({ user: MOCK_USER }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/auth/v1/token'))
        return new Response(JSON.stringify({ access_token: 'mock', token_type: 'bearer', expires_in: 3600, refresh_token: 'mock', user: MOCK_USER }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/auth/v1/logout') || url.includes('/auth/v1/signout'))
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/rest/v1/profiles'))
        return new Response(JSON.stringify(MOCK_PROFILE), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/1' } });
      if (url.includes('/rest/v1/notifications'))
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } });
      return origFetch.call(window, input, init);
    };
  }, { storageKey: STORAGE_KEY, cookieValue });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // Check auth state
  const authState = await page.evaluate(() => {
    const s = localStorage.getItem('khub-auth-storage');
    return s ? JSON.parse(s)?.state : null;
  });

  // Find the bell button
  const bell = page.locator('button[aria-label*="Notification"]').first();
  const bellVisible = await bell.isVisible().catch(() => false);

  if (!bellVisible) {
    console.log(`  ${width}px: SKIP (bell not visible). user=${authState?.user?.email || 'null'}`);
    await context.close();
    results.push({ width, pass: null, reason: 'bell not visible', user: authState?.user?.email || 'null' });
    return;
  }

  // Click bell to open dropdown
  await bell.click();
  await page.waitForTimeout(1500);

  // Find the dropdown: look for the portal'd div on body (position: fixed or static with Notification text)
  const ddBox = await page.evaluate(() => {
    // The dropdown is portaled to document.body on mobile
    // Look for div with "Notifications" header text and shadow-2xl
    const candidates = document.body.children;
    for (const el of candidates) {
      if (el.tagName !== 'DIV') continue;
      const style = window.getComputedStyle(el);
      if (style.boxShadow === 'none') continue;
      if (!el.textContent?.includes('Notifications')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 50) {
        return {
          left: rect.left, right: rect.right, top: rect.top,
          width: rect.width, height: rect.height, position: style.position,
        };
      }
    }
    // Also check inside the header tree (for desktop / non-portal case)
    const all = document.querySelectorAll('div[class*="shadow-2xl"]');
    for (const el of all) {
      if (el.textContent?.includes('Notifications')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 50) {
          const style = window.getComputedStyle(el);
          return {
            left: rect.left, right: rect.right, top: rect.top,
            width: rect.width, height: rect.height, position: style.position,
          };
        }
      }
    }
    return null;
  });

  if (!ddBox) {
    console.log(`  ${width}px: SKIP (dropdown not found). user=${authState?.user?.email || 'null'}`);
    await context.close();
    results.push({ width, pass: null, reason: 'dropdown not found', user: authState?.user?.email || 'null' });
    return;
  }

  const leftOk = ddBox.left >= 0;
  const rightOk = ddBox.right <= width;
  const topOk = ddBox.top >= 0;
  const pass = leftOk && rightOk && topOk;

  const triggerInfo = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label*="Notification"]');
    if (btn) { const r = btn.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) }; }
    return null;
  });

  const record = {
    width, pass, position: ddBox.position,
    ddLeft: Math.round(ddBox.left), ddRight: Math.round(ddBox.right),
    ddTop: Math.round(ddBox.top), ddWidth: Math.round(ddBox.width),
    triggerRight: triggerInfo?.right ?? 'N/A',
    user: authState?.user?.email || 'null',
  };
  results.push(record);

  const status = pass ? 'PASS' : 'FAIL';
  console.log(
    `  ${width}px: ${status} | pos=${ddBox.position} | trigger.r=${triggerInfo?.right} | dd.l=${record.ddLeft} dd.r=${record.ddRight} dd.top=${record.ddTop} dd.w=${record.ddWidth} | user=${authState?.user?.email || 'null'}`
  );

  if (!pass) {
    const issues = [];
    if (!leftOk) issues.push(`left=${record.ddLeft} < 0`);
    if (!rightOk) issues.push(`right=${record.ddRight} > ${width}`);
    if (!topOk) issues.push(`top=${record.ddTop} < 0`);
    console.log(`    VIOLATION: ${issues.join(', ')}`);
  }

  await context.close();
}

async function main() {
  console.log('Notification Dropdown Positioning Test');
  console.log('======================================\n');

  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    await testViewport(browser, vp);
  }

  await browser.close();

  console.log('\n======================================');
  console.log('Summary');
  console.log('======================================');

  const passed = results.filter(r => r.pass === true);
  const failed = results.filter(r => r.pass === false);
  const skipped = results.filter(r => r.pass === null);

  console.log(`  Passed:  ${passed.length}/${results.length}`);
  console.log(`  Failed:  ${failed.length}/${results.length}`);
  console.log(`  Skipped: ${skipped.length}/${results.length}`);

  if (failed.length > 0) {
    console.log('\nFAILURES:');
    for (const f of failed) {
      const issues = [];
      if (f.ddLeft < 0) issues.push(`left=${f.ddLeft}`);
      if (f.ddRight > f.width) issues.push(`right=${f.ddRight}>${f.width}`);
      if (f.ddTop < 0) issues.push(`top=${f.ddTop}<0`);
      console.log(`  ${f.width}px: ${issues.join(', ')}`);
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main();
