const { chromium } = require('playwright');
const URL = 'http://localhost:3000';
const CHROME = 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  console.log(`Target date: ${tomorrow}`);

  // ── Helper ──
  const readStore = async () => {
    return await page.evaluate(() => {
      const raw = localStorage.getItem('khub-booking-storage');
      return raw ? JSON.parse(raw).state : null;
    });
  };

  // ══════════════════════════════════════════════════════
  // TEST 1: Does resetBookingFlow clear the bookings array?
  // ══════════════════════════════════════════════════════
  console.log('\n═══ TEST 1: resetBookingFlow vs bookings ═══');

  // Login first
  await page.goto(`${URL}/auth/login`);
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'alex.johnson@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log('[LOGIN] URL:', page.url());

  // Go to courts and click Book Now on first court
  await page.goto(`${URL}/courts`);
  await page.waitForTimeout(2000);

  // Use evaluate to click the first CourtCard's Book Now link
  const navResult = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href="/book"]');
    for (const link of links) {
      if (link.textContent?.includes('Book Now')) {
        link.click();
        return { clicked: true, text: link.textContent.trim() };
      }
    }
    return { clicked: false, linksFound: links.length };
  });
  console.log('[COURTS] Nav result:', JSON.stringify(navResult));
  await page.waitForTimeout(2000);
  console.log('[BOOK] URL:', page.url());

  // Check store
  let state = await readStore();
  console.log('[STORE] Court:', state?.selectedCourt?.name);
  console.log('[STORE] Date:', state?.selectedDate);
  console.log('[STORE] Bookings:', state?.bookings?.length);

  if (!state?.selectedCourt) {
    console.log('❌ Court not selected. Trying direct navigation with store set...');
    
    // Set store via page.evaluate - we need to interact with Zustand
    await page.goto(`${URL}/courts`);
    await page.waitForTimeout(2000);
    
    // Try clicking the Book Now button via Playwright (not evaluate)
    const bookBtn = page.locator('a[href="/book"]').filter({ hasText: 'Book Now' }).first();
    const isVisible = await bookBtn.isVisible();
    console.log('[COURTS] Book Now link visible:', isVisible);
    
    if (isVisible) {
      await bookBtn.click();
      await page.waitForTimeout(2000);
      console.log('[BOOK] URL after click:', page.url());
      
      state = await readStore();
      console.log('[STORE] Court:', state?.selectedCourt?.name);
      console.log('[STORE] Date:', state?.selectedDate);
    }
  }

  // If still no court, try the Navbar's Book Now button
  if (!state?.selectedCourt) {
    console.log('Trying Navbar Book Now...');
    await page.goto(`${URL}/`);
    await page.waitForTimeout(2000);
    
    const navBookBtn = page.locator('button:has-text("Book Now")').first();
    if (await navBookBtn.isVisible()) {
      await navBookBtn.click();
      await page.waitForTimeout(2000);
      console.log('[BOOK] URL after Navbar Book Now:', page.url());
      
      state = await readStore();
      console.log('[STORE] Court:', state?.selectedCourt?.name);
      console.log('[STORE] Date:', state?.selectedDate);
    }
  }

  if (!state?.selectedCourt) {
    console.log('\n❌ Could not select a court. Aborting.');
    await browser.close();
    return;
  }

  // ══════════════════════════════════════════════════════
  // TEST 2: Add a booking to the store and check slot status
  // ══════════════════════════════════════════════════════
  console.log('\n═══ TEST 2: Manually add booking, check slot ═══');

  const courtId = state.selectedCourt.id;
  const slotId = `slot-${courtId}-${tomorrow}-07:00`;
  console.log(`Court: ${state.selectedCourt.name} (${courtId})`);
  console.log(`Target slot: ${slotId}`);

  // Add a confirmed booking directly to localStorage
  await page.evaluate(({ courtId, tomorrow, slotId }) => {
    const raw = localStorage.getItem('khub-booking-storage');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const newBooking = {
      id: 'test-booking-1',
      bookingNumber: 'KH-TEST01',
      courtId,
      courtName: 'Test Court',
      courtImage: '/courts/padel-1.jpg',
      sportType: 'Padel',
      date: tomorrow,
      startTime: '07:00',
      endTime: '08:00',
      durationMinutes: 60,
      totalPrice: 500,
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
      userId: 'user-1',
      userName: 'Test User',
      userEmail: 'test@test.com',
      userPhone: '01012345678',
      selectedSlotIds: [slotId],
    };
    parsed.state.bookings = [newBooking];
    parsed.state.selectedDate = tomorrow;
    localStorage.setItem('khub-booking-storage', JSON.stringify(parsed));
  }, { courtId, tomorrow, slotId });

  // Reload to trigger rehydration
  await page.reload();
  await page.waitForTimeout(3000);

  // Read store after rehydration
  state = await readStore();
  console.log('[STORE] After reload - Bookings:', state?.bookings?.length);
  for (const b of state?.bookings || []) {
    console.log(`  Booking: id=${b.id} date=${b.date} status=${b.status} slotIds=${JSON.stringify(b.selectedSlotIds)}`);
  }

  // Check slot statuses on the page
  const slots = await page.evaluate(() => {
    const all = document.querySelectorAll('button[class*="slot-"]');
    return Array.from(all).map(b => ({
      text: b.textContent?.trim(),
      isBooked: b.className.includes('slot-booked'),
      isAvail: b.className.includes('slot-available'),
      isDisabled: b.hasAttribute('disabled'),
    }));
  });
  
  console.log(`[SLOTS] Total: ${slots.length}`);
  for (const s of slots) {
    const m = s.isBooked ? '❌ BOOKED' : s.isAvail ? '✅ AVAILABLE' : '???';
    console.log(`  ${m} | "${s.text}" | disabled=${s.isDisabled}`);
  }

  // ══════════════════════════════════════════════════════
  // TEST 3: Call resetBookingFlow and check if booking survives
  // ══════════════════════════════════════════════════════
  console.log('\n═══ TEST 3: resetBookingFlow should NOT clear bookings ═══');

  // Call resetBookingFlow via the store
  await page.evaluate(() => {
    const raw = localStorage.getItem('khub-booking-storage');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    // Simulate resetBookingFlow by setting the wizard fields
    parsed.state.selectedCourt = null;
    parsed.state.selectedDate = new Date().toISOString().split('T')[0];
    parsed.state.selectedSlots = [];
    parsed.state.bookingStep = 2;
    parsed.state.reservationStartTime = null;
    parsed.state.reservationExpiresAt = null;
    parsed.state.hasExtendedReservation = false;
    parsed.state.userName = '';
    parsed.state.userEmail = '';
    parsed.state.userPhone = '';
    // NOTE: bookings is NOT touched
    localStorage.setItem('khub-booking-storage', JSON.stringify(parsed));
  });

  // Reload
  await page.reload();
  await page.waitForTimeout(3000);

  state = await readStore();
  console.log('[STORE] After reset - Bookings:', state?.bookings?.length);
  for (const b of state?.bookings || []) {
    console.log(`  Booking: id=${b.id} date=${b.date} status=${b.status}`);
  }

  if (state?.bookings?.length > 0) {
    console.log('✅ Bookings SURVIVED resetBookingFlow (bookings array not touched)');
  } else {
    console.log('❌ Bookings were CLEARED! Bug in resetBookingFlow!');
  }

  // ══════════════════════════════════════════════════════
  // TEST 4: Select same court + date, check if slot is booked
  // ══════════════════════════════════════════════════════
  console.log('\n═══ TEST 4: After reset, re-select court+date → slot should be booked ═══');

  // Re-select the court
  await page.evaluate(({ courtId, tomorrow }) => {
    const raw = localStorage.getItem('khub-booking-storage');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    // Find the court from mock data
    const courts = [
      { id: 'court-padel-1', name: 'Pro Padel Center Arena 1', sportType: 'Padel', capacity: 4, pricePerHour: 500, isIndoor: true, image: '/courts/padel-1.jpg', status: 'Available', description: 'Professional padel court' },
      { id: 'court-padel-2', name: 'Pro Padel Center Arena 2', sportType: 'Padel', capacity: 4, pricePerHour: 450, isIndoor: true, image: '/courts/padel-2.jpg', status: 'Available', description: 'Professional padel court' },
      { id: 'court-football-1', name: 'Champions Football Pitch', sportType: 'Football', capacity: 14, pricePerHour: 800, isIndoor: false, image: '/courts/football-1.jpg', status: 'Available', description: 'Full-size football pitch' },
      { id: 'court-tennis-1', name: 'Ace Tennis Court', sportType: 'Tennis', capacity: 4, pricePerHour: 350, isIndoor: false, image: '/courts/tennis-1.jpg', status: 'Available', description: 'Championship tennis court' },
    ];
    const court = courts.find(c => c.id === courtId);
    if (court) {
      parsed.state.selectedCourt = court;
      parsed.state.selectedDate = tomorrow;
      parsed.state.selectedSlots = [];
      parsed.state.bookingStep = 2;
    }
    localStorage.setItem('khub-booking-storage', JSON.stringify(parsed));
  }, { courtId, tomorrow });

  // Reload to trigger re-render
  await page.reload();
  await page.waitForTimeout(3000);

  // Now navigate to the correct court/date on the page
  // First check what's on the page
  const pageInfo = await page.evaluate(() => {
    const headings = document.querySelectorAll('h2, h3');
    return Array.from(headings).map(h => h.textContent?.trim()).filter(Boolean);
  });
  console.log('[PAGE] Headings:', pageInfo);

  // Check slots
  const slots2 = await page.evaluate(() => {
    const all = document.querySelectorAll('button[class*="slot-"]');
    return Array.from(all).map(b => ({
      text: b.textContent?.trim(),
      isBooked: b.className.includes('slot-booked'),
      isAvail: b.className.includes('slot-available'),
      isDisabled: b.hasAttribute('disabled'),
    }));
  });
  
  console.log(`[SLOTS] Total: ${slots2.length}`);
  for (const s of slots2) {
    const m = s.isBooked ? '❌ BOOKED' : s.isAvail ? '✅ AVAILABLE' : '???';
    console.log(`  ${m} | "${s.text}" | disabled=${s.isDisabled}`);
  }

  // ══════════════════════════════════════════════════════
  // TEST 5: Logout → check bookings still exist → check slots
  // ══════════════════════════════════════════════════════
  console.log('\n═══ TEST 5: Logout flow ═══');

  // Logout via the Sign Out button
  const signOut = page.locator('button[aria-label="Sign out"]');
  const soCount = await signOut.count();
  console.log(`[LOGOUT] Sign out buttons: ${soCount}`);
  
  if (soCount > 0) {
    await signOut.first().click();
    await page.waitForTimeout(2000);
  }

  state = await readStore();
  const authState = await page.evaluate(() => {
    const raw = localStorage.getItem('khub-auth-storage');
    return raw ? JSON.parse(raw).state : null;
  });
  console.log(`[AFTER LOGOUT] Auth: user=${authState?.user?.name}, isAuth=${authState?.isAuthenticated}`);
  console.log(`[AFTER LOGOUT] Bookings: ${state?.bookings?.length}`);
  
  for (const b of state?.bookings || []) {
    console.log(`  Booking: ${b.id} date=${b.date} status=${b.status} userId=${b.userId}`);
  }

  if (state?.bookings?.length > 0) {
    console.log('✅ Bookings survived logout');
  } else {
    console.log('❌ BUG: Bookings cleared during logout!');
  }

  // Navigate to courts → book → same court, tomorrow
  await page.goto(`${URL}/courts`);
  await page.waitForTimeout(2000);
  
  const navLink = page.locator('a[href="/book"]').filter({ hasText: 'Book Now' }).first();
  if (await navLink.isVisible()) {
    await navLink.click();
    await page.waitForTimeout(2000);
  }

  // Select tomorrow's date (the date button)
  const tomorrowNum = new Date(Date.now() + 86400000).getDate().toString();
  await page.evaluate((num) => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent || '';
      if (text.includes(num) && btn.closest('[class*="flex"][class*="gap-"]')) {
        btn.click();
        break;
      }
    }
  }, tomorrowNum);
  await page.waitForTimeout(1000);

  // Final slot check
  const finalSlots = await page.evaluate(() => {
    const all = document.querySelectorAll('button[class*="slot-"]');
    return Array.from(all).map(b => ({
      text: b.textContent?.trim(),
      isBooked: b.className.includes('slot-booked'),
      isAvail: b.className.includes('slot-available'),
    }));
  });
  
  console.log(`\n[FINAL] Slots after logout re-select:`);
  for (const s of finalSlots) {
    const m = s.isBooked ? '❌ BOOKED' : s.isAvail ? '✅ AVAILABLE' : '???';
    console.log(`  ${m} | "${s.text}"`);
  }

  // ══════════════════════════════════════════════════════
  // FINAL VERDICT
  // ══════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════════════');
  const sevenAmSlot = finalSlots.find(s => s.text?.includes('7:00'));
  if (sevenAmSlot?.isBooked) {
    console.log('✅ PASS: 7:00 AM slot is BOOKED after logout (availability is global)');
  } else if (sevenAmSlot?.isAvail) {
    console.log('❌ FAIL: 7:00 AM slot is AVAILABLE after logout — BUG CONFIRMED');
  } else {
    console.log('⚠️  7:00 AM slot not in view. Checking store directly...');
    state = await readStore();
    console.log(`  Store bookings: ${state?.bookings?.length}`);
    const hasBooking = state?.bookings?.some(b => b.selectedSlotIds?.includes(`slot-${courtId}-${tomorrow}-07:00`));
    console.log(`  Has 7AM booking in store: ${hasBooking}`);
  }
  console.log('════════════════════════════════════════════════════');

  await browser.close();
})();
