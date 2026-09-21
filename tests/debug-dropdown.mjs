import { chromium } from 'playwright';

const PROJECT_REF = 'bwwifvuerhxgjeoochnp';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

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
    refresh_token: 'fake-refresh-token',
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
  const jsonStr = JSON.stringify(session);
  const b64 = Buffer.from(jsonStr, 'utf-8').toString('base64');
  const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `base64-${b64url}`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
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
      id: MOCK_USER.id,
      full_name: 'Admin User',
      email: MOCK_USER.email,
      phone_number: '+1 555 000 0000',
      role: 'Admin',
      membership_type: 'Premium',
      avatar_url: null,
      created_at: '2025-01-01T00:00:00Z',
    };

    const origFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ user: MOCK_USER }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/auth/v1/token')) {
        return new Response(JSON.stringify({ access_token: 'mock', token_type: 'bearer', expires_in: 3600, refresh_token: 'mock', user: MOCK_USER }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/auth/v1/logout') || url.includes('/auth/v1/signout')) {
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/rest/v1/profiles')) {
        return new Response(JSON.stringify(MOCK_PROFILE), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/1' } });
      }
      if (url.includes('/rest/v1/notifications')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } });
      }
      return origFetch.call(window, input, init);
    };
  }, { storageKey: STORAGE_KEY, cookieValue });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  const bell = page.locator('button[aria-label*="Notification"]').first();
  const vis = await bell.isVisible();
  console.log('Bell visible:', vis);

  if (vis) {
    await bell.click();
    await page.waitForTimeout(1500);

    // Debug: dump all visible elements that contain "Notification" text
    const elements = await page.evaluate(() => {
      const results = [];
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.textContent?.includes('Notification') && el.children.length < 5) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (rect.width > 0 && rect.height > 0) {
            results.push({
              tag: el.tagName,
              classes: el.className?.substring?.(0, 100),
              text: el.textContent.substring(0, 80),
              rect: { l: Math.round(rect.left), r: Math.round(rect.right), t: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
              position: style.position,
              shadow: style.boxShadow?.substring(0, 60),
            });
          }
        }
      }
      return results;
    });
    console.log('Elements with "Notification":', JSON.stringify(elements, null, 2));

    // Also check if the dropdown is inside a portal or fixed position
    const fixedElements = await page.evaluate(() => {
      const results = [];
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'absolute') {
          const rect = el.getBoundingClientRect();
          if (rect.width > 200 && rect.height > 100 && el.textContent?.includes('Notification')) {
            results.push({
              tag: el.tagName,
              classes: el.className?.substring?.(0, 100),
              position: style.position,
              rect: { l: Math.round(rect.left), r: Math.round(rect.right), t: Math.round(rect.top), w: Math.round(rect.width) },
            });
          }
        }
      }
      return results;
    });
    console.log('Fixed/absolute Notification containers:', JSON.stringify(fixedElements, null, 2));
  }

  await browser.close();
}

main();
