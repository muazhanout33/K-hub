/**
 * F-A11Y-10 Part 2: Remove overflow-x:hidden to expose real overflow
 *
 * Re-tests the Home route (the failing one) with overflow-x:hidden removed,
 * so we can see the true scrollWidth and assess genuine reflow failure.
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const ZOOMED_VIEWPORT = { width: 640, height: 360 };

async function testWithoutMasking() {
  console.log('='.repeat(70));
  console.log('  F-A11Y-10 Part 2: Unmasking overflow-x:hidden on Home');
  console.log('='.repeat(70));

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  });

  const context = await browser.newContext({
    viewport: ZOOMED_VIEWPORT,
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  page.on('console', () => {});
  page.on('pageerror', () => {});

  const routes = [
    { path: '/', name: 'Home' },
    { path: '/auth/login', name: 'Login' },
    { path: '/auth/register', name: 'Register' },
    { path: '/book', name: 'Book' },
    { path: '/book/payment', name: 'Payment' },
    { path: '/bookings', name: 'Bookings' },
    { path: '/admin', name: 'Admin' },
  ];

  for (const route of routes) {
    const url = `${BASE_URL}${route.path}`;
    console.log(`\n--- ${route.name} (${route.path}) — overflow-x:hidden REMOVED ---`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1000);

      // Remove overflow-x:hidden from html and body
      await page.evaluate(() => {
        document.documentElement.style.overflowX = 'visible';
        document.body.style.overflowX = 'visible';
      });

      // Now check the real overflow
      const dims = await page.evaluate(() => {
        const html = document.documentElement;
        return {
          scrollWidth: html.scrollWidth,
          clientWidth: html.clientWidth,
          diff: html.scrollWidth - html.clientWidth,
          canScrollHorizontally: html.scrollWidth > html.clientWidth,
        };
      });

      console.log(`  scrollWidth: ${dims.scrollWidth} | clientWidth: ${dims.clientWidth} | diff: ${dims.diff}px`);
      console.log(`  Can scroll horizontally: ${dims.canScrollHorizontally}`);

      if (dims.canScrollHorizontally) {
        // Find the overflowing elements
        const overflowing = await page.evaluate((vpWidth) => {
          const results = [];
          for (const el of document.querySelectorAll('*')) {
            const rect = el.getBoundingClientRect();
            if (rect.width > vpWidth && rect.width > 1) {
              const tag = el.tagName.toLowerCase();
              const id = el.id ? `#${el.id}` : '';
              const cls = el.className && typeof el.className === 'string'
                ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
                : '';
              const isInteractive = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
              results.push({
                selector: `${tag}${id}${cls ? '.' + cls : ''}`,
                width: Math.round(rect.width),
                right: Math.round(rect.right),
                isInteractive,
                text: (el.textContent || '').trim().substring(0, 60),
              });
            }
          }
          return results;
        }, ZOOMED_VIEWPORT.width);

        if (overflowing.length > 0) {
          console.log(`  Overflowing elements (${overflowing.length}):`);
          for (const el of overflowing.slice(0, 20)) {
            const interactive = el.isInteractive ? ' [INTERACTIVE]' : '';
            console.log(`    ${el.selector} — ${el.width}px — right:${el.right}px${interactive} "${el.text.substring(0, 40)}"`);
          }
          if (overflowing.length > 20) {
            console.log(`    ... and ${overflowing.length - 20} more`);
          }
        }
      } else {
        console.log(`  ✅ No genuine horizontal overflow — content reflows correctly`);
      }

      // Screenshot without overflow-x:hidden
      const screenshotName = `reflow-nomask-${route.path.replace(/\//g, '_').replace(/^_/, '') || 'home'}`;
      await page.screenshot({
        path: `D:\\k-hub-booking-platform\\screenshots\\${screenshotName}.png`,
        fullPage: false,
      });
      console.log(`  Screenshot: screenshots/${screenshotName}.png`);

    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  await browser.close();
  console.log('\n' + '='.repeat(70));
  console.log('  Analysis complete. Compare masked vs unmasked screenshots.');
  console.log('='.repeat(70));
}

testWithoutMasking().catch(console.error);
