const { chromium } = require('playwright');
const URL = 'http://localhost:3000';
const CHROME = 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const EMAIL = `notifreal-${Date.now()}@example.com`;
const PASSWORD = 'testpass123';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const readNotifStore = async () => page.evaluate(() => {
    const raw = localStorage.getItem('khub-notifications-storage');
    return raw ? JSON.parse(raw).state : null;
  });
  const readAuthStore = async () => page.evaluate(() => {
    const raw = localStorage.getItem('khub-auth-storage');
    return raw ? JSON.parse(raw).state : null;
  });

  // ── Register ──
  console.log('=== Register ===');
  await page.goto(`${URL}/auth/register`);
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder="e.g. John Smith"]', 'Notif Real');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[placeholder="+1 (555) 000-0000"]', '+1 (555) 777-0000');
  await page.fill('input[placeholder="Min. 6 characters"]', PASSWORD);
  await page.fill('input[placeholder="Re-enter your password"]', PASSWORD);
  await page.locator('button:has-text("Create Account")').click();
  await page.waitForTimeout(3000);
  const auth = await readAuthStore();
  console.log(`  user="${auth?.user?.name}" id="${auth?.user?.id}"`);
  const userId = auth.user.id;

  // Check notif store before booking
  const notifBefore = await readNotifStore();
  console.log(`  Notifications before booking: ${notifBefore?.notifications?.length ?? 0}`);

  // ── Complete a full booking flow ──
  console.log('\n=== Complete booking flow ===');
  // Step 1: Select court
  await page.goto(`${URL}/courts`);
  await page.waitForTimeout(3000);
  // Click first court card
  const courtLink = page.locator('a[href*="/courts/"]').first();
  if (await courtLink.count() > 0) {
    await courtLink.click();
    await page.waitForTimeout(3000);
    console.log('  Navigated to court detail');
  } else {
    console.log('  ERROR: No court links found');
    await browser.close();
    return;
  }

  // Step 2: Select a slot (if available)
  const slotBtn = page.locator('button:has-text("10:00"), button:has-text("11:00"), button:has-text("14:00"), button:has-text("15:00")').first();
  if (await slotBtn.count() > 0) {
    await slotBtn.click();
    await page.waitForTimeout(1000);
    console.log('  Selected a slot');
  } else {
    console.log('  No specific slot buttons found, checking for any available slot...');
    const anySlot = page.locator('[class*="slot-available"], button:has-text("AM"), button:has-text("PM")').first();
    if (await anySlot.count() > 0) {
      await anySlot.click();
      await page.waitForTimeout(1000);
      console.log('  Selected an available slot');
    } else {
      console.log('  No slots available — cannot complete booking flow');
      await browser.close();
      return;
    }
  }

  // Try to proceed to next step
  const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Proceed")').first();
  if (await nextBtn.count() > 0) {
    await nextBtn.click();
    await page.waitForTimeout(2000);
    console.log('  Clicked Next');
  }

  // Check if we're on details page
  const currentUrl = page.url();
  console.log(`  Current URL: ${currentUrl}`);

  // Fill details if on details page
  if (currentUrl.includes('details')) {
    const nameInput = page.locator('input[placeholder*="name" i]').first();
    const emailInput = page.locator('input[type="email"]').first();
    const phoneInput = page.locator('input[placeholder*="phone" i]').first();
    if (await nameInput.count() > 0) await nameInput.fill('Notif Real');
    if (await emailInput.count() > 0) await emailInput.fill(EMAIL);
    if (await phoneInput.count() > 0) await phoneInput.fill('+1 (555) 777-0000');
    await page.waitForTimeout(500);
    const proceedBtn = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Proceed"), button:has-text("Pay")').first();
    if (await proceedBtn.count() > 0) {
      await proceedBtn.click();
      await page.waitForTimeout(2000);
      console.log('  Filled details and proceeded');
    }
  }

  // Check current state
  const url2 = page.url();
  console.log(`  Current URL after details: ${url2}`);

  // If on payment page, confirm payment
  if (url2.includes('payment')) {
    const payBtn = page.locator('button:has-text("Pay"), button:has-text("Confirm"), button:has-text("Complete")').first();
    if (await payBtn.count() > 0) {
      await payBtn.click();
      await page.waitForTimeout(4000);
      console.log('  Clicked Pay/Confirm');
    }
  }

  // Check notifications after booking
  const url3 = page.url();
  console.log(`  Current URL after payment: ${url3}`);
  const notifAfterBooking = await readNotifStore();
  console.log(`  Notifications after booking: ${notifAfterBooking?.notifications?.length ?? 0}`);
  if (notifAfterBooking?.notifications?.length > 0) {
    for (const n of notifAfterBooking.notifications) {
      console.log(`    - ${n.title}: ${n.message} (userId: ${n.userId})`);
    }
  }

  // ── Logout ──
  console.log('\n=== Logout ===');
  await page.evaluate(() => {
    const raw = localStorage.getItem('khub-auth-storage');
    if (raw) {
      const p = JSON.parse(raw);
      p.state.user = null;
      p.state.isAuthenticated = false;
      localStorage.setItem('khub-auth-storage', JSON.stringify(p));
    }
  });
  await page.goto(`${URL}/`);
  await page.waitForTimeout(2000);
  const notifAfterLogout = await readNotifStore();
  console.log(`  Notifications after logout: ${notifAfterLogout?.notifications?.length ?? 0}`);

  // ── Login again ──
  console.log('\n=== Login again ===');
  await page.goto(`${URL}/auth/login`);
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[placeholder*="password" i]', PASSWORD);
  await page.locator('button:has-text("Sign In")').click();
  await page.waitForTimeout(3000);
  const notifAfterLogin = await readNotifStore();
  console.log(`  Notifications after re-login: ${notifAfterLogin?.notifications?.length ?? 0}`);
  if (notifAfterLogin?.notifications?.length > 0) {
    for (const n of notifAfterLogin.notifications) {
      console.log(`    - ${n.title}: ${n.message} (userId: ${n.userId})`);
    }
  }

  // Check UI
  console.log('\n=== Check notifications UI ===');
  await page.goto(`${URL}/notifications`);
  await page.waitForTimeout(3000);
  const bodyText = await page.locator('body').innerText();
  const hasAnyNotif = bodyText.includes('Booking Confirmed') || bodyText.includes('Payment Successful') || bodyText.includes('No notifications');
  console.log(`  Page shows notification content: ${hasAnyNotif}`);
  // Check for "No notifications" empty state
  const noNotifs = bodyText.includes('No notifications') || bodyText.includes("You don't have any notifications");
  console.log(`  Empty state shown: ${noNotifs}`);

  await browser.close();
  console.log('\nDone.');
})();
