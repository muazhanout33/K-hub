/* Deeper toggle + login diagnostic with console error capture. */
import { chromium } from 'playwright';
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const ctx = await chromium.launch({ viewport: { width: 390, height: 730 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)));

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 150000 });
await page.waitForTimeout(4000);

console.log('console errors so far:', errors.length, errors.slice(0, 5));

// Try clicking via trusted long sequence
const toggle = page.locator('button[aria-controls="availability-full-calendar"]');
const count = await toggle.count();
console.log('toggle count:', count);
if (count) {
  console.log('expanded before:', await toggle.getAttribute('aria-expanded'));
  await toggle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await toggle.click();
  await page.waitForTimeout(1200);
  console.log('expanded after click:', await toggle.getAttribute('aria-expanded'));
  // try JS click too
  await page.evaluate(() => document.querySelector('button[aria-controls="availability-full-calendar"]').click());
  await page.waitForTimeout(1200);
  console.log('expanded after JS click:', await toggle.getAttribute('aria-expanded'));
  console.log('calendar exists:', await page.evaluate(() => !!document.querySelector('#availability-full-calendar')));
  // is React even handling clicks? test the FilterChip "Padel" chip
  const chip = page.locator('button', { hasText: 'Padel' }).first();
  await chip.scrollIntoViewIfNeeded().catch(() => {});
  await chip.click().catch((e) => console.log('chip click err', String(e).slice(0, 80)));
  await page.waitForTimeout(800);
  console.log('chip active class:', await page.evaluate(() => {
    const active = document.querySelector('.filter-chip-active');
    return active ? active.textContent.trim() : 'NONE';
  }));
}
console.log('total console errors:', errors.length);
console.log(errors.slice(0, 10).join('\n---\n'));

// login page
const page2 = await ctx.newPage();
await page2.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 150000 });
await page2.waitForTimeout(3000);
const inputs = await page2.evaluate(() => Array.from(document.querySelectorAll('input')).map((i) => ({ type: i.type, ph: i.placeholder, hidden: getComputedStyle(i).display === 'none' })));
console.log('login inputs:', JSON.stringify(inputs));
await ctx.close();
