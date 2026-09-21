const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── Touch targets at 320px and 375px ──
  for (const vp of [[320,800],[375,812]]) {
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
    const page = await ctx.newPage();

    // Home — buttons + filter chips
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForTimeout(600);
    const home = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button[data-slot="button"]')].filter(el => el.offsetParent !== null);
      const btnH = btns.map(el => el.getBoundingClientRect().height);
      const chips = [...document.querySelectorAll('.filter-chip')].filter(el => el.offsetParent !== null);
      const chipH = chips.map(el => el.getBoundingClientRect().height);
      return {
        btnCount: btns.length, btnMinH: btnH.length ? Math.min(...btnH) : null, btnAllH: btnH,
        chipCount: chips.length, chipMinH: chipH.length ? Math.min(...chipH) : null, chipAllH: chipH,
      };
    });
    console.log(`\n=== TOUCH TARGETS @ ${vp[0]}px ===`);
    console.log(`Home buttons: count=${home.btnCount} minH=${home.btnMinH}px all=[${home.btnAllH.map(h=>Math.round(h)).join(',')}]`);
    console.log(`Home chips:   count=${home.chipCount} minH=${home.chipMinH}px all=[${home.chipAllH.map(h=>Math.round(h)).join(',')}]`);

    // Booking page — buttons
    await page.goto('http://localhost:3000/book', { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForTimeout(600);
    const book = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button[data-slot="button"]')].filter(el => el.offsetParent !== null);
      const btnH = btns.map(el => el.getBoundingClientRect().height);
      return { btnCount: btns.length, btnMinH: btnH.length ? Math.min(...btnH) : null, btnAllH: btnH };
    });
    console.log(`Book buttons: count=${book.btnCount} minH=${book.btnMinH}px all=[${book.btnAllH.map(h=>Math.round(h)).join(',')}]`);

    // Courts listing — filter chips
    await page.goto('http://localhost:3000/courts', { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForTimeout(600);
    const courts = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('.filter-chip')].filter(el => el.offsetParent !== null);
      const chipH = chips.map(el => el.getBoundingClientRect().height);
      return { chipCount: chips.length, chipMinH: chipH.length ? Math.min(...chipH) : null, chipAllH: chipH };
    });
    console.log(`Courts chips: count=${courts.chipCount} minH=${courts.chipMinH}px all=[${courts.chipAllH.map(h=>Math.round(h)).join(',')}]`);

    await ctx.close();
  }

  // ── Carousel check across viewports ──
  console.log('\n=== CAROUSEL (Home page) ===');
  for (const vp of [[320,800],[375,812],[430,932],[768,1024],[1280,800]]) {
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => {
      const el = document.querySelector('[class*="overflow-x-auto"][class*="snap-x"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const kids = [...el.children];
      const kidWidths = kids.map(k => k.getBoundingClientRect().width);
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        snapType: cs.scrollSnapType,
        overflowX: cs.overflowX,
        display: cs.display,
        childCount: kids.length,
        firstKidW: kidWidths.length ? Math.round(kidWidths[0]) : 0,
        allKidW: kidWidths.map(w => Math.round(w)),
      };
    });
    if (info) {
      console.log(`${vp[0]}px: display=${info.display} snap=${info.snapType} overflowX=${info.overflowX} sw=${info.scrollWidth} cw=${info.clientWidth} kids=${info.childCount} firstKid=${info.firstKidW}px allKids=[${info.allKidW.join(',')}]`);
    } else {
      console.log(`${vp[0]}px: NO CAROUSEL CONTAINER FOUND`);
    }
    await ctx.close();
  }

  // ── Booking steps check ──
  console.log('\n=== BOOKING STEPS (/book) ===');
  for (const vp of [[320,800],[375,812],[430,932],[768,1024],[1280,800]]) {
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/book', { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => {
      // Find the steps container: flex + justify-between + border-b
      const els = [...document.querySelectorAll('div')];
      const stepsEl = els.find(el => {
        const cs = getComputedStyle(el);
        return cs.justifyContent === 'space-between' && cs.borderBottomWidth !== '0px' && cs.display === 'flex';
      });
      if (!stepsEl) return null;
      const cs = getComputedStyle(stepsEl);
      const stepItems = stepsEl.querySelectorAll('[class*="shrink-0"]');
      const stepWidths = [...stepItems].map(s => s.getBoundingClientRect().width);
      return {
        scrollWidth: stepsEl.scrollWidth,
        clientWidth: stepsEl.clientWidth,
        overflowX: cs.overflowX,
        gap: cs.gap,
        stepCount: stepItems.length,
        stepWidths: stepWidths.map(w => Math.round(w)),
      };
    });
    if (info) {
      console.log(`${vp[0]}px: overflowX=${info.overflowX} gap=${info.gap} sw=${info.scrollWidth} cw=${info.clientWidth} steps=${info.stepCount} widths=[${info.stepWidths.join(',')}]`);
    } else {
      console.log(`${vp[0]}px: NO STEPS FOUND`);
    }
    await ctx.close();
  }

  // ── Desktop spot-checks ──
  console.log('\n=== DESKTOP SPOT-CHECKS (1280px) ===');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // Home hero image height
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 8000 });
  await page.waitForTimeout(600);
  const heroH = await page.evaluate(() => {
    const img = document.querySelector('img[alt="K-HUB Outdoor Court"]')?.closest('div.relative');
    return img ? img.getBoundingClientRect().height : 0;
  });
  console.log(`Home hero image container: ${heroH}px (expected >= 440)`);

  // Home court cards layout
  const courtLayout = await page.evaluate(() => {
    const carousel = document.querySelector('[class*="overflow-x-auto"][class*="snap-x"]');
    if (!carousel) return null;
    const cs = getComputedStyle(carousel);
    return { display: cs.display, gridTemplateColumns: cs.gridTemplateColumns, flexWrap: cs.flexWrap };
  });
  console.log(`Home court cards layout: display=${courtLayout?.display} grid=${courtLayout?.gridTemplateColumns}`);

  // Book steps — all visible without scroll
  await page.goto('http://localhost:3000/book', { waitUntil: 'domcontentloaded', timeout: 8000 });
  await page.waitForTimeout(600);
  const stepsDesktop = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div')];
    const stepsEl = els.find(el => {
      const cs = getComputedStyle(el);
      return cs.justifyContent === 'space-between' && cs.borderBottomWidth !== '0px' && cs.display === 'flex';
    });
    if (!stepsEl) return null;
    return { sw: stepsEl.scrollWidth, cw: stepsEl.clientWidth };
  });
  console.log(`Book steps: scrollW=${stepsDesktop?.sw} clientW=${stepsDesktop?.cw} needsScroll=${stepsDesktop && stepsDesktop.sw > stepsDesktop.cw}`);

  // Booking card padding
  await page.goto('http://localhost:3000/book/details', { waitUntil: 'domcontentloaded', timeout: 8000 });
  await page.waitForTimeout(600);
  const detailPad = await page.evaluate(() => {
    const card = document.querySelector('[class*="rounded-"][class*="bg-white"][class*="border"]');
    if (!card) return null;
    return { padding: getComputedStyle(card).padding };
  });
  console.log(`Book details card padding: ${detailPad?.padding}`);

  await ctx.close();
  await browser.close();
})();
