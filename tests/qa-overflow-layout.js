const { chromium } = require('playwright');

const PAGES = [
  { path: '/', name: 'Home' },
  { path: '/courts', name: 'Courts' },
  { path: '/courts/court-padel-1', name: 'Court Detail' },
  { path: '/book', name: 'Booking (no court)', seed: false },
  { path: '/book', name: 'Booking (with court)', seed: true },
  { path: '/bookings', name: 'My Bookings' },
  { path: '/sponsors', name: 'Sponsors' },
  { path: '/events', name: 'Events' },
  { path: '/about', name: 'About' },
  { path: '/contact', name: 'Contact' },
  { path: '/auth/login', name: 'Login' },
  { path: '/auth/register', name: 'Register' },
  { path: '/advertise', name: 'Advertise' },
  { path: '/membership', name: 'Membership' },
  { path: '/profile', name: 'Profile' },
  { path: '/notifications', name: 'Notifications' },
];

const VIEWPORTS = [
  [320, 568],   // iPhone SE
  [360, 640],   // Small Android
  [375, 812],   // iPhone X/11/12/13
  [390, 844],   // iPhone 14
  [414, 896],   // iPhone XR/11
  [430, 932],   // iPhone 14 Pro Max
  [768, 1024],  // iPad
  [1024, 768],  // iPad landscape / small desktop
];

const COURT_SEED = {
  state: {
    selectedCourt: { id:'court-padel-1', name:'Padel Court 1', type:'padel', image:'/images/courts/padel-1.jpg', pricePerHour:350, capacity:4, isIndoor:true, surface:'Artificial Turf', amenities:['Floodlights','Equipment Rental'], workingHours:{open:'07:00',close:'00:00'}, slotDurationMinutes:60, rating:4.8, reviews:45, description:'Professional padel court' },
    selectedDate: new Date().toISOString().split('T')[0], selectedSlots: [], bookingStep: 2, bookings: [],
    reservationStartTime: null, reservationExpiresAt: null, hasExtendedReservation: false,
    userName: '', userEmail: '', userPhone: '', maxHoursReachedTick: 0,
  }, version: 5,
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const issues = [];

  function logIssue(severity, page, viewport, category, detail) {
    issues.push({ severity, page, viewport, category, detail });
    const prefix = severity === 'CRITICAL' ? '🔴' : severity === 'HIGH' ? '🟠' : severity === 'MEDIUM' ? '🟡' : '🔵';
    console.log(`${prefix} [${severity}] ${page} @${viewport}px [${category}] ${detail}`);
  }

  for (const vp of VIEWPORTS) {
    const [w, h] = vp;
    const vpLabel = `${w}x${h}`;

    for (const pg of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();

      try {
        // Seed if needed
        if (pg.seed) {
          await page.goto('http://localhost:3000/', { waitUntil: 'load', timeout: 30000 });
          await page.waitForTimeout(300);
          await page.evaluate((s) => {
            localStorage.setItem('khub-booking-storage', JSON.stringify(s));
          }, COURT_SEED);
        }

        await page.goto(`http://localhost:3000${pg.path}`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(1200);

        // ── OVERFLOW CHECK ──
        const overflow = await page.evaluate(() => ({
          bodySW: document.body.scrollWidth,
          docSW: document.documentElement.scrollWidth,
          docCW: document.documentElement.clientWidth,
        }));
        const ovDiff = overflow.bodySW - overflow.docCW;
        if (ovDiff > 0) {
          logIssue(ovDiff > 10 ? 'CRITICAL' : ovDiff > 2 ? 'HIGH' : 'MEDIUM', pg.name, vpLabel, 'OVERFLOW', `body.scrollWidth=${overflow.bodySW} clientWidth=${overflow.docCW} overflow=${ovDiff}px`);
        }

        // ── IMAGE CHECK ──
        const images = await page.evaluate(() => {
          return [...document.querySelectorAll('img')].filter(img => img.offsetParent !== null).map(img => {
            const rect = img.getBoundingClientRect();
            const ratio = img.naturalWidth / img.naturalHeight;
            const displayRatio = rect.width / rect.height;
            const isBackgroundImg = img.closest('[style*="background"]') !== null;
            return {
              alt: img.alt?.substring(0, 30) || '(no alt)',
              src: img.src.split('/').pop()?.substring(0, 30),
              naturalW: img.naturalWidth, naturalH: img.naturalHeight,
              displayW: Math.round(rect.width), displayH: Math.round(rect.height),
              ratioDiff: Math.abs(ratio - displayRatio),
              isCropped: img.naturalWidth > 0 && (rect.width < img.naturalWidth * 0.3 || rect.height < img.naturalHeight * 0.3),
              missingDimensions: img.naturalWidth === 0 && img.naturalHeight === 0,
              right: Math.round(rect.right),
              bottom: Math.round(rect.bottom),
            };
          });
        });
        for (const img of images) {
          if (img.missingDimensions) {
            logIssue('HIGH', pg.name, vpLabel, 'IMAGE', `Broken image: alt="${img.alt}" src=${img.src}`);
          }
          if (img.isCropped && img.naturalW > 100) {
            logIssue('MEDIUM', pg.name, vpLabel, 'IMAGE', `Heavy crop: "${img.alt}" natural=${img.naturalW}x${img.naturalH} display=${img.displayW}x${img.displayH}`);
          }
          if (img.ratioDiff > 0.3 && img.naturalW > 50) {
            logIssue('MEDIUM', pg.name, vpLabel, 'IMAGE', `Aspect ratio distortion: "${img.alt}" ratioDiff=${img.ratioDiff.toFixed(2)}`);
          }
        }

        // ── TOUCH TARGET CHECK (mobile only) ──
        if (w <= 430) {
          const touchTargets = await page.evaluate(() => {
            const interactives = [...document.querySelectorAll('a, button, input, select, [role="button"], [onclick]')].filter(el => el.offsetParent !== null);
            return interactives.map(el => {
              const rect = el.getBoundingClientRect();
              return {
                tag: el.tagName,
                text: el.textContent?.trim().substring(0, 20),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
                type: el.type || '',
              };
            }).filter(el => el.w > 0 && el.h > 0);
          });
          const smallTargets = touchTargets.filter(t => t.h < 40 || t.w < 40);
          for (const t of smallTargets) {
            logIssue(t.h < 30 ? 'HIGH' : 'MEDIUM', pg.name, vpLabel, 'TOUCH', `Small target: "${t.text}" ${t.w}x${t.h}px (${t.tag}${t.type ? '['+t.type+']' : ''})`);
          }
        }

        // ── SPACING / VISUAL HIERARCHY ──
        const spacing = await page.evaluate(() => {
          const main = document.querySelector('main');
          const sections = main ? [...main.querySelectorAll('section')] : [];
          const issues = [];

          // Check for zero-height sections
          for (const sec of sections) {
            const rect = sec.getBoundingClientRect();
            if (rect.height < 5) {
              issues.push(`Zero-height section: "${sec.className?.substring(0, 40)}" h=${Math.round(rect.height)}`);
            }
          }

          // Check for overlapping fixed elements
          const fixed = [...document.querySelectorAll('[class*="fixed"], [class*="sticky"]')].filter(el => el.offsetParent !== null);
          const fixedRects = fixed.map(el => {
            const rect = el.getBoundingClientRect();
            return { tag: el.tagName, class: el.className?.substring(0, 40), top: Math.round(rect.top), left: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) };
          });
          for (let i = 0; i < fixedRects.length; i++) {
            for (let j = i + 1; j < fixedRects.length; j++) {
              const a = fixedRects[i], b = fixedRects[j];
              if (a.top < b.top + b.h && a.top + a.h > b.top && a.left < b.left + b.w && a.left + a.w > b.left) {
                issues.push(`Fixed elements overlap: "${a.class}" and "${b.class}"`);
              }
            }
          }

          return issues;
        });
        for (const s of spacing) {
          logIssue('MEDIUM', pg.name, vpLabel, 'SPACING', s);
        }

        // ── OVERFLOWING ELEMENTS (children sticking out) ──
        if (w <= 430) {
          const overflowing = await page.evaluate((viewportW) => {
            const results = [];
            const walk = (el, depth) => {
              if (depth > 15) return;
              const rect = el.getBoundingClientRect();
              if (rect.right > viewportW + 1 && el.children.length === 0) {
                results.push({
                  tag: el.tagName,
                  class: el.className?.substring?.(0, 50) || '',
                  text: el.textContent?.substring(0, 30),
                  right: Math.round(rect.right),
                  overflow: Math.round(rect.right - viewportW),
                });
              }
              for (const child of el.children) walk(child, depth + 1);
            };
            walk(document.body, 0);
            return results.slice(0, 5);
          }, w);
          for (const el of overflowing) {
            logIssue('HIGH', pg.name, vpLabel, 'OVERFLOW', `Element overflows: <${el.tag}> overflow=${el.overflow}px class="${el.class}" text="${el.text}"`);
          }
        }

        // ── Z-INDEX / ESCAPING ELEMENTS ──
        const escaping = await page.evaluate(() => {
          const fixed = [...document.querySelectorAll('[class*="fixed"], [class*="sticky"], [class*="z-50"], [class*="z-40"]')].filter(el => el.offsetParent !== null);
          return fixed.filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.right > window.innerWidth + 5 || rect.left < -5 || rect.bottom > window.innerHeight + 50;
          }).map(el => ({
            tag: el.tagName,
            class: el.className?.substring(0, 50),
            rect: el.getBoundingClientRect(),
          }));
        });
        for (const el of escaping) {
          logIssue('MEDIUM', pg.name, vpLabel, 'ESCAPE', `Element escapes viewport: <${el.tag}> class="${el.class}"`);
        }

      } catch (err) {
        logIssue('CRITICAL', pg.name, vpLabel, 'ERROR', `Page failed: ${err.message?.substring(0, 80)}`);
      }

      await ctx.close();
    }
  }

  // ── SUMMARY ──
  console.log('\n' + '═'.repeat(60));
  console.log('VISUAL QA SUMMARY');
  console.log('═'.repeat(60));
  const critical = issues.filter(i => i.severity === 'CRITICAL');
  const high = issues.filter(i => i.severity === 'HIGH');
  const medium = issues.filter(i => i.severity === 'MEDIUM');
  const low = issues.filter(i => i.severity === 'LOW');
  console.log(`CRITICAL: ${critical.length}  HIGH: ${high.length}  MEDIUM: ${medium.length}  LOW: ${low.length}`);
  console.log(`Total issues: ${issues.length}`);

  // Group by category
  const byCat = {};
  for (const i of issues) {
    byCat[i.category] = (byCat[i.category] || 0) + 1;
  }
  console.log('\nBy category:');
  for (const [cat, count] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  await browser.close();
})();
