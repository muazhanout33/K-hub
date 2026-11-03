import { chromium } from 'playwright';

async function getImages(query) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`https://unsplash.com/s/photos/${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const urls = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('figure img, [data-test="photo-grid-masonry-img"]'));
      return imgs.map(img => img.currentSrc || img.src || (img.srcset ? img.srcset.split(' ')[0] : '')).filter(s => s && s.includes('images.unsplash.com')).slice(0, 8);
    });
    console.log(`=== ${query} ===`);
    console.log(JSON.stringify(urls, null, 2));
  } catch (err) {
    console.error(`Error for ${query}:`, err.message);
  } finally {
    await browser.close();
  }
}

for (const q of ['padel', 'soccer-pitch', 'tennis-court', 'sports-center']) {
  await getImages(q);
}
