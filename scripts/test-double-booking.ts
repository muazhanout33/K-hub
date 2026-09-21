/**
 * Phase 9 — Concurrency Test: Double Booking Prevention
 *
 * Tests the `prevent_double_booking` EXCLUDE USING gist constraint
 * by firing concurrent booking attempts for the same court + overlapping time range.
 *
 * Prerequisites:
 *   1. Two authenticated users exist in Supabase (email/password)
 *   2. A court with status 'Available' exists
 *   3. The booking time slot is in the future
 *
 * Run: npx tsx scripts/test-double-booking.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Test credentials — two different users (set via env vars, no defaults)
const USER_A_EMAIL = process.env.TEST_USER_A_EMAIL ?? '';
const USER_A_PASSWORD = process.env.TEST_USER_A_PASSWORD ?? '';
const USER_B_EMAIL = process.env.TEST_USER_B_EMAIL ?? '';
const USER_B_PASSWORD = process.env.TEST_USER_B_PASSWORD ?? '';

// Test parameters — adjust these to match a real court in your DB
const TEST_COURT_ID = process.env.TEST_COURT_ID || ''; // Must be a real UUID from your courts table
const TEST_DATE = process.env.TEST_DATE || (() => {
  // Default: tomorrow
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
})();
const TEST_START = process.env.TEST_START || '10:00';
const TEST_END = process.env.TEST_END || '11:00';

// ── Helpers ─────────────────────────────────────

function formatTstzrange(date: string, startTime: string, endTime: string): string {
  const [startH] = startTime.split(':').map(Number);
  const [endH] = endTime.split(':').map(Number);
  let startDateStr = date;
  if (startH < 6) {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    startDateStr = d.toISOString().split('T')[0];
  }
  let endDateStr = startDateStr;
  if (endH < startH || (endH === startH && endTime <= startTime)) {
    const d = new Date(startDateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    endDateStr = d.toISOString().split('T')[0];
  }
  return `[${startDateStr} ${startTime}:00+00, ${endDateStr} ${endTime}:00+00)`;
}

function makeBookingNumber(): string {
  return `KH-TEST-${Math.floor(100000 + Math.random() * 900000)}`;
}

async function createAuthenticatedClient(email: string, password: string): Promise<SupabaseClient> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Failed to sign in as ${email}: ${error?.message || 'No user'}`);
  }
  console.log(`  ✓ Signed in as ${email} (${data.user.id})`);
  return supabase;
}

interface InsertResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  bookingId?: string;
}

async function attemptBooking(
  supabase: SupabaseClient,
  userId: string,
  label: string
): Promise<InsertResult> {
  const bookingRange = formatTstzrange(TEST_DATE, TEST_START, TEST_END);
  const bookingNumber = makeBookingNumber();

  try {
    const { data, error } = await (supabase.from('bookings') as any)
      .insert({
        booking_number: bookingNumber,
        user_id: userId,
        court_id: TEST_COURT_ID,
        booking_range: bookingRange,
        duration_minutes: 60,
        total_price: 100,
        status: 'Reserved',
        booking_source: 'ONLINE',
        user_name: `Test User ${label}`,
        user_email: `${label.toLowerCase()}@khub-test.com`,
        user_phone: '0000000000',
      })
      .select('id')
      .single();

    if (error) {
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
      };
    }

    return { success: true, bookingId: data?.id };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Tests ───────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

async function test1_ConcurrentIdenticalOverlap(): Promise<TestResult> {
  console.log('\n━━━ TEST 1: Concurrent identical overlap (same court, same range) ━━━');

  const clientA = await createAuthenticatedClient(USER_A_EMAIL, USER_A_PASSWORD);
  const clientB = await createAuthenticatedClient(USER_B_EMAIL, USER_B_PASSWORD);

  const { data: userA } = await clientA.auth.getUser();
  const { data: userB } = await clientB.auth.getUser();
  if (!userA.user || !userB.user) {
    return { name: 'Test 1', passed: false, details: 'Could not get user IDs' };
  }

  console.log(`  Booking slot: ${TEST_DATE} ${TEST_START}–${TEST_END} on court ${TEST_COURT_ID}`);
  console.log('  Firing concurrent inserts...');

  const [resultA, resultB] = await Promise.all([
    attemptBooking(clientA, userA.user.id, 'A'),
    attemptBooking(clientB, userB.user.id, 'B'),
  ]);

  const successes = [resultA, resultB].filter(r => r.success);
  const failures = [resultA, resultB].filter(r => !r.success);

  console.log(`  Result A: ${resultA.success ? `SUCCESS (${resultA.bookingId})` : `FAIL (${resultA.errorCode}: ${resultA.error})`}`);
  console.log(`  Result B: ${resultB.success ? `SUCCESS (${resultB.bookingId})` : `FAIL (${resultB.errorCode}: ${resultB.error})`}`);

  const passed = successes.length === 1 && failures.length === 1;
  const failureIsConstraint = failures.every(f =>
    f.errorCode === '23P01' || (f.error || '').includes('prevent_double_booking') ||
    (f.error || '').includes('already been booked')
  );

  const details = passed
    ? `PASS — Exactly 1 succeeded, 1 failed with constraint violation`
    : `FAIL — ${successes.length} succeeded, ${failures.length} failed`;

  console.log(`  ${passed && failureIsConstraint ? '✅' : '❌'} ${details}`);
  return { name: 'Test 1: Concurrent identical overlap', passed: passed && failureIsConstraint, details };
}

async function test2_PartialOverlap(): Promise<TestResult> {
  console.log('\n━━━ TEST 2: Partial overlap (18:00–19:00 vs 18:30–19:30) ━━━');

  const clientA = await createAuthenticatedClient(USER_A_EMAIL, USER_A_PASSWORD);
  const clientB = await createAuthenticatedClient(USER_B_EMAIL, USER_B_PASSWORD);

  const { data: userA } = await clientA.auth.getUser();
  const { data: userB } = await clientB.auth.getUser();
  if (!userA.user || !userB.user) {
    return { name: 'Test 2', passed: false, details: 'Could not get user IDs' };
  }

  // Use a different time slot to avoid conflicts with Test 1
  const slotA = { start: '18:00', end: '19:00' };
  const slotB = { start: '18:30', end: '19:30' }; // Overlaps with A

  console.log(`  Slot A: ${TEST_DATE} ${slotA.start}–${slotA.end}`);
  console.log(`  Slot B: ${TEST_DATE} ${slotB.start}–${slotB.end} (overlaps with A)`);
  console.log('  Firing concurrent inserts...');

  const [resultA, resultB] = await Promise.all([
    attemptBooking(clientA, userA.user.id, 'A'),
    attemptBooking(clientB, userB.user.id, 'B'),
  ]);

  // For this test, we need to manually set the times since attemptBooking uses the global TEST_START/TEST_END
  // Let me re-implement with custom times
  const bookingRangeA = formatTstzrange(TEST_DATE, slotA.start, slotA.end);
  const bookingRangeB = formatTstzrange(TEST_DATE, slotB.start, slotB.end);

  const [{ data: rA }, { data: rB }] = await Promise.all([
    (clientA.from('bookings') as any).insert({
      booking_number: makeBookingNumber(),
      user_id: userA.user.id,
      court_id: TEST_COURT_ID,
      booking_range: bookingRangeA,
      duration_minutes: 60,
      total_price: 100,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Test User A',
      user_email: 'a@khub-test.com',
      user_phone: '0000000000',
    }).select('id').single(),
    (clientB.from('bookings') as any).insert({
      booking_number: makeBookingNumber(),
      user_id: userB.user.id,
      court_id: TEST_COURT_ID,
      booking_range: bookingRangeB,
      duration_minutes: 60,
      total_price: 100,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Test User B',
      user_email: 'b@khub-test.com',
      user_phone: '0000000000',
    }).select('id').single(),
  ]);

  const resultASuccess = rA && !rA.error;
  const resultBSuccess = rB && !rB.error;
  const successes = [resultASuccess, resultBSuccess].filter(Boolean).length;
  const failures = 2 - successes;

  console.log(`  Result A: ${resultASuccess ? `SUCCESS (${rA?.id})` : 'FAIL'}`);
  console.log(`  Result B: ${resultBSuccess ? `SUCCESS (${rB?.id})` : 'FAIL'}`);

  const passed = successes === 1 && failures === 1;
  const details = passed
    ? `PASS — Exactly 1 succeeded, 1 rejected (partial overlap detected)`
    : `FAIL — ${successes} succeeded, ${failures} failed`;

  console.log(`  ${passed ? '✅' : '❌'} ${details}`);
  return { name: 'Test 2: Partial overlap', passed, details };
}

async function test3_BackToBackAllowed(): Promise<TestResult> {
  console.log('\n━━━ TEST 3: Back-to-back bookings (18:00–19:00 and 19:00–20:00) — should BOTH succeed ━━━');

  const clientA = await createAuthenticatedClient(USER_A_EMAIL, USER_A_PASSWORD);
  const clientB = await createAuthenticatedClient(USER_B_EMAIL, USER_B_PASSWORD);

  const { data: userA } = await clientA.auth.getUser();
  const { data: userB } = await clientB.auth.getUser();
  if (!userA.user || !userB.user) {
    return { name: 'Test 3', passed: false, details: 'Could not get user IDs' };
  }

  const slotA = { start: '19:00', end: '20:00' };
  const slotB = { start: '20:00', end: '21:00' }; // Back-to-back, no overlap

  const bookingRangeA = formatTstzrange(TEST_DATE, slotA.start, slotA.end);
  const bookingRangeB = formatTstzrange(TEST_DATE, slotB.start, slotB.end);

  console.log(`  Slot A: ${TEST_DATE} ${slotA.start}–${slotA.end}`);
  console.log(`  Slot B: ${TEST_DATE} ${slotB.start}–${slotB.end} (back-to-back, no overlap)`);
  console.log('  Firing concurrent inserts...');

  const [{ data: rA, error: eA }, { data: rB, error: eB }] = await Promise.all([
    (clientA.from('bookings') as any).insert({
      booking_number: makeBookingNumber(),
      user_id: userA.user.id,
      court_id: TEST_COURT_ID,
      booking_range: bookingRangeA,
      duration_minutes: 60,
      total_price: 100,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Test User A',
      user_email: 'a@khub-test.com',
      user_phone: '0000000000',
    }).select('id').single(),
    (clientB.from('bookings') as any).insert({
      booking_number: makeBookingNumber(),
      user_id: userB.user.id,
      court_id: TEST_COURT_ID,
      booking_range: bookingRangeB,
      duration_minutes: 60,
      total_price: 100,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Test User B',
      user_email: 'b@khub-test.com',
      user_phone: '0000000000',
    }).select('id').single(),
  ]);

  const resultASuccess = !eA && rA;
  const resultBSuccess = !eB && rB;

  console.log(`  Result A: ${resultASuccess ? `SUCCESS (${rA?.id})` : `FAIL (${eA?.message})`}`);
  console.log(`  Result B: ${resultBSuccess ? `SUCCESS (${rB?.id})` : `FAIL (${eB?.message})`}`);

  const passed = resultASuccess && resultBSuccess;
  const details = passed
    ? `PASS — Both back-to-back bookings succeeded (no false rejection)`
    : `FAIL — One or both were incorrectly rejected`;

  console.log(`  ${passed ? '✅' : '❌'} ${details}`);
  return { name: 'Test 3: Back-to-back allowed', passed, details };
}

async function test4_DifferentCourtsSucceed(): Promise<TestResult> {
  console.log('\n━━━ TEST 4: Overlapping bookings on DIFFERENT courts — should BOTH succeed ━━━');

  const clientA = await createAuthenticatedClient(USER_A_EMAIL, USER_A_PASSWORD);
  const clientB = await createAuthenticatedClient(USER_B_EMAIL, USER_B_PASSWORD);

  const { data: userA } = await clientA.auth.getUser();
  const { data: userB } = await clientB.auth.getUser();
  if (!userA.user || !userB.user) {
    return { name: 'Test 4', passed: false, details: 'Could not get user IDs' };
  }

  // We need a second court ID. Use TEST_COURT_ID for both but with different courts.
  // This test requires at least 2 courts in the DB. If only 1 court, skip.
  const COURT_2_ID = process.env.TEST_COURT_2_ID || '';
  if (!COURT_2_ID) {
    console.log('  ⚠️  SKIPPED — Set TEST_COURT_2_ID env var to test different courts');
    return { name: 'Test 4: Different courts', passed: true, details: 'SKIPPED — No second court ID provided' };
  }

  const bookingRange = formatTstzrange(TEST_DATE, '21:00', '22:00');

  console.log(`  Both booking slot: ${TEST_DATE} 21:00–22:00`);
  console.log(`  Court A: ${TEST_COURT_ID}, Court B: ${COURT_2_ID}`);
  console.log('  Firing concurrent inserts...');

  const [{ data: rA, error: eA }, { data: rB, error: eB }] = await Promise.all([
    (clientA.from('bookings') as any).insert({
      booking_number: makeBookingNumber(),
      user_id: userA.user.id,
      court_id: TEST_COURT_ID,
      booking_range: bookingRange,
      duration_minutes: 60,
      total_price: 100,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Test User A',
      user_email: 'a@khub-test.com',
      user_phone: '0000000000',
    }).select('id').single(),
    (clientB.from('bookings') as any).insert({
      booking_number: makeBookingNumber(),
      user_id: userB.user.id,
      court_id: COURT_2_ID,
      booking_range: bookingRange,
      duration_minutes: 60,
      total_price: 100,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Test User B',
      user_email: 'b@khub-test.com',
      user_phone: '0000000000',
    }).select('id').single(),
  ]);

  const resultASuccess = !eA && rA;
  const resultBSuccess = !eB && rB;

  console.log(`  Result A: ${resultASuccess ? `SUCCESS (${rA?.id})` : `FAIL (${eA?.message})`}`);
  console.log(`  Result B: ${resultBSuccess ? `SUCCESS (${rB?.id})` : `FAIL (${eB?.message})`}`);

  const passed = resultASuccess && resultBSuccess;
  const details = passed
    ? `PASS — Both bookings on different courts succeeded (constraint is per-court)`
    : `FAIL — One or both were incorrectly rejected`;

  console.log(`  ${passed ? '✅' : '❌'} ${details}`);
  return { name: 'Test 4: Different courts', passed, details };
}

async function test5_ExpiredDoesNotBlock(): Promise<TestResult> {
  console.log('\n━━━ TEST 5: Expired/Cancelled booking does NOT block new booking for same slot ━━━');

  const clientA = await createAuthenticatedClient(USER_A_EMAIL, USER_A_PASSWORD);

  const { data: userA } = await clientA.auth.getUser();
  if (!userA.user) {
    return { name: 'Test 5', passed: false, details: 'Could not get user ID' };
  }

  // Insert a booking, then cancel it, then try to book the same slot
  const testSlot = { start: '22:00', end: '23:00' };
  const bookingRange = formatTstzrange(TEST_DATE, testSlot.start, testSlot.end);

  console.log(`  Step 1: Insert booking at ${TEST_DATE} ${testSlot.start}–${testSlot.end}...`);

  const { data: inserted, error: insertErr } = await (clientA.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(),
      user_id: userA.user.id,
      court_id: TEST_COURT_ID,
      booking_range: bookingRange,
      duration_minutes: 60,
      total_price: 100,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Test User A',
      user_email: 'a@khub-test.com',
      user_phone: '0000000000',
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return { name: 'Test 5', passed: false, details: `Initial insert failed: ${insertErr?.message}` };
  }
  console.log(`  ✓ Inserted booking ${inserted.id}`);

  // Cancel it
  console.log('  Step 2: Cancel the booking...');
  const { error: cancelErr } = await (clientA.from('bookings') as any)
    .update({ status: 'Cancelled' })
    .eq('id', inserted.id);

  if (cancelErr) {
    return { name: 'Test 5', passed: false, details: `Cancel failed: ${cancelErr.message}` };
  }
  console.log('  ✓ Booking cancelled');

  // Try to book the same slot again
  console.log('  Step 3: Insert new booking for same slot...');
  const { data: newBooking, error: newErr } = await (clientA.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(),
      user_id: userA.user.id,
      court_id: TEST_COURT_ID,
      booking_range: bookingRange,
      duration_minutes: 60,
      total_price: 100,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Test User A',
      user_email: 'a@khub-test.com',
      user_phone: '0000000000',
    })
    .select('id')
    .single();

  const success = !newErr && newBooking;
  console.log(`  Result: ${success ? `SUCCESS (${newBooking?.id})` : `FAIL (${newErr?.message})`}`);

  const details = success
    ? `PASS — Cancelled booking freed the slot, new booking succeeded`
    : `FAIL — Cancelled booking still blocks new booking`;

  console.log(`  ${success ? '✅' : '❌'} ${details}`);
  return { name: 'Test 5: Expired/Cancelled does not block', passed: !!success, details };
}

// ── Cleanup ─────────────────────────────────────

async function cleanupTestBookings(): Promise<void> {
  console.log('\n━━━ CLEANUP: Removing test bookings ━━━');
  const client = await createAuthenticatedClient(USER_A_EMAIL, USER_A_PASSWORD);

  const { data, error } = await client
    .from('bookings')
    .delete()
    .like('booking_number', 'KH-TEST-%')
    .select('id');

  if (error) {
    console.log(`  ⚠️  Cleanup error: ${error.message}`);
  } else {
    console.log(`  ✓ Removed ${data?.length || 0} test bookings`);
  }
}

// ── Main ────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Phase 9 — Double Booking Concurrency Test Suite        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nSupabase URL: ${SUPABASE_URL}`);
  console.log(`Test court: ${TEST_COURT_ID || '(not set — set TEST_COURT_ID)'}`);
  console.log(`Test date: ${TEST_DATE}`);
  console.log(`Test slot: ${TEST_START}–${TEST_END}`);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('\n❌ NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local');
    process.exit(1);
  }
  if (!USER_A_EMAIL || !USER_A_PASSWORD || !USER_B_EMAIL || !USER_B_PASSWORD) {
    console.error('\n❌ Test credentials not set. Provide via env vars:');
    console.error('   TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD, TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD');
    process.exit(1);
  }
  if (!TEST_COURT_ID) {
    console.error('\n❌ TEST_COURT_ID not set. Provide a real court UUID via env var.');
    console.error('   Example: TEST_COURT_ID=<uuid> npx tsx scripts/test-double-booking.ts');
    process.exit(1);
  }

  const results: TestResult[] = [];

  try {
    results.push(await test1_ConcurrentIdenticalOverlap());
    results.push(await test2_PartialOverlap());
    results.push(await test3_BackToBackAllowed());
    results.push(await test4_DifferentCourtsSucceed());
    results.push(await test5_ExpiredDoesNotBlock());

    await cleanupTestBookings();
  } catch (err) {
    console.error('\n❌ Test suite error:', err);
  }

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  RESULTS                                                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}: ${r.details}`);
  }

  const allPassed = results.every(r => r.passed);
  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

main();
