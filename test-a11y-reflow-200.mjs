/**
 * F-A11Y-10: 200% Zoom / Reflow Test
 *
 * Simulates 200% zoom by using viewport 640×360 (half of 1280×720).
 * Tests that content reflows properly without horizontal scrolling
 * or clipped interactive elements.
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';

const ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/auth/login', name: 'Login' },
  { path: '/auth/register', name: 'Register' },
  { path: '/book', name: 'Book' },
  { path: '/book/payment', name: 'Payment' },
  { path: '/bookings', name: 'Bookings' },
  { path: '/admin', name: 'Admin' },
];

// Simulated 200% zoom viewport
const ZOOMED_VIEWPORT = { width: 640, height: 360 };

const results = [];

async function testReflow() {
  console.log('='.repeat(70));
  console.log('  F-A11Y-10: 200% Zoom / Reflow Test');
  console.log(`  Viewport: ${ZOOMED_VIEWPORT.width}x${ZOOMED_VIEWPORT.height} (simulated 200% zoom)`);
  console.log('='.repeat(70));
  console.log('');

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  });

  const context = await browser.newContext({
    viewport: ZOOMED_VIEWPORT,
    deviceScaleFactor: 2, // 2x DPI for accurate rendering
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Suppress console noise during testing
  page.on('console', () => {});
  page.on('pageerror', () => {});

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route.path}`;
    console.log(`\n--- Testing: ${route.name} (${route.path}) ---`);

    const routeResult = {
      name: route.name,
      path: route.path,
      url,
      loaded: false,
      scrollWidth: 0,
      clientWidth: 0,
      overflowDetected: false,
      overflowXHidden: false,
      overflowingElements: [],
      clippedInteractive: [],
      elementsAboveViewportWidth: [],
      htmlComputedOverflowX: '',
      scrollTopMax: 0,
      error: null,
    };

    try {
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 20000,
      });

      routeResult.loaded = response?.status() < 400 || response?.status() === 404;

      if (response?.status() >= 400) {
        console.log(`  Status: ${response.status()} - may need auth or page not found`);
      }

      // Wait a bit for any animations/layout to settle
      await page.waitForTimeout(1000);

      // --- 1. ScrollWidth vs ClientWidth ---
      const dimensions = await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        return {
          scrollWidth: html.scrollWidth,
          clientWidth: html.clientWidth,
          bodyScrollWidth: body.scrollWidth,
          bodyClientWidth: body.clientWidth,
          htmlOverflowX: getComputedStyle(html).overflowX,
          bodyOverflowX: getComputedStyle(body).overflowX,
          windowInnerWidth: window.innerWidth,
          windowOuterWidth: window.outerWidth,
        };
      });

      routeResult.scrollWidth = dimensions.scrollWidth;
      routeResult.clientWidth = dimensions.clientWidth;
      routeResult.htmlComputedOverflowX = dimensions.htmlOverflowX;
      routeResult.overflowDetected = dimensions.scrollWidth > dimensions.clientWidth;
      routeResult.overflowXHidden = dimensions.htmlOverflowX === 'hidden' || dimensions.bodyOverflowX === 'hidden';

      console.log(`  HTML scrollWidth: ${dimensions.scrollWidth}, clientWidth: ${dimensions.clientWidth}`);
      console.log(`  Body scrollWidth: ${dimensions.bodyScrollWidth}, clientWidth: ${dimensions.bodyClientWidth}`);
      console.log(`  window.innerWidth: ${dimensions.windowInnerWidth}`);
      console.log(`  html overflow-x: ${dimensions.htmlOverflowX}`);
      console.log(`  body overflow-x: ${dimensions.bodyOverflowX}`);
      console.log(`  Horizontal overflow: ${routeResult.overflowDetected ? 'YES' : 'No'}`);

      if (routeResult.overflowXHidden) {
        console.log(`  ⚠ overflow-x:hidden detected — may be masking content overflow`);
      }

      // --- 2. Elements wider than viewport ---
      const overflowingEls = await page.evaluate((vpWidth) => {
        const results = [];
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const rect = el.getBoundingClientRect();
          if (rect.width > vpWidth && rect.width > 1) {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            const cls = el.className && typeof el.className === 'string'
              ? el.className.split(/\s+/).slice(0, 3).join('.')
              : '';
            const text = el.textContent?.trim().substring(0, 40) || '';
            results.push({
              selector: `${tag}${id}${cls ? '.' + cls : ''}`,
              width: Math.round(rect.width),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              textPreview: text,
              isInteractive: ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName),
            });
          }
        }
        return results;
      }, ZOOMED_VIEWPORT.width);

      routeResult.elementsAboveViewportWidth = overflowingEls;
      routeResult.overflowingElements = overflowingEls.filter(e => !e.isInteractive);
      routeResult.clippedInteractive = overflowingEls.filter(e => e.isInteractive);

      if (overflowingEls.length > 0) {
        console.log(`  Elements wider than viewport (${overflowingEls.length}):`);
        for (const el of overflowingEls.slice(0, 15)) {
          const clipped = el.right > ZOOMED_VIEWPORT.width ? ' [CLIPPED]' : '';
          console.log(`    ${el.selector} — width:${el.width}px, left:${el.left}, right:${el.right}${clipped} "${el.textPreview}"`);
        }
        if (overflowingEls.length > 15) {
          console.log(`    ... and ${overflowingEls.length - 15} more`);
        }
      } else {
        console.log(`  No elements wider than viewport found`);
      }

      // --- 3. Check interactive elements specifically for clipping ---
      const clippedCheck = await page.evaluate((vpWidth) => {
        const interactive = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [tabindex]');
        const issues = [];
        for (const el of interactive) {
          const rect = el.getBoundingClientRect();
          // Check if element extends beyond viewport right edge
          if (rect.right > vpWidth + 1) {
            issues.push({
              tag: el.tagName.toLowerCase(),
              selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              overflowBy: Math.round(rect.right - vpWidth),
              text: (el.textContent || el.value || el.placeholder || '').trim().substring(0, 40),
              type: el.getAttribute('type') || '',
            });
          }
        }
        return issues;
      }, ZOOMED_VIEWPORT.width);

      routeResult.clippedInteractive = clippedCheck;

      if (clippedCheck.length > 0) {
        console.log(`  ⚠ Interactive elements clipped beyond viewport:`);
        for (const el of clippedCheck) {
          console.log(`    ${el.tag}${el.selector} — overflowing by ${el.overflowBy}px — "${el.text}"`);
        }
      } else {
        console.log(`  No interactive elements clipped beyond viewport`);
      }

      // --- 4. Check for horizontal scroll capability ---
      const scrollInfo = await page.evaluate(() => {
        const html = document.documentElement;
        return {
          scrollLeft: html.scrollLeft,
          scrollTop: html.scrollTop,
          scrollHeight: html.scrollHeight,
          clientHeight: html.clientHeight,
          scrollableHorizontally: html.scrollWidth > html.clientWidth,
          canScrollLeft: html.scrollLeft > 0,
        };
      });

      routeResult.scrollTopMax = scrollInfo.scrollHeight - scrollInfo.clientHeight;

      if (scrollInfo.scrollableHorizontally) {
        console.log(`  ⚠ Content IS horizontally scrollable`);
        console.log(`    scrollLeft: ${scrollInfo.scrollLeft}`);
      }

      // --- 5. Check for fixed/sticky elements that might cause issues ---
      const fixedSticky = await page.evaluate((vpWidth) => {
        const all = document.querySelectorAll('*');
        const issues = [];
        for (const el of all) {
          const style = getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky') {
            const rect = el.getBoundingClientRect();
            if (rect.width > vpWidth) {
              issues.push({
                tag: el.tagName.toLowerCase(),
                position: style.position,
                width: Math.round(rect.width),
                overflow: Math.round(rect.width - vpWidth),
              });
            }
          }
        }
        return issues;
      }, ZOOMED_VIEWPORT.width);

      if (fixedSticky.length > 0) {
        console.log(`  ⚠ Fixed/sticky elements wider than viewport:`);
        for (const el of fixedSticky) {
          console.log(`    ${el.tag} (${el.position}) — width:${el.width}px, overflow:${el.overflow}px`);
        }
      }

      // --- 6. Screenshot ---
      const screenshotName = `reflow-${route.path.replace(/\//g, '_').replace(/^_/, '') || 'home'}`;
      await page.screenshot({
        path: `D:\\k-hub-booking-platform\\screenshots\\${screenshotName}.png`,
        fullPage: false,
      });
      console.log(`  Screenshot saved: screenshots/${screenshotName}.png`);

    } catch (err) {
      routeResult.error = err.message;
      console.log(`  ERROR: ${err.message}`);
    }

    results.push(routeResult);
  }

  await browser.close();

  // --- Summary Report ---
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY REPORT');
  console.log('='.repeat(70));

  const totalRoutes = results.length;
  const routesWithOverflow = results.filter(r => r.overflowDetected).length;
  const routesWithHiddenOverflow = results.filter(r => r.overflowXHidden).length;
  const routesWithClippedInteractive = results.filter(r => r.clippedInteractive.length > 0).length;
  const totalClippedInteractive = results.reduce((sum, r) => sum + r.clippedInteractive.length, 0);
  const totalOverflowingElements = results.reduce((sum, r) => sum + r.elementsAboveViewportWidth.length, 0);

  console.log(`\nRoutes tested: ${totalRoutes}`);
  console.log(`Routes with horizontal overflow (scrollWidth > clientWidth): ${routesWithOverflow}/${totalRoutes}`);
  console.log(`Routes with overflow-x:hidden masking: ${routesWithHiddenOverflow}/${totalRoutes}`);
  console.log(`Routes with clipped interactive elements: ${routesWithClippedInteractive}/${totalRoutes}`);
  console.log(`Total overflowing elements found: ${totalOverflowingElements}`);
  console.log(`Total clipped interactive elements: ${totalClippedInteractive}`);

  console.log('\n--- Per-Route Results ---');
  for (const r of results) {
    const status = r.error ? 'ERROR' : (r.overflowDetected ? 'FAIL' : 'PASS');
    const mask = r.overflowXHidden ? ' [MASKED by overflow-x:hidden]' : '';
    console.log(`\n  ${r.name} (${r.path}) — ${status}${mask}`);
    console.log(`    scrollWidth: ${r.scrollWidth} | clientWidth: ${r.clientWidth} | diff: ${r.scrollWidth - r.clientWidth}`);
    console.log(`    Overflowing elements: ${r.elementsAboveViewportWidth.length}`);
    console.log(`    Clipped interactive: ${r.clippedInteractive.length}`);
    if (r.error) {
      console.log(`    Error: ${r.error}`);
    }
  }

  console.log('\n--- Reflow Assessment ---');
  if (routesWithOverflow === 0 && routesWithClippedInteractive === 0) {
    console.log('✅ All pages reflow correctly at 200% zoom. No horizontal overflow or clipping.');
  } else {
    if (routesWithOverflow > 0) {
      console.log(`⚠ ${routesWithOverflow}/${totalRoutes} routes have horizontal overflow.`);
    }
    if (routesWithHiddenOverflow > 0) {
      console.log(`⚠ ${routesWithHiddenOverflow}/${totalRoutes} routes use overflow-x:hidden which may mask real issues.`);
      console.log('  Check screenshots for hidden content that users cannot scroll to.');
    }
    if (routesWithClippedInteractive > 0) {
      console.log(`❌ ${routesWithClippedInteractive}/${totalRoutes} routes have interactive elements clipped beyond viewport.`);
      console.log('  These elements are unreachable without horizontal scrolling (WCAG 1.4.10 violation).');
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  WCAG 1.4.10 Reflow: Content must reflow at 400% zoom (200% on 1280px = 640px viewport)');
  console.log('  PASS: No horizontal scrolling needed to access all content/functionality');
  console.log('  FAIL: Content requires horizontal scrolling or interactive elements are clipped');
  console.log('='.repeat(70));

  return results;
}

testReflow().catch(console.error);
