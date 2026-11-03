import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('verified-shots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const report = [];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
    // Allow any framer-motion / images to settle
    await page.waitForTimeout(1000);

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
      const clientWidth = doc.clientWidth;
      const innerWidth = window.innerWidth;
      const hasHorizontalOverflow = scrollWidth > innerWidth;

      // Collect images
      const images = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.currentSrc || img.src,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight,
        displayedWidth: img.clientWidth,
        displayedHeight: img.clientHeight,
      }));

      // Check hero image
      const heroImgs = Array.from(document.querySelectorAll('section img, [class*="hero"] img')).map(i => i.src);

      return {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        scrollWidth,
        clientWidth,
        innerWidth,
        hasHorizontalOverflow,
        imagesCount: images.length,
        images,
        heroImgs,
      };
    });

    // Capture viewport shot
    await page.screenshot({ path: path.join(outDir, `${vp.name}-viewport.png`), fullPage: false });
    // Capture full-page shot
    await page.screenshot({ path: path.join(outDir, `${vp.name}-fullpage.png`), fullPage: true });

    report.push({ viewport: vp.name, ...metrics });
    await page.close();
  }

  await browser.close();

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Verification completed successfully! Summary:');
  report.forEach(r => {
    console.log(`- ${r.viewport}: scrollWidth=${r.scrollWidth}, innerWidth=${r.innerWidth}, OVERFLOW=${r.hasHorizontalOverflow ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log(`  Sample images:`, r.images.slice(0, 4).map(i => i.src));
  });
}

run().catch(err => {
  console.error('Test run error:', err);
  process.exit(1);
});
