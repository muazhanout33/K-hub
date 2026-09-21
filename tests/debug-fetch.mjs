import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();

  // Listen for console messages from the page
  page.on('console', (msg) => {
    if (msg.type() === 'log' || msg.type() === 'error' || msg.type() === 'warn') {
      console.log(`  [PAGE ${msg.type()}] ${msg.text()}`);
    }
  });

  await page.addInitScript(() => {
    console.log('[INIT SCRIPT] Running');
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      console.log('[FETCH INTERCEPT]', url.substring(0, 120));
      if (url.includes('supabase') && url.includes('/auth/v1/user')) {
        console.log('[FETCH INTERCEPT] Intercepting getUser!');
        return new Response(JSON.stringify({
          user: {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            email: 'admin@khubsports.com',
            user_metadata: { full_name: 'Admin User' },
            app_metadata: {},
            created_at: '2025-01-01T00:00:00Z',
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return origFetch.apply(this, args);
    };
    console.log('[INIT SCRIPT] Fetch patched');
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Check final state
  const authState = await page.evaluate(() => {
    const s = localStorage.getItem('khub-auth-storage');
    return s ? JSON.parse(s)?.state : null;
  });
  console.log(`\nFinal auth state: ${JSON.stringify(authState)}`);

  // Check if any requests were made
  console.log(`Done.`);

  await browser.close();
}

main();
