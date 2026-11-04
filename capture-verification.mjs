import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('verified-shots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'mobile-360', width: 360, height: 740 },
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
  { name: 'desktop-1280', width: 1280, height: 800 },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:3002/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
      const clientWidth = doc.clientWidth;
      const innerWidth = window.innerWidth;
      const hasHorizontalOverflow = scrollWidth > innerWidth;

      // Check header items
      const header = document.querySelector('header');
      const headerRect = header ? header.getBoundingClientRect() : null;
      const navElementsOutside = [];

      if (header) {
        header.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect();
          const s = window.getComputedStyle(el);
          if (s.display !== 'none' && s.visibility !== 'hidden') {
            if (r.right > innerWidth || r.left < 0) {
              navElementsOutside.push({ tag: el.tagName, className: el.className, left: r.left, right: r.right });
            }
          }
        });
      }

      return {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        scrollWidth,
        clientWidth,
        innerWidth,
        hasHorizontalOverflow,
        headerRect,
        navElementsOutside,
      };
    });

    await page.screenshot({ path: path.join(outDir, `${vp.name}-viewport.png`), fullPage: false });
    await page.screenshot({ path: path.join(outDir, `${vp.name}-fullpage.png`), fullPage: true });

    results.push({ name: vp.name, ...metrics });
    await page.close();
  }

  await browser.close();

  console.log('\n=== RESPONSIVE VERIFICATION RESULTS ===');
  results.forEach(r => {
    console.log(`[${r.name}] ${r.viewport}: scrollWidth=${r.scrollWidth}, clientWidth=${r.clientWidth}, OVERFLOW=${r.hasHorizontalOverflow ? 'FAIL' : 'PASS'}, NavElementsOutside=${r.navElementsOutside.length}`);
  });
}

run().catch(console.error);
