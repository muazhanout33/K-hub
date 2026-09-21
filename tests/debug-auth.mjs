/**
 * Debug: capture all network requests to understand auth flow
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  // Log ALL requests
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase') || url.includes('auth') || url.includes('session')) {
      console.log(`REQ: ${req.method()} ${url}`);
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('supabase') || url.includes('auth') || url.includes('session')) {
      console.log(`RES: ${res.status()} ${url}`);
    }
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check what the Navbar looks like
  const navHtml = await page.evaluate(() => {
    const nav = document.querySelector('nav') || document.querySelector('header');
    return nav ? nav.innerHTML.substring(0, 1000) : 'no nav';
  });
  console.log('\nNav HTML snippet:', navHtml.substring(0, 500));

  // Check localStorage
  const authStorage = await page.evaluate(() => {
    return localStorage.getItem('khub-auth-storage');
  });
  console.log('\nAuth storage:', authStorage);

  await browser.close();
}

main();
