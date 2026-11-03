/* Recovery visual capture: full-page screenshots at required widths +
 * console errors + failed requests on the REAL rendered site. */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002';
const OUT = 'recovery-shots';

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '412', width: 412, height: 915 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
];

await mkdir(OUT, { recursive: true });
const report = [];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on('requestfailed', (r) => failed.push(`${r.url().slice(0, 160)} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 160)}`);
  });

  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => errors.push('goto: ' + e.message));
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${OUT}/home-${vp.name}.png`, fullPage: true });

  // Count broken images in the DOM (naturalWidth === 0)
  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => (img.currentSrc || img.src || '(empty src)').slice(0, 160)),
  );

  report.push({ viewport: vp.name, errors, failed, brokenImages: broken });
  await ctx.close();
}
await browser.close();

console.log(JSON.stringify(report, null, 2));
