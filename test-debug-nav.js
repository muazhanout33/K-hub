const { chromium } = require('playwright');
const URL = 'http://localhost:3000';
const CHROME = 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  console.log(`Tomorrow: ${tomorrow}`);

  // ── Helper: read store from localStorage ──
  const readBookingStore = async () => {
    return await page.evaluate(() => {
      const raw = localStorage.getItem('khub-booking-storage');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.state || null;
    });
  };

  const readAuthStore = async () => {
    return await page.evaluate(() => {
      const raw = localStorage.getItem('khub-auth-storage');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.state || null;
    });
  };

  // ── PHASE 1: Login ──
  console.log('\n===== PHASE 1: LOGIN user-1 =====');
  await page.goto(`${URL}/auth/login`);
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'alex.johnson@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  const authAfterLogin = await readAuthStore();
  console.log(`[LOGIN] user: ${authAfterLogin?.user?.name}, isAuth: ${authAfterLogin?.isAuthenticated}`);

  // ── PHASE 2: Navigate to courts, click Book Now ──
  console.log('\n===== PHASE 2: BOOK A SLOT =====');
  await page.goto(`${URL}/courts`);
  await page.waitForTimeout(2000);
  
  // Find and click "Book Now" on first court card
  const bookLinks = page.locator('a:has-text("Book Now"), button:has-text("Book Now")');
  const bookCount = await bookLinks.count();
  console.log(`[COURTS] Book Now buttons: ${bookCount}`);
  
  if (bookCount > 0) {
    await bookLinks.first().click();
    await page.waitForTimeout(2000);
    console.log(`[COURTS] After click URL: ${page.url()}`);
  }

  // Check if we're on /book with a court selected
  const storeState = await readBookingStore();
  console.log(`[STORE] Court: ${storeState?.selectedCourt?.name}, Date: ${storeState?.selectedDate}`);
  
  if (!storeState?.selectedCourt) {
    console.log('[STORE] No court selected! Setting first court via evaluate...');
    await page.evaluate(() => {
      // Import courts from mock data
      const courts = [
        { id: 'court-padel-1', name: 'Pro Padel Center Arena 1', sportType: 'Padel', capacity: 4, pricePerHour: 500, isIndoor: true, image: '/courts/padel-1.jpg' },
      ];
      // We need to access the store - try through window or direct state manipulation
      const raw = localStorage.getItem('khub-booking-storage');
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.state.selectedCourt = courts[0];
        parsed.state.selectedDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        localStorage.setItem('khub-booking-storage', JSON.stringify(parsed));
      }
    });
    await page.reload();
    await page.waitForTimeout(2000);
  }

  // ── Check current state ──
  const state2 = await readBookingStore();
  console.log(`[STORE] Court: ${state2?.selectedCourt?.name}, Date: ${state2?.selectedDate}`);
  
  // Check slots
  const slotInfo = await page.evaluate(() => {
    const all = document.querySelectorAll('button[class*="slot-"]');
    return Array.from(all).map(b => ({
      text: b.textContent?.trim(),
      isBooked: b.className.includes('slot-booked'),
      isAvail: b.className.includes('slot-available'),
      disabled: b.hasAttribute('disabled'),
    }));
  });
  console.log(`[SLOTS] Total: ${slotInfo.length}`);
  for (const s of slotInfo) {
    const m = s.isBooked ? '❌' : s.isAvail ? '✅' : '???';
    console.log(`  ${m} "${s.text}" disabled=${s.disabled}`);
  }

  if (slotInfo.length === 0) {
    console.log('\n⚠️  No slots rendered. The court may not be selected. Trying different approach...');
    
    // Navigate to courts page and click the actual court card's "Book Now" link
    await page.goto(`${URL}/courts`);
    await page.waitForTimeout(2000);
    
    // Log all links and buttons on the page
    const allLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      return Array.from(links).map(l => ({ text: l.textContent?.trim(), href: l.href })).filter(l => l.href.includes('book'));
    });
    console.log(`[COURTS] Book-related links:`, JSON.stringify(allLinks));
    
    // Click the first link that goes to /book or /courts
    for (const link of allLinks) {
      if (link.href.includes('/book')) {
        console.log(`[COURTS] Navigating to: ${link.href}`);
        await page.goto(link.href);
        await page.waitForTimeout(2000);
        break;
      }
    }
    
    const state3 = await readBookingStore();
    console.log(`[STORE] Court: ${state3?.selectedCourt?.name}, Date: ${state3?.selectedDate}`);
  }

  await browser.close();
  console.log('\nDone.');
})();
