import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

const VIEWPORTS = [
  { name: 'Mobile (375px)', width: 375, height: 667 },
  { name: 'Tablet (768px)', width: 768, height: 1024 },
  { name: 'Desktop (1280px)', width: 1280, height: 800 },
];

const PAGES = [
  { path: '/sponsors', label: 'Sponsors Page (Empty & Active)' },
  { path: '/sponsors/apply', label: 'Sponsorship Apply Form' },
  { path: '/advertise', label: 'Advertising Spaces & Request Form' },
];

async function run() {
  const browser = await chromium.launch({ headless: true });

  console.log('\n══════════════════════════════════════════════');
  console.log('  Phase 6 — Responsive Visual Review');
  console.log('══════════════════════════════════════════════\n');

  for (const vp of VIEWPORTS) {
    console.log(`\n📱 VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
    console.log('──────────────────────────────────────────────');

    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });

    for (const pageInfo of PAGES) {
      const page = await ctx.newPage();
      await page.goto(BASE + pageInfo.path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      // Check horizontal overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      // Check form fields height & padding if form exists
      const inputsOk = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, select, textarea, button'));
        let minSizeOk = true;
        inputs.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.height < 32) {
            minSizeOk = false;
          }
        });
        return minSizeOk;
      });

      // Check header title font sizes
      const titleFont = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        return h1 ? window.getComputedStyle(h1).fontSize : 'none';
      });

      console.log(`  📄 ${pageInfo.label} [${pageInfo.path}]`);
      console.log(`     - Horizontal Overflow: ${overflow ? '❌ HAS OVERFLOW' : '✅ Clean (No horizontal scroll)'}`);
      console.log(`     - Form Input Touch Bounding: ${inputsOk ? '✅ Pass (All inputs >= 32px height)' : '⚠️ Small touch target'}`);
      console.log(`     - Hero H1 Computed Font Size: ${titleFont}`);

      // Special check on /sponsors/apply form
      if (pageInfo.path === '/sponsors/apply') {
        const chipsCount = await page.locator('[role="radio"]').count();
        console.log(`     - Target Type Chips Count: ${chipsCount}`);
      }

      // Special check on /advertise
      if (pageInfo.path === '/advertise') {
        const cardsCount = await page.locator('[id^="adspace-request-btn-"]').count();
        console.log(`     - Ad Space Cards Count: ${cardsCount}`);
      }

      await page.close();
    }
    await ctx.close();
  }

  await browser.close();
  console.log('\n══════════════════════════════════════════════');
  console.log('  Responsive Review Complete');
  console.log('══════════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('Error during responsive review:', err);
  process.exit(1);
});
