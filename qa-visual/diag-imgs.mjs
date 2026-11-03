/* Find which home-page images have empty/missing src. */
import { chromium } from 'playwright';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002';
const ctx = await chromium.launch({ viewport: { width: 390, height: 800 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 150000 });
await page.waitForTimeout(5000);

const imgs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('img')).map((img) => {
    const r = img.getBoundingClientRect();
    return {
      src: (img.getAttribute('src') || '').slice(0, 90),
      alt: (img.getAttribute('alt') || '').slice(0, 50),
      cls: (img.className || '').slice(0, 60),
      box: `${Math.round(r.top)}x${Math.round(r.left)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      hasSrcAttr: img.hasAttribute('src'),
    };
  })
);
console.log('imgs on home:', JSON.stringify(imgs, null, 1));

// Also dump events data path — the empty src warnings usually come from events w/ blank image_url
const state = await page.evaluate(() => {
  const featured = document.querySelector('h3');
  return null;
});
await ctx.close();
