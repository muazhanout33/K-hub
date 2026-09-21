import { chromium } from 'playwright';

const routes = [
  '/',
  '/auth/login',
  '/auth/register',
  '/courts',
  '/bookings',
  '/contact',
  '/book',
  '/book/details',
  '/book/payment',
  '/book/confirmation',
  '/about',
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  });
  const context = await browser.newContext();
  const BASE = 'http://localhost:3000';

  const ROOT_LAYOUT_TITLE = 'K-HUB Sports Club | Premium Court Booking Platform';

  console.log('Checking document.title for routes on localhost:3000\n');
  console.log(`${'Route'.padEnd(28)} ${'Title'.padEnd(60)} Status`);
  console.log(`${'─'.repeat(28)} ${'─'.repeat(60)} ${'─'.repeat(20)}`);

  for (const route of routes) {
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
      const title = await page.title();
      const isRootLayout = title === ROOT_LAYOUT_TITLE;
      const status = isRootLayout ? '⚠️  DEFAULT (same as root layout)' : '✅';
      console.log(`${route.padEnd(28)} ${title.padEnd(60)} ${status}`);
    } catch (err) {
      console.log(`${route.padEnd(28)} ${'ERROR'.padEnd(60)} ${err.message.split('\n')[0]}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
})();
