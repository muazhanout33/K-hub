/**
 * F-A11Y-10 Part 3: Deep analysis of the Home page calendar at 200% zoom
 * Checks button tap targets, text readability, and scroll affordances.
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const ZOOMED_VIEWPORT = { width: 640, height: 360 };

async function deepAnalysis() {
  console.log('='.repeat(70));
  console.log('  F-A11Y-10 Part 3: Deep Home Page Analysis at 640x360');
  console.log('='.repeat(70));

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  });

  const context = await browser.newContext({
    viewport: ZOOMED_VIEWPORT,
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  page.on('console', () => {});
  page.on('pageerror', () => {});

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);

  // 1. Check all interactive element sizes for WCAG touch target compliance (44x44)
  console.log('\n--- Interactive Element Sizes (WCAG 2.5.8: min 24x24px) ---');
  const elementSizes = await page.evaluate(() => {
    const interactive = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [tabindex="0"]');
    const results = [];
    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      // Only check visible elements
      if (rect.width > 0 && rect.height > 0 && rect.top < 1000) {
        const tooSmall = rect.width < 24 || rect.height < 24;
        const belowTarget = rect.width < 44 || rect.height < 44;
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().substring(0, 50);
        results.push({
          tag,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          tooSmall,
          belowTarget,
          text,
          isCalendar: el.closest('[class*="DaySelector"]') !== null || el.closest('.scrollbar-hide') !== null,
        });
      }
    }
    return results;
  });

  let smallCount = 0;
  let belowTargetCount = 0;
  let calendarSmall = 0;
  for (const el of elementSizes) {
    if (el.tooSmall) smallCount++;
    if (el.belowTarget) belowTargetCount++;
    if (el.isCalendar && el.belowTarget) calendarSmall++;
  }

  console.log(`  Total interactive elements: ${elementSizes.length}`);
  console.log(`  Below 24x24px (WCAG min): ${smallCount}`);
  console.log(`  Below 44x44px (ideal touch target): ${belowTargetCount}`);
  console.log(`  Calendar buttons below 44x44: ${calendarSmall}`);

  // Show some examples of small elements
  const smallExamples = elementSizes.filter(e => e.belowTarget).slice(0, 10);
  if (smallExamples.length > 0) {
    console.log('\n  Small interactive elements (first 10):');
    for (const el of smallExamples) {
      const cal = el.isCalendar ? ' [CALENDAR]' : '';
      console.log(`    ${el.tag} ${el.width}x${el.height}px — "${el.text}"${cal}`);
    }
  }

  // 2. Check calendar scroll behavior
  console.log('\n--- Calendar Scroll Analysis ---');
  const calendarInfo = await page.evaluate(() => {
    const scrollContainer = document.querySelector('.scrollbar-hide');
    if (!scrollContainer) return { found: false };
    return {
      found: true,
      scrollWidth: scrollContainer.scrollWidth,
      clientWidth: scrollContainer.clientWidth,
      overflowX: getComputedStyle(scrollContainer).overflowX,
      canScroll: scrollContainer.scrollWidth > scrollContainer.clientWidth,
    };
  });

  if (calendarInfo.found) {
    console.log(`  Calendar scroll container found`);
    console.log(`  scrollWidth: ${calendarInfo.scrollWidth} | clientWidth: ${calendarInfo.clientWidth}`);
    console.log(`  overflow-x: ${calendarInfo.overflowX}`);
    console.log(`  Can scroll: ${calendarInfo.canScroll}`);
  }

  // 3. Check if there are any fixed navigation elements
  console.log('\n--- Fixed/Positioned Elements ---');
  const fixedElements = await page.evaluate((vpWidth) => {
    const all = document.querySelectorAll('*');
    const results = [];
    for (const el of all) {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          results.push({
            tag: el.tagName.toLowerCase(),
            position: style.position,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            overflows: rect.width > vpWidth,
          });
        }
      }
    }
    return results;
  }, ZOOMED_VIEWPORT.width);

  for (const el of fixedElements) {
    const overflow = el.overflows ? ' [OVERFLOWS VIEWPORT]' : '';
    console.log(`  ${el.tag} (${el.position}) — ${el.width}x${el.height}px${overflow}`);
  }

  // 4. Take final screenshot
  await page.screenshot({
    path: 'D:\\k-hub-booking-platform\\screenshots\\reflow-home-deep-analysis.png',
    fullPage: false,
  });
  console.log('\n  Final screenshot saved: screenshots/reflow-home-deep-analysis.png');

  await browser.close();
  console.log('\n' + '='.repeat(70));
  console.log('  Deep analysis complete');
  console.log('='.repeat(70));
}

deepAnalysis().catch(console.error);
