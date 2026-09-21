/**
 * Quick debug: log ALL network requests to see what Supabase URLs look like
 */
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase') || url.includes('auth') || url.includes('token') || url.includes('profile')) {
      console.log(`  REQ: ${req.method()} ${url}`);
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('supabase') || url.includes('auth') || url.includes('token') || url.includes('profile')) {
      console.log(`  RES: ${res.status()} ${url}`);
    }
  });

  // Try to intercept with wildcard
  await page.route('**/*supabase*/**', async (route) => {
    const url = route.request().url();
    console.log(`  INTERCEPTED: ${route.request().method()} ${url}`);
    await route.continue();
  });

  await page.route('**/*supabase*', async (route) => {
    const url = route.request().url();
    console.log(`  INTERCEPTED-2: ${route.request().method()} ${url}`);
    await route.continue();
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  const authState = await page.evaluate(() => {
    const storage = localStorage.getItem('khub-auth-storage');
    return storage ? JSON.parse(storage) : null;
  });
  console.log(`\nAuth state: ${JSON.stringify(authState?.state)}`);

  // Check the full localStorage
  const allKeys = await page.evaluate(() => Object.keys(localStorage));
  console.log(`localStorage keys: ${allKeys.join(', ')}`);

  await browser.close();
}

main();
