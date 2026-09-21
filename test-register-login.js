const { chromium } = require('playwright');
const URL = 'http://localhost:3000';
const CHROME = 'C:\\Users\\PC\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

const TEST_EMAIL = `testuser-${Date.now()}@example.com`;
const TEST_PASSWORD = 'testpass123';
const TEST_NAME = 'Test User';
const TEST_PHONE = '+1 (555) 999-1234';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const readAuthStore = async () => page.evaluate(() => {
    const raw = localStorage.getItem('khub-auth-storage');
    return raw ? JSON.parse(raw).state : null;
  });

  // ══════════════════════════════════════════════════════
  // STEP 1: Register a brand-new account via real UI
  // ══════════════════════════════════════════════════════
  console.log('═══ STEP 1: Register new account ═══');
  console.log(`  Email: ${TEST_EMAIL}`);
  console.log(`  Password: ${TEST_PASSWORD}`);

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
  console.log(`[AUTH] name="${auth1?.user?.name}" id="${auth1?.user?.id}" email="${auth1?.user?.email}" isAuthenticated=${auth1?.isAuthenticated}`);
  console.log(`[AUTH] registeredUsers count: ${auth1?.registeredUsers?.length}`);
  console.log(`[URL] ${page.url()}`);

  if (!auth1?.isAuthenticated || auth1?.user?.email !== TEST_EMAIL) {
    console.log('❌ FAIL: Registration did not produce authenticated user');
    await browser.close();
    return;
  }

  // ══════════════════════════════════════════════════════
  // STEP 2: Logout via real UI
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 2: Logout ═══');
  await page.locator('button[aria-label="Sign out"]').first().click();
  await page.waitForTimeout(3000);

  const auth2 = await readAuthStore();
  console.log(`[AUTH] After logout: isAuthenticated=${auth2?.isAuthenticated} user=${auth2?.user?.name}`);
  console.log(`[AUTH] registeredUsers count: ${auth2?.registeredUsers?.length}`);
  console.log(`[URL] ${page.url()}`);

  // ══════════════════════════════════════════════════════
  // STEP 3: Login with the same credentials via real UI
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 3: Login with registered credentials ═══');
  await page.goto(`${URL}/auth/login`);
  await page.waitForTimeout(2000);

  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.locator('button:has-text("Sign In")').click();
  await page.waitForTimeout(3000);

  const auth3 = await readAuthStore();
  console.log(`[AUTH] name="${auth3?.user?.name}" id="${auth3?.user?.id}" email="${auth3?.user?.email}" isAuthenticated=${auth3?.isAuthenticated}`);
  console.log(`[URL] ${page.url()}`);

  if (!auth3?.isAuthenticated || auth3?.user?.email !== TEST_EMAIL) {
    console.log('❌ FAIL: Login after logout did not work');
    await browser.close();
    return;
  }

  // ══════════════════════════════════════════════════════
  // STEP 4: Logout again, then refresh page to simulate new session
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 4: Logout + page refresh (new session) ═══');
  await page.locator('button[aria-label="Sign out"]').first().click();
  await page.waitForTimeout(3000);

  const auth4 = await readAuthStore();
  console.log(`[AUTH] After logout: isAuthenticated=${auth4?.isAuthenticated}`);
  console.log(`[AUTH] registeredUsers preserved: ${auth4?.registeredUsers?.length}`);

  // Simulate new session: reload the page
  await page.reload();
  await page.waitForTimeout(3000);

  const auth5 = await readAuthStore();
  console.log(`[AUTH] After reload: isAuthenticated=${auth5?.isAuthenticated} registeredUsers=${auth5?.registeredUsers?.length}`);

  // ══════════════════════════════════════════════════════
  // STEP 5: Login again after page refresh
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 5: Login after page refresh ═══');
  await page.goto(`${URL}/auth/login`);
  await page.waitForTimeout(2000);

  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.locator('button:has-text("Sign In")').click();
  await page.waitForTimeout(3000);

  const auth6 = await readAuthStore();
  console.log(`[AUTH] name="${auth6?.user?.name}" id="${auth6?.user?.id}" email="${auth6?.user?.email}" isAuthenticated=${auth6?.isAuthenticated}`);
  console.log(`[URL] ${page.url()}`);

  // ══════════════════════════════════════════════════════
  // VERDICT
  // ══════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL VERDICT                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const step3Pass = auth3?.isAuthenticated && auth3?.user?.email === TEST_EMAIL;
  const step5Pass = auth6?.isAuthenticated && auth6?.user?.email === TEST_EMAIL;

  console.log(`\nTest account: ${TEST_EMAIL}`);
  console.log(`\nStep 3 (login after logout): ${step3Pass ? '✅ PASS' : '❌ FAIL'}`);
  if (step3Pass) console.log(`  Logged in as: ${auth3.user.name} (${auth3.user.email})`);
  console.log(`Step 5 (login after refresh): ${step5Pass ? '✅ PASS' : '❌ FAIL'}`);
  if (step5Pass) console.log(`  Logged in as: ${auth6.user.name} (${auth6.user.email})`);
  console.log(`registeredUsers persisted: ${auth6?.registeredUsers?.length || 0}`);

  if (step3Pass && step5Pass) {
    console.log('\n✅ ALL PASS: Registered accounts persist across logout AND page refresh.');
  } else {
    console.log('\n❌ FAIL: Registered account did not persist.');
  }

  console.log('\n══════════════════════════════════════════════════════════');
  await browser.close();
})();
