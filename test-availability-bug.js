const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const BASE = 'http://localhost:3000';
  const log = (msg) => console.log(msg);

  try {
    // ============================================================
    // PHASE 1: Login as user-1
    // ============================================================
    log('\n===== PHASE 1: LOGIN user-1 =====');
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.fill('input[type="email"]', 'alex.johnson@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(2000);
    log(`[LOGIN] URL: ${page.url()}`);

    // ============================================================
    // PHASE 1b: Create booking via UI
    // ============================================================
    log('\n----- Creating booking via UI -----');
    await page.goto(`${BASE}/courts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click first Book Now link
    await page.locator('a:has-text("Book Now")').first().click();
    await page.waitForTimeout(3000);
    log(`[BOOK] On: ${page.url()}`);

    // Select date (tomorrow = 2nd date button)
    const dateBtns = page.locator('button:has-text("Aug")');
    const dateCount = await dateBtns.count();
    log(`[BOOK] Date buttons: ${dateCount}`);
    if (dateCount > 1) {
      await dateBtns.nth(1).click();
      await page.waitForTimeout(2000);
    }

    // Select first enabled time slot
    const availSlots = page.locator('button:not([disabled])').filter({ hasText: /^\d{1,2}:\d{2}/ });
    const slotCount = await availSlots.count();
    log(`[BOOK] Available slots: ${slotCount}`);
    if (slotCount > 0) {
      await availSlots.first().click();
      await page.waitForTimeout(1000);
      log('[BOOK] Selected slot');
    }

    // Continue to details
    await page.getByRole('button', { name: /continue/i }).click();
    await page.waitForTimeout(2000);
    log(`[BOOK] After continue: ${page.url()}`);

    // ---- Details page ----
    if (page.url().includes('/details')) {
      log('[BOOK] On /book/details');
      const emailInput = page.locator('input:visible[type="email"], input:visible[placeholder*="email" i]').first();
      if (await emailInput.count()) await emailInput.fill('alex.johnson@example.com');
      const phoneInput = page.locator('input:visible[type="tel"], input:visible[placeholder*="phone" i]').first();
      if (await phoneInput.count()) await phoneInput.fill('01012345678');
      const nameInput = page.locator('input:visible[placeholder*="name" i]').first();
      if (await nameInput.count()) await nameInput.fill('Alex Johnson');
      await page.getByRole('button', { name: /continue|submit|proceed|pay/i }).first().click();
      await page.waitForTimeout(2000);
      log(`[BOOK] After details: ${page.url()}`);
    }

    // ---- Payment page ----
    if (page.url().includes('/payment')) {
      log('[BOOK] On /book/payment');
      const cardInput = page.locator('input:visible[placeholder*="card" i], input:visible[placeholder*="number" i]').first();
      if (await cardInput.count()) await cardInput.fill('4242424242424242');
      const expiryInput = page.locator('input:visible[placeholder*="mm" i], input:visible[placeholder*="expir" i]').first();
      if (await expiryInput.count()) await expiryInput.fill('12/28');
      const cvcInput = page.locator('input:visible[placeholder*="cvc" i], input:visible[placeholder*="cvv" i]').first();
      if (await cvcInput.count()) await cvcInput.fill('123');
      const cardNameInput = page.locator('input:visible[placeholder*="name" i]').first();
      if (await cardNameInput.count()) await cardNameInput.fill('Alex Johnson');
      const payBtn = page.getByRole('button', { name: /pay|confirm|complete|submit/i }).first();
      await payBtn.click();
      await page.waitForTimeout(5000);
      log(`[BOOK] After pay: ${page.url()}`);
    }

    // ============================================================
    // CRITICAL: Snapshot localStorage state AFTER booking is confirmed
    // ============================================================
    log('\n===== SNAPSHOT BEFORE LOGOUT =====');
    const beforeLogout = await page.evaluate(() => {
      const bookingRaw = localStorage.getItem('khub-booking-storage');
      const paymentRaw = localStorage.getItem('khub-payment-storage');
      const notifRaw = localStorage.getItem('khub-notification-storage') || localStorage.getItem('khub-notifications-storage');
      return {
        bookings: bookingRaw ? JSON.parse(bookingRaw) : null,
        payments: paymentRaw ? JSON.parse(paymentRaw) : null,
        notifications: notifRaw ? JSON.parse(notifRaw) : null,
        allKeys: (() => { const k = []; for (let i = 0; i < localStorage.length; i++) k.push(localStorage.key(i)); return k; })(),
      };
    });

    // Extract booking details
    const bookingsBefore = beforeLogout.bookings?.state?.bookings || [];
    log(`[BEFORE] localStorage keys: ${beforeLogout.allKeys.join(', ')}`);
    log(`[BEFORE] Total bookings in store: ${bookingsBefore.length}`);
    for (const b of bookingsBefore) {
      log(`[BEFORE] Booking: id=${b.id}, court=${b.courtName}, date=${b.date}, time=${b.startTime}-${b.endTime}, status=${b.status}, userId=${b.userId}, slotIds=${b.selectedSlotIds.join(',')}`);
    }
    log(`[BEFORE] Total payments: ${beforeLogout.payments?.state?.payments?.length || 0}`);

    // ============================================================
    // PHASE 2: Logout via ACTUAL UI (not manual clear)
    // ============================================================
    log('\n===== PHASE 2: LOGOUT (REAL) =====');

    // Navigate to home page where nav has the profile menu
    await page.goto(`${BASE}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Find and click the profile/account button
    // Look for the user avatar or profile icon in the nav
    const profileClicked = await page.evaluate(() => {
      const navBtns = Array.from(document.querySelectorAll('nav button'));
      // Find the button that is NOT the notification bell
      for (const btn of navBtns) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        // The bell has "notification" in its label; the profile button doesn't
        if (!label.includes('notification') && !label.includes('toggle') && !label.includes('menu')) {
          btn.click();
          return { clicked: true, label: btn.getAttribute('aria-label'), text: btn.textContent?.trim()?.substring(0, 30) };
        }
      }
      return { clicked: false };
    });
    log(`[LOGOUT] Profile button: ${JSON.stringify(profileClicked)}`);
    await page.waitForTimeout(1000);

    // Look for sign out in any dropdown/menu
    const signOutLinks = page.locator('a, button').filter({ hasText: /sign out|logout/i });
    const signOutCount = await signOutLinks.count();
    log(`[LOGOUT] Sign out links found: ${signOutCount}`);

    if (signOutCount > 0) {
      await signOutLinks.first().click();
      await page.waitForTimeout(3000);
      log('[LOGOUT] Clicked sign out');
    } else {
      // Try evaluating to find and click logout in any dropdown
      await page.evaluate(() => {
        const allEls = document.querySelectorAll('a, button, [role="menuitem"]');
        for (const el of allEls) {
          if ((el.textContent || '').toLowerCase().includes('sign out') || (el.textContent || '').toLowerCase().includes('logout')) {
            el.click();
            return true;
          }
        }
        return false;
      });
      await page.waitForTimeout(3000);
      log('[LOGOUT] Tried evaluate click for sign out');
    }

    log(`[LOGOUT] After logout URL: ${page.url()}`);

    // ============================================================
    // CRITICAL: Snapshot localStorage state AFTER logout
    // ============================================================
    log('\n===== SNAPSHOT AFTER LOGOUT =====');
    const afterLogout = await page.evaluate(() => {
      const bookingRaw = localStorage.getItem('khub-booking-storage');
      const paymentRaw = localStorage.getItem('khub-payment-storage');
      const notifRaw = localStorage.getItem('khub-notification-storage') || localStorage.getItem('khub-notifications-storage');
      return {
        bookings: bookingRaw ? JSON.parse(bookingRaw) : null,
        payments: paymentRaw ? JSON.parse(paymentRaw) : null,
        notifications: notifRaw ? JSON.parse(notifRaw) : null,
        allKeys: (() => { const k = []; for (let i = 0; i < localStorage.length; i++) k.push(localStorage.key(i)); return k; })(),
      };
    });

    const bookingsAfter = afterLogout.bookings?.state?.bookings || [];
    log(`[AFTER] localStorage keys: ${afterLogout.allKeys.join(', ')}`);
    log(`[AFTER] Total bookings in store: ${bookingsAfter.length}`);
    for (const b of bookingsAfter) {
      log(`[AFTER] Booking: id=${b.id}, court=${b.courtName}, date=${b.date}, time=${b.startTime}-${b.endTime}, status=${b.status}, userId=${b.userId}`);
    }

    // Compare
    log('\n----- COMPARISON -----');
    log(`[COMPARE] Bookings before logout: ${bookingsBefore.length}`);
    log(`[COMPARE] Bookings after logout: ${bookingsAfter.length}`);
    log(`[COMPARE] Booking-storage key exists after logout: ${afterLogout.allKeys.includes('khub-booking-storage')}`);

    if (bookingsBefore.length !== bookingsAfter.length) {
      log('❌ BUG CONFIRMED: Bookings were lost during logout!');
      log(`   Lost ${bookingsBefore.length - bookingsAfter.length} booking(s)`);
    } else {
      log('✅ Bookings survived logout (count matches)');
    }

    // ============================================================
    // PHASE 3: Check slot availability without logging in
    // ============================================================
    log('\n===== PHASE 3: SLOT AVAILABILITY (guest) =====');

    // If we have booking data, check if the slot should still be marked as booked
    if (bookingsAfter.length > 0) {
      const testBooking = bookingsAfter[0];
      log(`[AVAIL] Checking slot: courtId=${testBooking.courtId}, date=${testBooking.date}, slotIds=${testBooking.selectedSlotIds.join(',')}`);

      // Navigate to book page and check slot status
      // We need to select the same court and date
      await page.goto(`${BASE}/courts`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Click "Book Now" to get to the booking widget
      await page.locator('a:has-text("Book Now")').first().click();
      await page.waitForTimeout(3000);

      // Check if a court is selected (from store)
      const storeState = await page.evaluate(() => {
        const raw = localStorage.getItem('khub-booking-storage');
        return raw ? JSON.parse(raw) : null;
      });
      const selectedCourt = storeState?.state?.selectedCourt;
      log(`[AVAIL] Selected court in store: ${selectedCourt?.name || 'none'}`);

      if (!selectedCourt) {
        log('[AVAIL] No court selected — need to navigate through courts page');
        await page.goto(`${BASE}/courts`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        await page.locator('a:has-text("Book Now")').first().click();
        await page.waitForTimeout(3000);
      }

      // Navigate to the date of the booking
      // Check the slot status in the UI
      const slotStatuses = await page.evaluate(() => {
        const btns = document.querySelectorAll('button:not([disabled])');
        const statuses = [];
        for (const btn of btns) {
          const text = btn.textContent?.trim() || '';
          if (text.match(/\d{1,2}:\d{2}/) && btn.className.includes('slot-')) {
            statuses.push({
              text,
              classes: btn.className,
              isBooked: btn.className.includes('booked'),
              isAvailable: btn.className.includes('available'),
              disabled: btn.disabled,
            });
          }
        }
        return statuses;
      });
      log(`[AVAIL] Slot statuses: ${JSON.stringify(slotStatuses.slice(0, 5))}`);
    } else {
      log('[AVAIL] No bookings found — cannot check availability');
    }

    // ============================================================
    // PHASE 4: Login as user-2 and check
    // ============================================================
    log('\n===== PHASE 4: LOGIN user-2 =====');
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.fill('input[type="email"]', 'sarah.connor@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(2000);
    log(`[USER2] URL: ${page.url()}`);

    const user2Auth = await page.evaluate(() => {
      const raw = localStorage.getItem('khub-auth-storage');
      return raw ? JSON.parse(raw)?.state?.user : null;
    });
    log(`[USER2] User: ${user2Auth?.name} (${user2Auth?.id})`);

    // Check user-2's bookings
    await page.goto(`${BASE}/bookings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const user2BookingsText = await page.locator('main').first().textContent().catch(() => '');
    const user2HasBookings = !user2BookingsText.includes('No Reservations Yet');
    log(`[USER2] Has bookings: ${user2HasBookings}`);
    if (user2HasBookings) {
      log(`[USER2] Bookings text: ${user2BookingsText.substring(0, 500)}`);
    }

    // Check user-2's view of the booking store
    const user2StoreState = await page.evaluate(() => {
      const raw = localStorage.getItem('khub-booking-storage');
      return raw ? JSON.parse(raw) : null;
    });
    const user2Bookings = user2StoreState?.state?.bookings || [];
    log(`[USER2] Bookings in store: ${user2Bookings.length}`);

    // Check if user-1's booking is visible to user-2 in the store
    if (bookingsBefore.length > 0) {
      const user1Booking = user2Bookings.find(b => b.id === bookingsBefore[0].id);
      if (user1Booking) {
        log(`[USER2] ❌ CROSS-CONTAMINATION: User-1's booking (${user1Booking.bookingNumber}) visible in user-2's store`);
      } else {
        log('[USER2] ✅ User-1 booking not in user-2 view (correct — ownership scoped)');
      }
    }

    // ============================================================
    // VERDICT
    // ============================================================
    log('\n===== VERDICT =====');
    const issues = [];
    if (bookingsBefore.length !== bookingsAfter.length) {
      issues.push(`Bookings lost during logout: ${bookingsBefore.length} → ${bookingsAfter.length}`);
    }
    if (!afterLogout.allKeys.includes('khub-booking-storage')) {
      issues.push('khub-booking-storage key removed from localStorage after logout');
    }

    if (issues.length === 0) {
      log('✅ No availability bug detected — bookings persist through logout');
      log('✅ Slot availability should remain correctly blocked for other users');
    } else {
      log('❌ BUGS FOUND:');
      issues.forEach(i => log(`   ❌ ${i}`));
    }

  } catch (err) {
    log(`[ERROR] ${err.message}\n${err.stack}`);
  } finally {
    await browser.close();
  }
})();
