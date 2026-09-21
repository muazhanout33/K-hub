const { chromium } = require('playwright');
const URL = 'http://localhost:3000';
const CHROME = 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

const TEST_EMAIL = `bookingtabs-${Date.now()}@example.com`;
const TEST_PASSWORD = 'testpass123';
const TEST_NAME = 'Tabs Test User';
const TEST_PHONE = '+1 (555) 888-7777';

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
}

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA');
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

  // STEP 1: Register
  console.log('STEP 1: Register new account');
  await page.goto(`${URL}/auth/register`);
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder="e.g. John Smith"]', TEST_NAME);
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[placeholder="+1 (555) 000-0000"]', TEST_PHONE);
  await page.fill('input[placeholder="Min. 6 characters"]', TEST_PASSWORD);
  await page.fill('input[placeholder="Re-enter your password"]', TEST_PASSWORD);
  await page.locator('button:has-text("Create Account")').click();
  await page.waitForTimeout(3000);

  const auth1 = await readAuthStore();
  console.log(`  user="${auth1?.user?.name}" id="${auth1?.user?.id}" isAuthenticated=${auth1?.isAuthenticated}`);
  if (!auth1?.isAuthenticated) { console.log('FAIL'); await browser.close(); return; }
  const userId = auth1.user.id;

  // STEP 2: Seed booking store in localStorage (write full Zustand persist structure)
  console.log('\nSTEP 2: Seed booking store in localStorage');
  const tomorrow = getTomorrow();
  const yesterday = getYesterday();

  const bookings = [
    { id: 'book-future-confirmed', bookingNumber: 'KH-FUT001', courtId: 'court-1', courtName: 'Football Court A', courtImage: '/images/courts/football-a.jpg', sportType: 'Football', date: tomorrow, startTime: '10:00', endTime: '11:00', durationMinutes: 60, totalPrice: 500, status: 'Confirmed', createdAt: new Date().toISOString(), userId, userName: TEST_NAME, userEmail: TEST_EMAIL, userPhone: TEST_PHONE, selectedSlotIds: ['slot-future-1'] },
    { id: 'book-past-reserved', bookingNumber: 'KH-PST001', courtId: 'court-1', courtName: 'Football Court A', courtImage: '/images/courts/football-a.jpg', sportType: 'Football', date: yesterday, startTime: '09:00', endTime: '10:00', durationMinutes: 60, totalPrice: 500, status: 'Reserved', createdAt: new Date(Date.now() - 86400000).toISOString(), userId, userName: TEST_NAME, userEmail: TEST_EMAIL, userPhone: TEST_PHONE, selectedSlotIds: ['slot-past-1'] },
    { id: 'book-past-confirmed', bookingNumber: 'KH-PST002', courtId: 'court-2', courtName: 'Tennis Court B', courtImage: '/images/courts/tennis-b.jpg', sportType: 'Tennis', date: yesterday, startTime: '14:00', endTime: '15:00', durationMinutes: 60, totalPrice: 600, status: 'Confirmed', createdAt: new Date(Date.now() - 86400000).toISOString(), userId, userName: TEST_NAME, userEmail: TEST_EMAIL, userPhone: TEST_PHONE, selectedSlotIds: ['slot-past-2'] },
  ];

  // Seed a future Reserved too
  bookings.push({ id: 'book-future-reserved', bookingNumber: 'KH-FUT002', courtId: 'court-2', courtName: 'Tennis Court B', courtImage: '/images/courts/tennis-b.jpg', sportType: 'Tennis', date: tomorrow, startTime: '14:00', endTime: '15:00', durationMinutes: 60, totalPrice: 600, status: 'Reserved', createdAt: new Date().toISOString(), userId, userName: TEST_NAME, userEmail: TEST_EMAIL, userPhone: TEST_PHONE, selectedSlotIds: ['slot-future-2'] });

  const seedResult = await page.evaluate((bks) => {
    // Write full Zustand persist structure with version to bypass migration
    const persistState = {
      state: {
        bookings: bks,
        reservationStartTime: null,
        reservationExpiresAt: null,
        hasExtendedReservation: false,
        bookingStep: 1,
        selectedCourt: null,
        selectedDate: '',
        selectedSlots: [],
        userName: '',
        userEmail: '',
        userPhone: '',
      },
      version: 3,
    };
    localStorage.setItem('khub-booking-storage', JSON.stringify(persistState));
    return { ok: true, count: bks.length };
  }, bookings);
  console.log(`  seed: ${JSON.stringify(seedResult)}`);

  // STEP 3: Navigate to /bookings — rehydrate() will read seeded data
  console.log('\nSTEP 3: Navigate to /bookings (rehydrate reads seed)');
  await page.goto(`${URL}/bookings`);
  await page.waitForTimeout(5000);

  const storeAfter = await readBookingStore();
  console.log(`  store bookings count: ${storeAfter?.bookings?.length}`);
  const pastRes = storeAfter?.bookings?.find(b => b.id === 'book-past-reserved');
  console.log(`  Past Reserved status: ${pastRes?.status} (expect: Expired)`);

  // STEP 4: Check tabs
  console.log('\nSTEP 4: Check Upcoming tab');
  const tabUp = page.locator('button:has-text("Upcoming")');
  const tabPa = page.locator('button:has-text("Past")');
  const hasUp = await tabUp.count() > 0;
  const hasPa = await tabPa.count() > 0;
  console.log(`  Upcoming tab: ${hasUp ? 'YES' : 'NO'} | Past tab: ${hasPa ? 'YES' : 'NO'}`);

  const fut = await page.locator('text=KH-FUT001').count() > 0;
  const futRes = await page.locator('text=KH-FUT002').count() > 0;
  const p1 = await page.locator('text=KH-PST001').count() > 0;
  const p2 = await page.locator('text=KH-PST002').count() > 0;
  console.log(`  KH-FUT001 (future Confirmed) on Upcoming: ${fut ? 'YES' : 'NO'}`);
  console.log(`  KH-FUT002 (future Reserved) on Upcoming: ${futRes ? 'YES' : 'NO'}`);
  console.log(`  KH-PST001 on Upcoming: ${p1 ? 'VISIBLE (wrong)' : 'NOT visible (correct)'}`);
  console.log(`  KH-PST002 on Upcoming: ${p2 ? 'VISIBLE (wrong)' : 'NOT visible (correct)'}`);

  // STEP 5: Click Past tab
  console.log('\nSTEP 5: Past tab content');
  await tabPa.click();
  await page.waitForTimeout(2000);
  const p1p = await page.locator('text=KH-PST001').count() > 0;
  const p2p = await page.locator('text=KH-PST002').count() > 0;
  console.log(`  KH-PST001 (past Reserved) on Past: ${p1p ? 'YES' : 'NO'}`);
  console.log(`  KH-PST002 (past Confirmed) on Past: ${p2p ? 'YES' : 'NO'}`);
  const expiredBadge = await page.locator('text=Expired').count();
  console.log(`  Expired badges: ${expiredBadge} (expect >=1)`);

  // FINAL
  console.log('\n=== FINAL VERDICT ===');
  const results = {
    'Tabs exist': hasUp && hasPa,
    'Upcoming shows future Confirmed': fut,
    'Upcoming shows future Reserved': futRes,
    'Past NOT on Upcoming': !p1 && !p2,
    'Past Reserved auto-expired': pastRes?.status === 'Expired',
    'Past Reserved on Past tab': p1p,
    'Past Confirmed on Past tab': p2p,
    'Expired badge shown': expiredBadge >= 1,
  };
  for (const [k, v] of Object.entries(results)) console.log(`  ${v ? 'PASS' : 'FAIL'} ${k}`);
  console.log(`\n${Object.values(results).every(Boolean) ? 'ALL PASS' : 'SOME FAILED'}`);

  await browser.close();
})();
