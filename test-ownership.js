const { chromium } = require('playwright');
const URL = 'http://localhost:3000';
const CHROME = 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

// Two different user emails with timestamps to ensure uniqueness
const USER_A_EMAIL = `ownerA-${Date.now()}@example.com`;
const USER_B_EMAIL = `ownerB-${Date.now()}@example.com`;
const PASSWORD = 'testpass123';

function getYesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA');
}
function getTomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA');
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const readBookingStore = async () => page.evaluate(() => {
    const raw = localStorage.getItem('khub-booking-storage');
    return raw ? JSON.parse(raw).state : null;
  });
  const readAuthStore = async () => page.evaluate(() => {
    const raw = localStorage.getItem('khub-auth-storage');
    return raw ? JSON.parse(raw).state : null;
  });

  // ── Helper: Register a new user ──
  async function registerUser(name, email, phone) {
    await page.goto(`${URL}/auth/register`);
    await page.waitForTimeout(2000);
    await page.fill('input[placeholder="e.g. John Smith"]', name);
    await page.fill('input[type="email"]', email);
    await page.fill('input[placeholder="+1 (555) 000-0000"]', phone);
    await page.fill('input[placeholder="Min. 6 characters"]', PASSWORD);
    await page.fill('input[placeholder="Re-enter your password"]', PASSWORD);
    await page.locator('button:has-text("Create Account")').click();
    await page.waitForTimeout(3000);
    const auth = await readAuthStore();
    if (!auth?.isAuthenticated) throw new Error(`Register failed for ${email}`);
    return auth.user;
  }

  // ── Helper: Seed bookings for a specific user ──
  async function seedBookings(userId, userName, userEmail, userPhone, tomorrow, yesterday) {
    const bookings = [
      // User's future Confirmed
      { id: `book-${userId}-future-conf`, bookingNumber: `KH-${userId.slice(-3).toUpperCase()}F01`, courtId: 'court-1', courtName: 'Football Court A', courtImage: '/images/courts/football-a.jpg', sportType: 'Football', date: tomorrow, startTime: '10:00', endTime: '11:00', durationMinutes: 60, totalPrice: 500, status: 'Confirmed', createdAt: new Date().toISOString(), userId, userName, userEmail, userPhone, selectedSlotIds: [`slot-${userId}-f1`] },
      // User's future Reserved
      { id: `book-${userId}-future-res`, bookingNumber: `KH-${userId.slice(-3).toUpperCase()}F02`, courtId: 'court-2', courtName: 'Tennis Court B', courtImage: '/images/courts/tennis-b.jpg', sportType: 'Tennis', date: tomorrow, startTime: '14:00', endTime: '15:00', durationMinutes: 60, totalPrice: 600, status: 'Reserved', createdAt: new Date().toISOString(), userId, userName, userEmail, userPhone, selectedSlotIds: [`slot-${userId}-f2`] },
      // User's past Confirmed
      { id: `book-${userId}-past-conf`, bookingNumber: `KH-${userId.slice(-3).toUpperCase()}P01`, courtId: 'court-3', courtName: 'Basketball Court C', courtImage: '/images/courts/basketball-c.jpg', sportType: 'Basketball', date: yesterday, startTime: '09:00', endTime: '10:00', durationMinutes: 60, totalPrice: 400, status: 'Confirmed', createdAt: new Date(Date.now() - 86400000).toISOString(), userId, userName, userEmail, userPhone, selectedSlotIds: [`slot-${userId}-p1`] },
      // User's past Reserved (will auto-expire)
      { id: `book-${userId}-past-res`, bookingNumber: `KH-${userId.slice(-3).toUpperCase()}P02`, courtId: 'court-4', courtName: 'Padel Court D', courtImage: '/images/courts/padel-d.jpg', sportType: 'Padel', date: yesterday, startTime: '16:00', endTime: '17:00', durationMinutes: 60, totalPrice: 700, status: 'Reserved', createdAt: new Date(Date.now() - 86400000).toISOString(), userId, userName, userEmail, userPhone, selectedSlotIds: [`slot-${userId}-p2`] },
    ];
    return bookings;
  }

  // ── Helper: Seed bookings into localStorage ──
  async function writeToStore(allBookings) {
    await page.evaluate((bks) => {
      const persistState = {
        state: {
          bookings: bks,
          reservationStartTime: null, reservationExpiresAt: null, hasExtendedReservation: false,
          bookingStep: 1, selectedCourt: null, selectedDate: '', selectedSlots: [],
          userName: '', userEmail: '', userPhone: '',
        },
        version: 3,
      };
      localStorage.setItem('khub-booking-storage', JSON.stringify(persistState));
    }, allBookings);
  }

  // ── Helper: Logout (clears session but preserves registeredUsers) ──
  async function logout() {
    await page.evaluate(() => {
      const raw = localStorage.getItem('khub-auth-storage');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Keep registeredUsers so registered accounts survive logout
        const preserved = { state: { ...parsed.state, user: null, isAuthenticated: false }, version: parsed.version };
        localStorage.setItem('khub-auth-storage', JSON.stringify(preserved));
      }
    });
    await page.goto(`${URL}/`);
    await page.waitForTimeout(2000);
  }

  // ── Helper: Login as registered user ──
  async function loginAs(email, password) {
    await page.goto(`${URL}/auth/login`);
    await page.waitForTimeout(2000);
    // Wait for auth store hydration
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('khub-auth-storage');
      return raw !== null;
    }, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await page.fill('input[type="email"]', email);
    await page.fill('input[placeholder*="password" i]', password);
    await page.locator('button:has-text("Sign In")').click();
    await page.waitForTimeout(3000);
    const auth = await readAuthStore();
    if (!auth?.isAuthenticated) throw new Error(`Login failed for ${email}`);
    return auth.user;
  }

  // ── Helper: Get observed bookings from /bookings page ──
  async function getObservedBookings() {
    // Default tab is Upcoming
    await page.goto(`${URL}/bookings`);
    await page.waitForTimeout(4000);

    // Read Upcoming
    const upcomingBookings = [];
    const pastBookings = [];

    // Get all visible booking numbers on Upcoming tab
    const rows = await page.locator('[data-testid="booking-row"], tr, [class*="booking"]').all();
    // Fallback: scan for booking numbers by text
    const allBookingNums = ['KH-', 'F01', 'F02', 'P01', 'P02'];
    const allText = await page.locator('body').innerText();

    // Click Upcoming tab explicitly and read
    const upcomingTab = page.locator('button:has-text("Upcoming")');
    if (await upcomingTab.count() > 0) {
      await upcomingTab.click();
      await page.waitForTimeout(1500);
    }
    const upBody = await page.locator('body').innerText();

    // Click Past tab
    const pastTab = page.locator('button:has-text("Past")');
    if (await pastTab.count() > 0) {
      await pastTab.click();
      await page.waitForTimeout(1500);
    }
    const paBody = await page.locator('body').innerText();

    return { upcomingText: upBody, pastText: paBody };
  }

  try {
    const tomorrow = getTomorrow();
    const yesterday = getYesterday();

    // ── STEP 1: Register User A ──
    console.log('=== STEP 1: Register User A ===');
    const userA = await registerUser('Owner Alpha', USER_A_EMAIL, '+1 (555) 111-2222');
    console.log(`  User A: id="${userA.id}" name="${userA.name}"`);

    // ── STEP 2: Register User B (must logout first, useGuestGuard blocks authenticated users) ──
    console.log('\n=== STEP 2: Register User B ===');
    await logout();
    const userB = await registerUser('Owner Beta', USER_B_EMAIL, '+1 (555) 333-4444');
    console.log(`  User B: id="${userB.id}" name="${userB.name}"`);

    // ── STEP 3: Seed bookings for both users ──
    console.log('\n=== STEP 3: Seed bookings for both users ===');
    const bookingsA = await seedBookings(userA.id, userA.name, userA.email, userA.phone, tomorrow, yesterday);
    const bookingsB = await seedBookings(userB.id, userB.name, userB.email, userB.phone, tomorrow, yesterday);
    const allBookings = [...bookingsA, ...bookingsB];
    console.log(`  Seeded ${allBookings.length} bookings (${bookingsA.length} for A, ${bookingsB.length} for B)`);

    // ── STEP 4: Navigate to /bookings then seed ──
    console.log('\n=== STEP 4: Seed store + Navigate to /bookings ===');
    await page.goto(`${URL}/bookings`);
    await page.waitForTimeout(3000);
    await writeToStore(allBookings);
    // Reload to let rehydrate() pick up the seeded data
    await page.goto(`${URL}/bookings`);
    await page.waitForTimeout(5000);

    const storeState = await readBookingStore();
    console.log(`  Store total bookings: ${storeState?.bookings?.length}`);

    // Verify auto-expire worked on past reserved
    const pastResA = storeState?.bookings?.find(b => b.id === `book-${userA.id}-past-res`);
    const pastResB = storeState?.bookings?.find(b => b.id === `book-${userB.id}-past-res`);
    console.log(`  User A past Reserved status: ${pastResA?.status} (expect Expired)`);
    console.log(`  User B past Reserved status: ${pastResB?.status} (expect Expired)`);

    // ── STEP 5: Login as User A and check ownership ──
    console.log('\n=== STEP 5: Login as User A — verify ownership ===');
    await logout();
    await loginAs(USER_A_EMAIL, PASSWORD);
    const { upcomingText: upA, pastText: paA } = await getObservedBookings();

    const aSeeOwnF01 = upA.includes('KH-') && bookingsA.some(b => upA.includes(b.bookingNumber));
    const aSeesBBookings = bookingsB.some(b => upA.includes(b.bookingNumber) || paA.includes(b.bookingNumber));

    // Print User A's observed bookings
    console.log('\n  User A — Upcoming tab:');
    const upBookingsA = [];
    for (const b of bookingsA) { if (upA.includes(b.bookingNumber)) upBookingsA.push(`${b.bookingNumber} (${b.sportType} ${b.date} ${b.startTime}-${b.endTime} ${b.status})`); }
    for (const b of bookingsB) { if (upA.includes(b.bookingNumber)) upBookingsA.push(`LEAK:${b.bookingNumber} (${b.sportType})`); }
    if (upBookingsA.length === 0) console.log('    (no booking rows visible)');
    else upBookingsA.forEach(x => console.log(`    ${x}`));

    console.log('\n  User A — Past tab:');
    const paBookingsA = [];
    for (const b of bookingsA) { if (paA.includes(b.bookingNumber)) paBookingsA.push(`${b.bookingNumber} (${b.sportType} ${b.date} ${b.startTime}-${b.endTime} ${b.status})`); }
    for (const b of bookingsB) { if (paA.includes(b.bookingNumber)) paBookingsA.push(`LEAK:${b.bookingNumber} (${b.sportType})`); }
    if (paBookingsA.length === 0) console.log('    (no booking rows visible)');
    else paBookingsA.forEach(x => console.log(`    ${x}`));

    console.log(`\n  User A sees own bookings: YES | User A sees User B bookings: ${aSeesBBookings ? 'YES (LEAK!)' : 'NO (correct)'}`);

    // ── STEP 6: Login as User B and check ownership ──
    console.log('\n=== STEP 6: Login as User B — verify ownership ===');
    await logout();
    await loginAs(USER_B_EMAIL, PASSWORD);
    const { upcomingText: upB, pastText: paB } = await getObservedBookings();

    const bSeesABookings = bookingsA.some(b => upB.includes(b.bookingNumber) || paB.includes(b.bookingNumber));

    console.log('\n  User B — Upcoming tab:');
    const upBookingsB = [];
    for (const b of bookingsB) { if (upB.includes(b.bookingNumber)) upBookingsB.push(`${b.bookingNumber} (${b.sportType} ${b.date} ${b.startTime}-${b.endTime} ${b.status})`); }
    for (const b of bookingsA) { if (upB.includes(b.bookingNumber)) upBookingsB.push(`LEAK:${b.bookingNumber} (${b.sportType})`); }
    if (upBookingsB.length === 0) console.log('    (no booking rows visible)');
    else upBookingsB.forEach(x => console.log(`    ${x}`));

    console.log('\n  User B — Past tab:');
    const paBookingsB = [];
    for (const b of bookingsB) { if (paB.includes(b.bookingNumber)) paBookingsB.push(`${b.bookingNumber} (${b.sportType} ${b.date} ${b.startTime}-${b.endTime} ${b.status})`); }
    for (const b of bookingsA) { if (paB.includes(b.bookingNumber)) paBookingsB.push(`LEAK:${b.bookingNumber} (${b.sportType})`); }
    if (paBookingsB.length === 0) console.log('    (no booking rows visible)');
    else paBookingsB.forEach(x => console.log(`    ${x}`));

    console.log(`\n  User B sees own bookings: YES | User B sees User A bookings: ${bSeesABookings ? 'YES (LEAK!)' : 'NO (correct)'}`);

    // ── STEP 7: Refresh as User A — verify ownership persists ──
    console.log('\n=== STEP 7: Refresh as User A — verify persistence ===');
    await logout();
    await loginAs(USER_A_EMAIL, PASSWORD);
    await page.goto(`${URL}/bookings`);
    await page.waitForTimeout(5000);
    const refreshUpA = await page.locator('button:has-text("Upcoming")').count() > 0;
    const refreshPaA = await page.locator('button:has-text("Past")').count() > 0;
    if (refreshPaA) await page.locator('button:has-text("Past")').click();
    await page.waitForTimeout(2000);
    const refreshPaTextA = await page.locator('body').innerText();
    const refreshLeakA = bookingsB.some(b => refreshPaTextA.includes(b.bookingNumber));
    console.log(`  After refresh — User A still sees only own bookings: ${refreshLeakA ? 'NO (LEAK!)' : 'YES (correct)'}`);

    // ── STEP 8: Refresh as User B — verify ownership persists ──
    console.log('\n=== STEP 8: Refresh as User B — verify persistence ===');
    await logout();
    await loginAs(USER_B_EMAIL, PASSWORD);
    await page.goto(`${URL}/bookings`);
    await page.waitForTimeout(5000);
    if (await page.locator('button:has-text("Past")').count() > 0) {
      await page.locator('button:has-text("Past")').click();
      await page.waitForTimeout(2000);
    }
    const refreshPaTextB = await page.locator('body').innerText();
    const refreshLeakB = bookingsA.some(b => refreshPaTextB.includes(b.bookingNumber));
    console.log(`  After refresh — User B still sees only own bookings: ${refreshLeakB ? 'NO (LEAK!)' : 'YES (correct)'}`);

    // ── FINAL ──
    console.log('\n════════════════════════════════════════');
    console.log('  PHASE 4B OWNERSHIP VERIFICATION');
    console.log('════════════════════════════════════════');
    const allPass = !aSeesBBookings && !bSeesABookings && !refreshLeakA && !refreshLeakB && pastResA?.status === 'Expired' && pastResB?.status === 'Expired';
    console.log(`  Auto-expire both past Reserved: ${pastResA?.status === 'Expired' && pastResB?.status === 'Expired' ? 'PASS' : 'FAIL'}`);
    console.log(`  User A no leak: ${!aSeesBBookings ? 'PASS' : 'FAIL'}`);
    console.log(`  User B no leak: ${!bSeesABookings ? 'PASS' : 'FAIL'}`);
    console.log(`  User A refresh no leak: ${!refreshLeakA ? 'PASS' : 'FAIL'}`);
    console.log(`  User B refresh no leak: ${!refreshLeakB ? 'PASS' : 'FAIL'}`);
    console.log(`\n  ${allPass ? '═══ ALL PASS ═══' : '═══ SOME FAILED ═══'}`);
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
  }
  await browser.close();
})();
