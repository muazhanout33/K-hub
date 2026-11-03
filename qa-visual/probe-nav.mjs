import { chromium, devices } from 'playwright';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.env.local') });
const BASE = 'http://localhost:3002';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ...devices['Desktop Chrome'], colorScheme: 'dark' });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('khub-theme', 'dark'));
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch (e) {}
await page.waitForTimeout(2000);

const info = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].map(b => ({
    label: b.getAttribute('aria-label') || b.textContent?.trim().slice(0, 40),
  })).filter(b => /mode|theme/i.test(b.label || ''));
  const rg = document.querySelector('[role="radiogroup"]');
  const htmlcls = document.documentElement.className;
  const navHTML = (document.querySelector('header') || document.querySelector('nav') || {}).outerHTML?.slice(0, 400);
  return { btns, rg: !!rg, htmlcls, navHTML };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
