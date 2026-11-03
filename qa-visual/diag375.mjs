/* One-off diagnostic: find elements causing 10px overflow at 375, and debug calendar toggle. */
import { chromium } from 'playwright';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002';
const ROOT = dirname(fileURLToPath(import.meta.url));

const ctx = await chromium.launchPersistentContext(resolve(ROOT, 'shots', '.ctx-diag375'), {
  viewport: { width: 375, height: 675 }, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 150000 });
await page.waitForTimeout(3000);

const offenders = await page.evaluate(() => {
  const cw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.right > cw + 1 || r.left < -1) {
      out.push({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 80),
        w: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left),
        overflowX: getComputedStyle(el).overflowX,
        fixed: getComputedStyle(el).position,
      });
    }
  }
  return { cw, sw: document.documentElement.scrollWidth, list: out.slice(0, 25) };
});
console.log(JSON.stringify(offenders, null, 1));

// Calendar toggle behavior
const toggle = page.getByRole('button', { name: /Browse all dates/ }).first();
const tVisible = await toggle.isVisible().catch(() => false);
console.log('toggle visible:', tVisible);
if (!tVisible) {
  // scroll to it
  await toggle.scrollIntoViewIfNeeded().catch(() => {});
  console.log('after scroll visible:', await toggle.isVisible().catch(() => false));
}
await toggle.click().catch((e) => console.log('click err', String(e).slice(0, 100)));
await page.waitForTimeout(700);
const cal = await page.evaluate(() => {
  const el = document.querySelector('#availability-full-calendar');
  if (!el) return 'MISSING';
  const r = el.getBoundingClientRect();
  return { h: Math.round(r.height), display: getComputedStyle(el).display, css: el.className.slice(0, 60) };
});
console.log('calendar:', cal);

// what does the toggle look like / aria state
const st = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button')).filter((b) => /Browse all dates|Hide full calendar/i.test(b.innerText));
  return btns.map((b) => ({ text: b.innerText.trim(), expanded: b.getAttribute('aria-expanded'), visible: b.getBoundingClientRect().height > 0 }));
});
console.log('toggle buttons:', JSON.stringify(st));

await ctx.close();
