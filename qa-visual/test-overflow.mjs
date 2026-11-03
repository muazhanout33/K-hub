import { chromium } from 'playwright';

const browser = await chromium.launch();
for (const w of [375, 390, 412]) {
  const page = await browser.newPage({ viewport: { width: w, height: 812 } });
  await page.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    document.body.style.overflowX = 'visible';
    document.documentElement.style.overflowX = 'visible';
  });

  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await b.textContent();
    if (text && (text.includes('Free') || text.includes('Arena') || text.includes('Pitch') || text.includes('Court') || text.includes('Stadium'))) {
      try {
        await b.click({ timeout: 1000 });
      } catch (e) {}
    }
  }
  await page.waitForTimeout(600);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  console.log(`Viewport ${w}: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}, diff=${scrollWidth - clientWidth}`);

  if (scrollWidth > clientWidth) {
    const overflowing = await page.evaluate((vw) => {
      const results = [];
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 0.5 || r.left < -0.5) {
          results.push({
            tag: el.tagName,
            className: el.className ? String(el.className).slice(0, 80) : '',
            text: (el.textContent || '').trim().slice(0, 30),
            rect: { left: r.left, right: r.right, width: r.width }
          });
        }
      }
      return results;
    }, w);
    console.log(`Overflowing elements for ${w}:`, JSON.stringify(overflowing.slice(0, 10), null, 2));
  }
  await page.close();
}
await browser.close();
