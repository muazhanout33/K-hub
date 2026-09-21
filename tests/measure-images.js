const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const viewports = [[320,568],[375,812],[414,896],[768,1024],[1024,768],[1280,800],[1536,900]];
  
  const pages = [
    { path: '/', name: 'Home' },
    { path: '/courts', name: 'Courts' },
    { path: '/courts/court-pad-1', name: 'CourtDetail' },
    { path: '/book', name: 'Book' },
    { path: '/events', name: 'Events' },
  ];

  for (const pg of pages) {
    console.log('\n=== ' + pg.name + ' ===');
    for (const [w, h] of viewports) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      try {
        await page.goto('http://localhost:3000' + pg.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2500);

        const bodyOverflow = await page.evaluate(() => ({
          bodySW: document.body.scrollWidth,
          docCW: document.documentElement.clientWidth,
          innerW: window.innerWidth,
        }));

        const results = await page.evaluate(() => {
          const imgs = [...document.querySelectorAll('img')].filter(img => img.offsetParent !== null);
          return imgs.map(img => {
            const rect = img.getBoundingClientRect();
            const nat = img.naturalWidth + 'x' + img.naturalHeight;
            const disp = Math.round(rect.width) + 'x' + Math.round(rect.height);
            const ratio = img.naturalWidth > 0 && img.naturalHeight > 0 ? (img.naturalWidth / img.naturalHeight).toFixed(2) : 'N/A';
            const dispRatio = rect.height > 0 ? (rect.width / rect.height).toFixed(2) : 'N/A';
            const ratioDiff = img.naturalWidth > 0 && img.naturalHeight > 0 && rect.height > 0
              ? Math.abs((img.naturalWidth / img.naturalHeight) - (rect.width / rect.height)).toFixed(2)
              : 'N/A';
            const isCropped = img.naturalWidth > 0 && (rect.width < img.naturalWidth * 0.3 || rect.height < img.naturalHeight * 0.3);
            const parent = img.parentElement;
            const parentClass = (parent?.className || '').substring(0, 100);
            const parentRect = parent?.getBoundingClientRect();
            const parentDims = parentRect ? Math.round(parentRect.width) + 'x' + Math.round(parentRect.height) : 'N/A';
            return {
              alt: (img.alt || '').substring(0, 40),
              nat, disp, parentDims,
              natRatio: ratio, dispRatio,
              ratioDiff,
              isCropped,
              missing: img.naturalWidth === 0 && img.naturalHeight === 0,
            };
          });
        });

        const ovStr = bodyOverflow.bodySW > bodyOverflow.docCW 
          ? ' BODY_OV=' + (bodyOverflow.bodySW - bodyOverflow.docCW) + 'px' 
          : ' body_ok';
        console.log('  @' + w + 'px (bw=' + bodyOverflow.bodySW + ' cw=' + bodyOverflow.docCW + ')' + ovStr);
        
        for (const r of results) {
          const flags = [];
          if (r.missing) flags.push('BROKEN');
          if (r.isCropped) flags.push('HEAVY_CROP');
          if (r.ratioDiff !== 'N/A' && parseFloat(r.ratioDiff) > 0.3) flags.push('RATIO_DISTORT');
          const flagStr = flags.length ? ' [' + flags.join(',') + ']' : ' [OK]';
          console.log('    "' + r.alt + '" nat=' + r.nat + ' disp=' + r.disp + ' p=' + r.parentDims + ' nR=' + r.natRatio + ' dR=' + r.dispRatio + ' d=' + r.ratioDiff + flagStr);
        }
      } catch (e) {
        console.log('  @' + w + 'px ERROR: ' + e.message.substring(0, 100));
      }
      await ctx.close();
    }
  }
  await browser.close();
})();
