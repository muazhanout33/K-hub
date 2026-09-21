/**
 * Phase 6 Browser Verification Script
 * Run from: d:\k-hub-booking-platform
 * Command:  node phase6-verify.mjs
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

let passed = 0;
let failed = 0;

function check(label, value, expected) {
  const ok = expected === undefined ? !!value : value === expected;
  if (ok) passed++; else failed++;
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) {
    console.log(`      Expected: ${JSON.stringify(expected)}`);
    console.log(`      Got:      ${JSON.stringify(value)}`);
  }
  return ok;
}
function info(msg) { console.log(`   ℹ  ${msg}`); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Clear storage ONCE at beginning on real origin
  await page.goto(BASE + '/sponsors');
  await page.evaluate(() => {
    localStorage.removeItem('khub-sponsorship-storage');
    localStorage.removeItem('khub-advertisement-storage');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  console.log('\n══════════════════════════════════════════════');
  console.log('  Phase 6 — Browser Verification');
  console.log('══════════════════════════════════════════════\n');

  // ── TEST 1: /sponsors empty state ──────────────────────────
  console.log('── TEST 1: /sponsors empty state ──');
  await page.goto(BASE + '/sponsors');
  await page.waitForSelector('h2:has-text("No Active Sponsors Yet")', { timeout: 5000 });

  const emptyHeading = await page.locator('h2').filter({ hasText: 'No Active Sponsors Yet' }).count();
  const becomeLink = await page.locator('a[href="/sponsors/apply"]').first().isVisible();
  check('"No Active Sponsors Yet" heading visible', emptyHeading, 1);
  check('"Become a Sponsor" link to /sponsors/apply visible', becomeLink, true);

  // ── TEST 2: Valid Court sponsorship submission ──────────────
  console.log('\n── TEST 2: Valid Court sponsorship submission ──');
  await page.goto(BASE + '/sponsors/apply');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await page.fill('#sponsor-company-name', 'Acme Sports Ltd.');
  await page.fill('#sponsor-contact-name', 'Ahmed Hassan');
  await page.fill('#sponsor-email', 'ahmed@acme.com');
  await page.fill('#sponsor-phone', '+20 100 123 4567');

  // Select Court target type
  await page.click('#target-type-court');
  await page.waitForTimeout(400);

  // Read which court was auto-selected
  const courtSelectEl = page.locator('#sponsor-court-id');
  const autoCourtId = await courtSelectEl.evaluate(el => el.value);
  info(`Court auto-selected: ${autoCourtId}`);

  await page.fill('#sponsor-amount', '25000');
  await page.selectOption('#sponsor-pricing-type', 'PerMonth');

  // Add a benefit chip
  await page.fill('#sponsor-benefit-input', 'Court naming rights');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  // Select placements
  await page.click('#placement-website');
  await page.click('#placement-court-branding');
  await page.waitForTimeout(200);

  // Submit
  await page.click('#sponsor-submit-btn');
  await page.waitForTimeout(1000);

  const successH1 = await page.locator('h1').filter({ hasText: 'Request Submitted!' }).count();
  check('Success screen "Request Submitted!" shown', successH1, 1);

  const sponsorRaw = await page.evaluate(() => localStorage.getItem('khub-sponsorship-storage'));
  const sponsorData = JSON.parse(sponsorRaw);
  const req = sponsorData?.state?.requests?.[0];

  check('localStorage record exists', !!req, true);
  check('status === "Pending"', req?.status, 'Pending');
  check('isActive === false', req?.isActive, false);
  check('targetType === "Court"', req?.targetType, 'Court');
  check('targetId is valid court ID', typeof req?.targetId === 'string' && (req.targetId.startsWith('court-') || req.targetId.startsWith('a1b2c3d4')), true);
  check('companyName === "Acme Sports Ltd."', req?.companyName, 'Acme Sports Ltd.');
  check('email normalized to lowercase', req?.email, 'ahmed@acme.com');
  check('proposedAmount === 25000', req?.proposedAmount, 25000);
  check('pricingType === "PerMonth"', req?.pricingType, 'PerMonth');
  check('approvedBenefits is empty []', Array.isArray(req?.approvedBenefits) && req.approvedBenefits.length === 0, true);
  check('requestedBenefits includes "Court naming rights"', req?.requestedBenefits?.includes('Court naming rights'), true);
  check('requestedPlacement includes "Website"', req?.requestedPlacement?.includes('Website'), true);
  check('currency === "EGP"', req?.currency, 'EGP');
  info(`id: ${req?.id}`);
  info(`createdAt: ${req?.createdAt}`);
  info(`targetId: ${req?.targetId}`);

  // ── TEST 3: /advertise shows exactly 7 spaces ───────────────
  console.log('\n── TEST 3: /advertise shows exactly 7 ad spaces ──');
  await page.goto(BASE + '/advertise');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  const requestBtns = await page.locator('[id^="adspace-request-btn-"]').count();
  check('Exactly 7 "Request This Space" buttons rendered', requestBtns, 7);

  const adspace008Btn = await page.locator('#adspace-request-btn-adspace-008').count();
  check('adspace-008 (VIP Lounge) button NOT in DOM', adspace008Btn, 0);

  // Verify each expected space ID is present
  for (const id of ['adspace-001','adspace-002','adspace-003','adspace-004','adspace-005','adspace-006','adspace-007']) {
    const present = await page.locator(`#adspace-request-btn-${id}`).count();
    check(`${id} button present`, present, 1);
  }

  // ── TEST 4: Valid ad request submission ────────────────────
  console.log('\n── TEST 4: Valid ad request for adspace-001 ──');
  await page.click('#adspace-request-btn-adspace-001');
  await page.waitForTimeout(500);

  const formShown = await page.locator('#ad-request-form').isVisible();
  check('Inline form shown after clicking "Request This Space"', formShown, true);

  await page.fill('#ad-company-name', 'BrandCo Egypt');
  await page.fill('#ad-contact-name', 'Sara Khalil');
  await page.fill('#ad-email', 'sara@brandco.eg');
  await page.fill('#ad-phone', '+20 100 999 8888');
  await page.fill('#ad-start-date', '2026-09-01');
  await page.fill('#ad-end-date', '2026-12-01');
  await page.fill('#ad-budget', '8000');
  await page.fill('#ad-banner-ref', 'https://assets.brandco.eg/banner.png');
  await page.fill('#ad-notes', 'Side wall only');

  await page.click('#ad-submit-btn');
  await page.waitForTimeout(1000);

  const adSuccessText = await page.locator('text=Request submitted — our team will contact you.').count();
  check('Success confirmation shown on adspace-001 card', adSuccessText, 1);

  const adRaw = await page.evaluate(() => localStorage.getItem('khub-advertisement-storage'));
  const adData = JSON.parse(adRaw);
  const adReq = adData?.state?.requests?.[0];

  check('localStorage advertisement record exists', !!adReq, true);
  check('status === "Pending"', adReq?.status, 'Pending');
  check('advertisingSpaceId === "adspace-001"', adReq?.advertisingSpaceId, 'adspace-001');
  check('companyName === "BrandCo Egypt"', adReq?.companyName, 'BrandCo Egypt');
  check('email === "sara@brandco.eg"', adReq?.email, 'sara@brandco.eg');
  check('startDate === "2026-09-01"', adReq?.startDate, '2026-09-01');
  check('endDate === "2026-12-01"', adReq?.endDate, '2026-12-01');
  check('proposedBudget === 8000', adReq?.proposedBudget, 8000);
  check('bannerReference stored', adReq?.bannerReference, 'https://assets.brandco.eg/banner.png');
  info(`id: ${adReq?.id}`);
  info(`createdAt: ${adReq?.createdAt}`);

  // ── TEST 5: endDate <= startDate rejected ──────────────────
  console.log('\n── TEST 5: endDate ≤ startDate → rejected ──');
  await page.goto(BASE + '/advertise');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await page.click('#adspace-request-btn-adspace-002');
  await page.waitForTimeout(400);

  await page.fill('#ad-company-name', 'TestCo');
  await page.fill('#ad-contact-name', 'Test User');
  await page.fill('#ad-email', 'test@test.com');
  await page.fill('#ad-phone', '+20 100 000 0001');
  await page.fill('#ad-start-date', '2026-10-15');
  await page.fill('#ad-end-date', '2026-10-15'); // same date — must fail

  await page.fill('#ad-budget', '1000');

  // Listen for toast
  const toastEl = page.locator('[data-sonner-toast]');
  await page.click('#ad-submit-btn');
  await page.waitForTimeout(800);

  const toastCount5 = await toastEl.count();
  let toastText5 = '';
  if (toastCount5 > 0) toastText5 = await toastEl.first().innerText();
  info(`Toast text: "${toastText5}"`);
  check('Toast appears for bad date order', toastCount5 > 0, true);
  check('Toast message mentions "after"', toastText5.toLowerCase().includes('after'), true);

  const adRawAfter5 = await page.evaluate(() => localStorage.getItem('khub-advertisement-storage'));
  const adDataAfter5 = JSON.parse(adRawAfter5);
  check('No new record stored (still 1 record)', adDataAfter5?.state?.requests?.length, 1);

  // ── TEST 6: Overlapping request rejected ───────────────────
  console.log('\n── TEST 6: Overlapping dates on adspace-001 → rejected ──');
  // adspace-001 already has Pending: 2026-09-01 → 2026-12-01
  await page.goto(BASE + '/advertise');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  await page.click('#adspace-request-btn-adspace-001');
  await page.waitForTimeout(400);

  await page.fill('#ad-company-name', 'Overlap Corp');
  await page.fill('#ad-contact-name', 'Omar Nasser');
  await page.fill('#ad-email', 'omar@overlapcorp.com');
  await page.fill('#ad-phone', '+20 100 777 6666');
  // Overlapping window: Oct–Nov falls inside Sep–Dec
  await page.fill('#ad-start-date', '2026-10-01');
  await page.fill('#ad-end-date', '2026-11-01');
  await page.fill('#ad-budget', '5000');

  const overlapToastEl = page.locator('[data-sonner-toast]');
  await page.click('#ad-submit-btn');
  await page.waitForTimeout(1000);

  const overlapToastCount = await overlapToastEl.count();
  let overlapToastText = '';
  if (overlapToastCount > 0) overlapToastText = await overlapToastEl.first().innerText();
  info(`Toast text: "${overlapToastText}"`);
  check('Toast appears for overlapping dates', overlapToastCount > 0, true);
  check('Toast message mentions "overlap"', overlapToastText.toLowerCase().includes('overlap'), true);

  const adRawAfterOverlap = await page.evaluate(() => localStorage.getItem('khub-advertisement-storage'));
  const adDataAfterOverlap = JSON.parse(adRawAfterOverlap);
  check('No new record stored after overlap rejection (still 1)', adDataAfterOverlap?.state?.requests?.length, 1);

  // ── TEST 7: Temp-approve → sponsor appears → revert → empty ─
  console.log('\n── TEST 7: Temp-approve sponsorship ──');
  await page.goto(BASE + '/sponsors', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Patch localStorage to mark request as Approved + active
  await page.evaluate(() => {
    const raw = localStorage.getItem('khub-sponsorship-storage');
    const data = JSON.parse(raw);
    data.state.requests[0].status = 'Approved';
    data.state.requests[0].isActive = true;
    localStorage.setItem('khub-sponsorship-storage', JSON.stringify(data));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sponsor-card', { timeout: 5000 });

  const sponsorCards = await page.locator('.sponsor-card').count();
  const cardCompany = await page.locator('.sponsor-card h3').first().innerText().catch(() => '');
  const cardBadge = await page.locator('.sponsor-card').first().locator('text=Court').count();
  check('Sponsor card appears after approve', sponsorCards, 1);
  check('Card shows company "Acme Sports Ltd."', cardCompany, 'Acme Sports Ltd.');
  check('Card shows targetType badge "Court"', cardBadge, 1);
  info(`Sponsor card company: "${cardCompany}"`);

  // Revert
  await page.evaluate(() => {
    const raw = localStorage.getItem('khub-sponsorship-storage');
    const data = JSON.parse(raw);
    data.state.requests[0].status = 'Pending';
    data.state.requests[0].isActive = false;
    localStorage.setItem('khub-sponsorship-storage', JSON.stringify(data));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h2:has-text("No Active Sponsors Yet")', { timeout: 3000 });

  const emptyAgain = await page.locator('h2').filter({ hasText: 'No Active Sponsors Yet' }).count();
  check('Empty state returns after revert', emptyAgain, 1);

  // ── SUMMARY ────────────────────────────────────────────────
  await browser.close();

  console.log('\n══════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('\nScript error:', err);
  process.exit(1);
});
