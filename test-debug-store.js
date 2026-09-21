const { chromium } = require('playwright');
const URL = 'http://localhost:3000';
const CHROME = 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Register
  await page.goto(`${URL}/auth/register`);
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder="e.g. John Smith"]', 'Debug User');
  await page.fill('input[type="email"]', `debug-${Date.now()}@test.com`);
  await page.fill('input[placeholder="+1 (555) 000-0000"]', '+1 555 000 0000');
  await page.fill('input[placeholder="Min. 6 characters"]', 'debug123');
  await page.fill('input[placeholder="Re-enter your password"]', 'debug123');
  await page.locator('button:has-text("Create Account")').click();
  await page.waitForTimeout(3000);

  // Read raw localStorage
  const debug = await page.evaluate(() => {
    const raw = localStorage.getItem('khub-booking-storage');
    if (!raw) return { error: 'no key found' };
    const parsed = JSON.parse(raw);
    return {
      topKeys: Object.keys(parsed),
      stateKeys: Object.keys(parsed.state || {}),
      bookingsType: typeof parsed.state?.bookings,
      bookingsLength: parsed.state?.bookings?.length,
      sampleBooking: parsed.state?.bookings?.[0] || null,
    };
  });

  console.log('DEBUG:', JSON.stringify(debug, null, 2));

  // Now try to write
  const writeResult = await page.evaluate(() => {
    const raw = localStorage.getItem('khub-booking-storage');
    if (!raw) return 'no key';
    const parsed = JSON.parse(raw);
    const newBooking = {
      id: 'book-debug-1',
      bookingNumber: 'KH-DBG001',
      courtId: 'court-1',
      courtName: 'Debug Court',
      courtImage: '/images/courts/football-a.jpg',
      sportType: 'Football',
      date: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      durationMinutes: 60,
      totalPrice: 500,
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
      userId: 'debug-user',
      userName: 'Debug',
      userEmail: 'debug@test.com',
      userPhone: '123',
      selectedSlotIds: ['slot-debug'],
    };
    parsed.state.bookings = [newBooking];
    localStorage.setItem('khub-booking-storage', JSON.stringify(parsed));
    return 'wrote ok';
  });

  console.log('WRITE:', writeResult);

  // Reload and check
  await page.reload();
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => {
    const raw = localStorage.getItem('khub-booking-storage');
    const parsed = JSON.parse(raw);
    return {
      bookingsLength: parsed.state?.bookings?.length,
      firstId: parsed.state?.bookings?.[0]?.id,
    };
  });
  console.log('AFTER RELOAD:', JSON.stringify(after));

  await browser.close();
})();
