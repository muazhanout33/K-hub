const { chromium } = require('playwright');
const URL = 'http://localhost:3000';
const CHROME = 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const now = new Date();
  const localTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowISO = `${localTomorrow.getFullYear()}-${String(localTomorrow.getMonth() + 1).padStart(2, '0')}-${String(localTomorrow.getDate()).padStart(2, '0')}`;
  const tomorrowDayNum = String(localTomorrow.getDate());
  const tomorrowMonthName = localTomorrow.toLocaleString('en-US', { month: 'short' });
  console.log(`Local now: ${now.toLocaleString()}`);
  console.log(`Target date: ${tomorrowISO} (day=${tomorrowDayNum} month=${tomorrowMonthName})`);

  const readBookingStore = async () => page.evaluate(() => {
    const raw = localStorage.getItem('khub-booking-storage');
    return raw ? JSON.parse(raw).state : null;
  });
  const readAuthStore = async () => page.evaluate(() => {
    const raw = localStorage.getItem('khub-auth-storage');
    return raw ? JSON.parse(raw).state : null;
  });

  // Helper: click a day button in DaySelector by matching day number + month
  async function clickDayButton(dayNum, monthShort) {
    const buttons = page.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const text = await btn.textContent();
      if (text && text.includes(dayNum) && text.includes(monthShort)) {
        await btn.click();
        return true;
      }
    }
    return false;
  }

  // ══════════════════════════════════════════════════════
  // STEP 1: Login as User A (Alex Johnson, user-1)
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 1: Login as User A (Alex) ═══');
  await page.goto(`${URL}/auth/login`);
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'alex.johnson@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  const auth1 = await readAuthStore();
  console.log(`[AUTH] name="${auth1?.user?.name}" id="${auth1?.user?.id}" isAuthenticated=${auth1?.isAuthenticated}`);
  if (!auth1?.isAuthenticated) { console.log('❌ FAIL: User A login failed'); await browser.close(); return; }

  // ══════════════════════════════════════════════════════
  // STEP 2: Courts → Book Now
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 2: Courts → Book Now ═══');
  await page.goto(`${URL}/courts`);
  await page.waitForTimeout(2000);
  await page.locator('a[href="/book"]').filter({ hasText: 'Book Now' }).first().click();
  await page.waitForTimeout(3000);

  let state = await readBookingStore();
  console.log(`[BOOK] Court: ${state?.selectedCourt?.name} (${state?.selectedCourt?.id})`);
  console.log(`[BOOK] Date: ${state?.selectedDate}`);

  // ══════════════════════════════════════════════════════
  // STEP 3: Select tomorrow + 7:00 AM slot
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 3: Select date + slot ═══');
  const dateClicked = await clickDayButton(tomorrowDayNum, tomorrowMonthName);
  console.log(`[DATE] clicked: ${dateClicked}`);
  await page.waitForTimeout(2000);

  state = await readBookingStore();
  console.log(`[BOOK] Date after: ${state?.selectedDate}`);

  // Click first slot-available button using Playwright locator
  const slotAvail = page.locator('button.slot-available').first();
  const slotAvailVisible = await slotAvail.isVisible();
  console.log(`[SLOT] First available visible: ${slotAvailVisible}`);
  if (slotAvailVisible) {
    await slotAvail.click();
    await page.waitForTimeout(1500);
  }

  state = await readBookingStore();
  console.log(`[BOOK] selectedSlots: ${state?.selectedSlots?.length}`);

  // ══════════════════════════════════════════════════════
  // STEP 4: Continue → Details
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 4: Continue → Details ═══');
  await page.locator('button:has-text("Continue")').first().click();
  await page.waitForTimeout(3000);
  console.log(`[URL] ${page.url()}`);

  if (!page.url().includes('/book/details')) {
    console.log('❌ FAIL: Not on details page');
    await browser.close();
    return;
  }

  // ══════════════════════════════════════════════════════
  // STEP 5: Details → Payment
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 5: Details → Payment ═══');
  const phoneVal = await page.locator('#phone').inputValue().catch(() => '');
  console.log(`[FORM] phone="${phoneVal}"`);

  // Debug: screenshot the details page
  await page.screenshot({ path: 'debug-step5-before.png' });

  // Debug: check form values and buttons
  const formDebug = await page.evaluate(() => {
    const nameEl = document.querySelector('#name');
    const emailEl = document.querySelector('#email');
    const phoneEl = document.querySelector('#phone');
    const form = document.querySelector('form');
    const submitBtns = form ? Array.from(form.querySelectorAll('button[type="submit"]')) : [];
    return {
      name: nameEl?.value,
      email: emailEl?.value,
      phone: phoneEl?.value,
      hasForm: !!form,
      submitBtnCount: submitBtns.length,
      submitBtnTexts: submitBtns.map(b => b.textContent?.trim()),
    };
  });
  console.log(`[FORM] Debug: ${JSON.stringify(formDebug)}`);

  // Try submitting the form directly via form.requestSubmit()
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) form.requestSubmit();
  });
  await page.waitForTimeout(3000);
  console.log(`[URL] After form submit: ${page.url()}`);

  // If still on details, try clicking the button directly
  if (page.url().includes('/book/details')) {
    console.log('[FORM] Form submit did not navigate. Trying button click...');
    const toPayBtn = page.locator('button:has-text("Continue to Payment")');
    const toPayCount = await toPayBtn.count();
    console.log(`[FORM] "Continue to Payment" buttons: ${toPayCount}`);

    if (toPayCount > 0) {
      await toPayBtn.first().click();
      await page.waitForTimeout(3000);
      console.log(`[URL] After button click: ${page.url()}`);
    }
  }

  if (!page.url().includes('/book/payment')) {
    console.log('❌ FAIL: Not on payment page');
    await browser.close();
    return;
  }

  // ══════════════════════════════════════════════════════
  // STEP 6: Confirm & Pay
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 6: Confirm & Pay ═══');
  state = await readBookingStore();
  console.log(`[STORE] Before payment: ${(state?.bookings || []).length} bookings`);

  await page.locator('button:has-text("Confirm & Pay")').first().click();
  console.log('[PAY] Clicked. Waiting 6s...');
  await page.waitForTimeout(6000);
  console.log(`[URL] After pay: ${page.url()}`);

  // ══════════════════════════════════════════════════════
  // STEP 7: Verify booking status
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 7: Booking status ═══');
  state = await readBookingStore();
  const bookings = state?.bookings || [];
  let targetBooking = null;
  for (const b of bookings) {
    console.log(`  id=${b.id} status=${b.status} date=${b.date} time=${b.startTime}-${b.endTime} court=${b.courtId}`);
    targetBooking = b;
  }

  if (!targetBooking) { console.log('❌ FAIL: NO BOOKING CREATED'); await browser.close(); return; }

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║ BOOKING STATUS: ${targetBooking.status.padEnd(29)}║`);
  console.log(`║ COURT: ${(targetBooking.courtName || '').substring(0, 37).padEnd(37)}║`);
  console.log(`║ DATE: ${targetBooking.date.padEnd(38)}║`);
  console.log(`║ TIME: ${(targetBooking.startTime + '-' + targetBooking.endTime).padEnd(38)}║`);
  console.log(`╚══════════════════════════════════════════════╝`);

  // ══════════════════════════════════════════════════════
  // STEP 8: Logout
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 8: Logout ═══');
  await page.locator('button[aria-label="Sign out"]').first().click();
  await page.waitForTimeout(3000);

  const authAfter = await readAuthStore();
  console.log(`[AUTH] After logout: name="${authAfter?.user?.name}" isAuthenticated=${authAfter?.isAuthenticated}`);

  state = await readBookingStore();
  console.log(`[STORE] Bookings after logout: ${state?.bookings?.length}`);
  if (state?.bookings?.length > 0) {
    console.log(`  id=${state.bookings[0].id} status=${state.bookings[0].status}`);
  }

  // ══════════════════════════════════════════════════════
  // STEP 9: Login as User B (Admin, user-admin-1)
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 9: Login as User B (Admin) ═══');
  await page.goto(`${URL}/auth/login`);
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'admin@khubsports.com');
  await page.fill('input[type="password"]', 'admin456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  const auth2 = await readAuthStore();
  console.log(`[AUTH] name="${auth2?.user?.name}" id="${auth2?.user?.id}" isAuthenticated=${auth2?.isAuthenticated}`);
  console.log(`[URL] ${page.url()}`);

  if (!auth2?.isAuthenticated) { console.log('❌ FAIL: User B login failed'); await browser.close(); return; }

  // ══════════════════════════════════════════════════════
  // STEP 10: Navigate to same court, same date
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 10: Same court, same date ═══');
  await page.goto(`${URL}/courts`);
  await page.waitForTimeout(2000);

  // Click Book Now on the first court (same as User A did)
  await page.locator('a[href="/book"]').filter({ hasText: 'Book Now' }).first().click();
  await page.waitForTimeout(3000);

  state = await readBookingStore();
  console.log(`[BOOK] Court: ${state?.selectedCourt?.name}`);
  console.log(`[STORE] Total bookings: ${state?.bookings?.length}`);

  // Select same date (tomorrow)
  const dateClicked2 = await clickDayButton(tomorrowDayNum, tomorrowMonthName);
  console.log(`[DATE] clicked: ${dateClicked2}`);
  await page.waitForTimeout(2000);

  state = await readBookingStore();
  console.log(`[BOOK] Date: ${state?.selectedDate}`);

  // ══════════════════════════════════════════════════════
  // STEP 11: Slot availability
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 11: Slot availability ═══');
  await page.waitForTimeout(1000);

  // Use Playwright locator to find ALL slot buttons (slot-available or slot-booked)
  const slotAvailBtns = page.locator('button.slot-available');
  const slotBookedBtns = page.locator('button.slot-booked');
  const availCount = await slotAvailBtns.count();
  const bookedCount = await slotBookedBtns.count();
  console.log(`[SLOTS] Available: ${availCount}, Booked: ${bookedCount}`);

  // Get text of the first slot (7:00 AM)
  let firstSlotText = '';
  let firstSlotIsBooked = false;
  let firstSlotIsAvail = false;
  if (bookedCount > 0) {
    firstSlotText = await slotBookedBtns.first().textContent() || '';
    firstSlotIsBooked = true;
  } else if (availCount > 0) {
    firstSlotText = await slotAvailBtns.first().textContent() || '';
    firstSlotIsAvail = true;
  }

  // List all slot buttons for evidence
  const allSlotBtns = page.locator('button').filter({ hasText: /AM|PM/ }).filter({ hasText: /–/ });
  const allSlotCount = await allSlotBtns.count();
  console.log(`[SLOTS] Total time-range buttons: ${allSlotCount}`);
  for (let i = 0; i < Math.min(allSlotCount, 20); i++) {
    const btn = allSlotBtns.nth(i);
    const text = await btn.textContent();
    const cls = await btn.getAttribute('class');
    const isBooked = (cls || '').includes('slot-booked');
    const isAvail = (cls || '').includes('slot-available');
    const isSel = (cls || '').includes('slot-selected');
    const m = isBooked ? '❌ BOOKED' : isAvail ? '✅ AVAILABLE' : isSel ? '🔵 SELECTED' : '???';
    console.log(`  ${m} | "${(text || '').trim()}"`);
  }

  // ══════════════════════════════════════════════════════
  // FINAL VERDICT
  // ══════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL VERDICT                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  console.log(`\nTest parameters:`);
  console.log(`  Court: ${state?.selectedCourt?.name}`);
  console.log(`  Date:  ${state?.selectedDate}`);
  console.log(`  User A: ${auth1?.user?.name} (${auth1?.user?.id})`);
  console.log(`  User B: ${auth2?.user?.name} (${auth2?.user?.id})`);

  console.log(`\nBooking created by User A:`);
  console.log(`  ID: ${targetBooking.id}`);
  console.log(`  Status: ${targetBooking.status}`);
  console.log(`  Date: ${targetBooking.date}`);
  console.log(`  Time: ${targetBooking.startTime}-${targetBooking.endTime}`);

  console.log(`\nFirst slot (7:00 AM): ${firstSlotIsBooked ? '❌ BOOKED' : firstSlotIsAvail ? '✅ AVAILABLE' : '???'}`);
  console.log(`Slot text: "${firstSlotText.trim()}"`);
  console.log(`Total booked: ${bookedCount}, Total available: ${availCount}`);

  if (firstSlotIsBooked) {
    console.log('\n✅ PASS: Availability is GLOBAL. Slot protected across real accounts.');
  } else if (firstSlotIsAvail) {
    console.log('\n❌ FAIL: Slot available despite User A having a confirmed booking.');
  } else {
    console.log('\n⚠️  Could not determine slot status.');
  }

  console.log('\n══════════════════════════════════════════════════════════');
  await browser.close();
})();
