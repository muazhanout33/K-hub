/* Probe: BottomNav visibility + availability interactions at 390px. */
import { chromium } from 'playwright';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);

const nav = await page.evaluate(() => {
  const el = document.querySelector('nav[aria-label="Mobile primary navigation"]');
  if (!el) return { exists: false };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    exists: true,
    display: cs.display,
    position: cs.position,
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    visible: cs.display !== 'none' && r.width > 0 && r.height > 0,
    inViewport: r.y >= 0 && r.y < window.innerHeight,
    scrollY: window.scrollY,
    innerH: window.innerHeight,
  };
});
console.log('BOTTOMNAV:', JSON.stringify(nav, null, 1));
await page.screenshot({ path: 'recovery-shots/probe-390-viewport.png' }); // viewport shot, top of page
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(600);
await page.screenshot({ path: 'recovery-shots/probe-390-bottom.png' });

// Availability interactions: what buttons exist in the availability section?
const avail = await page.evaluate(() => {
  const section = document.querySelector('[data-availability-section]') ||
    Array.from(document.querySelectorAll('section, div')).find((s) =>
      (s.textContent || '').includes('LIVE TIME SCHEDULE') && (s.textContent || '').includes('Available'),
    );
  if (!section) return { found: false };
  const buttons = Array.from(section.querySelectorAll('button')).slice(0, 30).map((b) => ({
    text: (b.textContent || '').trim().slice(0, 40),
    disabled: b.disabled,
    aria: b.getAttribute('aria-label'),
  }));
  return { found: true, buttonCount: buttons.length, buttons };
});
console.log('AVAILABILITY:', JSON.stringify(avail, null, 1));

await browser.close();
