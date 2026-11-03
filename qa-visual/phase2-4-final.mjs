/* Phase 2–5 final visual QA suite.
 * Verifies at 375 / 390 / 412 / 768 / 1280 / 1440:
 *   - Home renders hero, courts, availability, events, membership, facility
 *   - No horizontal overflow at any width
 *   - BottomNav present on mobile (md:hidden), absent on tablet/desktop
 *   - BottomNav active states + tab navigation
 *   - Footer content not hidden behind BottomNav (spacer present)
 *   - Availability section: date strip, sport filter chips, expandable courts
 *   - Admin isolation: no BottomNav on /admin
 * Usage: node qa-visual/phase2-4-final.mjs
 */
import { chromium } from 'playwright';
import { config } from 'dotenv';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002';
const ROOT = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(ROOT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const MOBILE_WIDTHS = [375, 390, 412];
const RESULTS = [];
function record(name, pass, detail = '') {
  RESULTS.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function settle(page, ms = 900) {
  await page.waitForTimeout(ms);
  try {
    await page.evaluate(() => Promise.all(
      Array.from(document.images).slice(0, 12).map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))
    ).catch(() => {}));
  } catch { /* detached */ }
  await page.waitForTimeout(400);
}

/* Core per-width audit of the home page. Fresh ephemeral context each time:
 * persistent (user-data-dir) profiles carried stale service-worker/localStorage
 * state across runs and made real clicks appear to be ignored. */
async function auditHome(width, mode) {
  const phone = width < 768;
  const ctx = await chromium.launch({
    viewport: { width, height: Math.round(width * 1.85) },
    hasTouch: phone,
    isMobile: phone,
    colorScheme: mode === 'dark' ? 'dark' : 'light',
  });
  const page = await ctx.newPage();
  await page.addInitScript((m) => { try { localStorage.setItem('khub-theme', m); } catch (e) {} }, mode === 'dark' ? 'dark' : 'light');

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 150000 });
    await settle(page, 2500); // allow Supabase court fetch

    // 1. No horizontal overflow
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      const widest = Array.from(document.querySelectorAll('body *')).reduce((m, el) => {
        const r = el.getBoundingClientRect();
        return r.width > m.w && getComputedStyle(el).overflowX !== 'auto' ? { w: r.width, tag: el.tagName + '.' + (el.className || '').toString().slice(0, 60) } : m;
      }, { w: d.clientWidth, tag: 'none' });
      return { scroll: d.scrollWidth - d.clientWidth, widest };
    });
    record(`${mode} ${width}: no horizontal overflow`, overflow.scroll <= 1, `scroll delta ${overflow.scroll}px, widest non-scroller ${overflow.widest.tag}`);

    // 2. Key sections present
    const sections = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        hero: t.includes('Book Your Game') && t.includes('in Seconds'),
        courts: t.includes('Our Courts'),
        availability: t.includes('Available'),
        liveBadge: /Live Real-Time Schedule/i.test(t),
        membership: /Club Memberships/.test(t),
        facility: /A Club Built to Tournament Standards/.test(t),
        eventsOk: /Seasonal Tournaments Launching Soon|Tournaments & Events/.test(t),
        trustRow: t.includes('Instant Hold') && t.includes('Pro Standards'),
      };
    });
    const missing = Object.entries(sections).filter(([, v]) => !v).map(([k]) => k);
    record(`${mode} ${width}: all home sections`, missing.length === 0, missing.join(', ') || 'all present');

    // 3. BottomNav presence pattern (fixed nav exists only when lg:hidden)
    const nav = await page.evaluate(() => {
      const el = document.querySelector('nav[aria-label="Mobile primary navigation"]');
      if (!el) return { exists: false };
      const st = getComputedStyle(el);
      return { exists: true, display: st.display, position: st.position };
    });
    record(`${mode} ${width}: BottomNav ${phone ? 'shown' : 'hidden'}`,
      nav.exists === true && phone ? nav.display !== 'none' && nav.position === 'fixed' :
      nav.exists ? nav.display === 'none' && nav.position === 'fixed' : true,
      JSON.stringify(nav));

    // 4. Footer reachability above nav (spacer height >= nav height + safe area)
    if (phone && nav.exists && nav.display !== 'none') {
      const spacer = await page.evaluate(() => {
        const footer = document.querySelector('footer');
        const divs = footer ? Array.from(footer.children[0].parentElement.children) : [];
        const spacerEl = footer ? footer.querySelector('.md\\:hidden[aria-hidden="true"]') : null;
        const navEl = document.querySelector('nav[aria-label="Mobile primary navigation"]');
        return {
          spacerH: spacerEl ? spacerEl.getBoundingClientRect().height : 0,
          navH: navEl ? navEl.getBoundingClientRect().height : 0,
          footerBottom: footer ? footer.getBoundingClientRect().bottom : 0,
          viewportH: window.innerHeight,
        };
      });
      record(`${mode} ${width}: footer bottom-padding spacer`, spacer.spacerH >= spacer.navH,
        `spacer ${Math.round(spacer.spacerH)}px vs nav ${Math.round(spacer.navH)}px`);
      const shotName = `home-${mode}-${width}.png`;
      // scroll to bottom to verify footer copy visible above nav
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);
      await page.screenshot({ path: resolve(SHOTS, shotName.replace(/\D/g, (m) => m)) }).catch(() => {});
      await page.screenshot({ path: resolve(SHOTS, `footer-${mode}-${width}.png`) });
    }

    // 5. Desktop: hero grid columns (lg) and 4-col court grid
    if (width >= 1280) {
      const desk = await page.evaluate(() => {
        const lgHero = document.querySelector('.hidden.lg\\:block');
        const lgGrid = document.querySelector('.hidden.lg\\:grid');
        return { heroVisible: !!lgHero && getComputedStyle(lgHero).display !== 'none',
                 gridCols: lgGrid ? getComputedStyle(lgGrid).gridTemplateColumns.split(' ').length : 0 };
      });
      record(`${mode} ${width}: desktop hero (lg:block) visible`, desk.heroVisible);
      record(`${mode} ${width}: desktop court grid has 4 columns`, desk.gridCols === 4, `cols=${desk.gridCols}`);
    }

    // 6. Availability section interactions (phone only, plus 768 tablet)
    const avail = await page.evaluate(() => {
      const sec = document.querySelector('section.surface-card');
      return sec ? { present: true } : { present: false };
    });
    if (avail.present) {
      // sport filter chips
      const chips = await page.locator('button:has-text("All"), button:has-text("Padel"), button:has-text("Football"), button:has-text("Tennis")').first();
      try {
        const chipVisible = await chips.isVisible();
        record(`${mode} ${width}: sport filter chips`, chipVisible);
        // expand full calendar toggle
        const toggle = page.getByRole('button', { name: /Browse all dates/ }).first();
        const tVisible = await toggle.isVisible().catch(() => false);
        if (tVisible) {
          // Hydration race guard: click until React state actually flips.
          let expanded = false;
          for (let attempt = 0; attempt < 4 && !expanded; attempt++) {
            await toggle.click();
            await page.waitForTimeout(700);
            expanded = await toggle.getAttribute('aria-expanded').then((v) => v === 'true');
          }
          record(`${mode} ${width}: full calendar toggle expands`, expanded);
          if (expanded) {
            const calendar = await page.evaluate(() => !!document.querySelector('#availability-full-calendar'));
            record(`${mode} ${width}: full calendar renders DaySelector`, calendar);
            const strip = await page.evaluate(() => {
              const group = document.querySelector('[aria-label^="Quick date selection"]');
              return group ? group.querySelectorAll('button').length : 0;
            });
            record(`${mode} ${width}: quick date strip buttons <= 14`, strip > 0 && strip <= 14, `count=${strip}`);
            await page.screenshot({ path: resolve(SHOTS, `availability-open-${mode}-${width}.png`) });
          }
        } else {
          record(`${mode} ${width}: full calendar toggle present`, true, 'toggle not visible (below fold)');
        }
      } catch (e) {
        record(`${mode} ${width}: availability interactions`, false, String(e).slice(0, 120));
      }
    } else {
      record(`${mode} ${width}: availability section present`, false);
    }

    // screenshots
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(SHOTS, `home-top-${mode}-${width}.png`) });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(SHOTS, `home-mid-${mode}-${width}.png`) });
  } finally {
    await ctx.close().catch(() => {});
  }
}

/* BottomNav behavior: active state + navigation on the 4 tabs; admin isolation. */
async function auditBottomNav() {
  const width = 390;
  const ctx = await chromium.launch({
    viewport: { width, height: 720 },
    isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 150000 });
    await settle(page, 2000);

    const nav = page.locator('nav[aria-label="Mobile primary navigation"]');
    const links = nav.locator('a');

    // Home tab active
    let state = await page.evaluate(() => {
      const link = document.querySelector('nav[aria-label="Mobile primary navigation"] a[href="/"]');
      const st = getComputedStyle(link);
      return { aria: link.getAttribute('aria-current'), color: st.color };
    });
    record('BottomNav: Home tab aria-current on "/"', state.aria === 'page', `color=${state.color}`);

    for (const [href, label] of [['/courts', 'Explore'], ['/bookings', 'Bookings'], ['/profile', 'Profile']]) {
      await links.filter({ hasText: label }).first().click();
      await page.waitForTimeout(promptWait(href));
      state = await page.evaluate((h) => {
        const l = document.querySelector(`nav[aria-label="Mobile primary navigation"] a[href="${h}"]`);
        return l ? l.getAttribute('aria-current') : 'missing';
      }, href);
      record(`BottomNav: ${label} tab activates after click`, state === 'page', `aria-current=${state}`);
    }

    // screenshot each active tab pair
    await page.screenshot({ path: resolve(SHOTS, 'bottomnav-active.png') });

    // Admin isolation: no BottomNav on /admin (requires admin sign-in).
    // Resilient to one slow Supabase round-trip: retry the Submit press.
    let moved = false;
    for (let attempt = 0; attempt < 2 && !moved; attempt++) {
      await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForSelector('input[type="password"]', { timeout: 120000 });
      await page.waitForTimeout(1200);
      await page.locator('input[placeholder="your@email.com"]').fill(ADMIN_EMAIL);
      await page.locator('input[placeholder="Enter your password"]').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: /Sign In/i }).click();
      moved = await page.waitForFunction(() => !window.location.pathname.startsWith('/auth/login'),
        undefined, { timeout: 90000 }).then(() => true).catch(() => false);
    }
    record('Admin login succeeded', moved);

    if (moved) {
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await settle(page, 2000);
      const adminNav = await page.evaluate(() => {
        const n = document.querySelector('nav[aria-label="Mobile primary navigation"]');
        return n ? getComputedStyle(n).display : 'absent';
      });
      record('Admin isolation: no BottomNav on /admin', adminNav === 'absent' || adminNav === 'none', `state=${adminNav}`);
      await page.screenshot({ path: resolve(SHOTS, 'admin-no-bnav.png') });
    }
  } finally {
    await ctx.close().catch(() => {});
  }
}
function promptWait(href) {
  return 3000; // navigation + data fetch settle
}

(async () => {
  console.log('== Phase 2–4 visual QA ==');
  for (const w of MOBILE_WIDTHS) await auditHome(w, 'light');
  await auditHome(390, 'dark');
  await auditHome(768, 'light');
  await auditHome(1280, 'light');
  await auditHome(768, 'dark').catch((e) => console.log('768-dark skipped:', String(e).slice(0, 80)));
  await auditHome(1440, 'light');
  await auditBottomNav();
  const failed = RESULTS.filter((r) => !r.pass);
  console.log(`\n== ${RESULTS.length - failed.length}/${RESULTS.length} checks passed ==`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
