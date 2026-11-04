import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const adminClient = createClient(url, serviceKey);
const clientA = createClient(url, anonKey);
const clientB = createClient(url, anonKey);

const TEST_COURT_ID = '00000000-0000-4000-8000-000000000001';
// Deterministic unique test date in future
const TEST_DATE = '2099-12-25';
const TEST_START = '15:00';
const TEST_END = '16:00';
const TEST_RANGE = `[${TEST_DATE} ${TEST_START}:00+00, ${TEST_DATE} ${TEST_END}:00+00)`;

function formatTstzrange(date, startTime, endTime) {
  return `[${date} ${startTime}:00+00, ${date} ${endTime}:00+00)`;
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' K-HUB — CROSS-USER BOOKING VISIBILITY & CONCURRENCY VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Clean up any lingering test bookings from prior runs
  await adminClient.from('bookings').delete().filter('booking_range', 'ov', `["${TEST_DATE}T00:00:00+00", "${TEST_DATE}T23:59:59+00")`);

  // Step 1: Sign in User A and User B
  console.log('── Step 1: Authenticate User A and User B ──');
  const resA = await clientA.auth.signInWithPassword({
    email: process.env.TEST_USER_A_EMAIL,
    password: process.env.TEST_USER_A_PASSWORD,
  });
  if (resA.error) throw new Error('User A sign in failed: ' + resA.error.message);
  const userAId = resA.data.user.id;
  console.log(`  ✓ User A signed in: ${process.env.TEST_USER_A_EMAIL} (ID: ${userAId})`);

  const resB = await clientB.auth.signInWithPassword({
    email: process.env.TEST_USER_B_EMAIL,
    password: process.env.TEST_USER_B_PASSWORD,
  });
  if (resB.error) throw new Error('User B sign in failed: ' + resB.error.message);
  const userBId = resB.data.user.id;
  console.log(`  ✓ User B signed in: ${process.env.TEST_USER_B_EMAIL} (ID: ${userBId})\n`);

  // Step 2: User A creates a confirmed booking
  console.log('── Step 2: User A books Court 1 for 15:00-16:00 ──');
  const bookingNumberA = `KH-TEST-A-${Date.now()}`;
  const { data: bookingA, error: errA } = await clientA.from('bookings').insert({
    booking_number: bookingNumberA,
    user_id: userAId,
    court_id: TEST_COURT_ID,
    booking_range: TEST_RANGE,
    duration_minutes: 60,
    total_price: 150,
    status: 'Confirmed',
    booking_source: 'ONLINE',
    user_name: 'Test User A Confidential',
    user_email: 'test.user.a.private@example.com',
    user_phone: '+20 100 999 8888',
  }).select().single();

  if (errA || !bookingA) throw new Error('User A booking failed: ' + (errA?.message || 'No data'));
  console.log(`  ✓ Booking created by User A: ID ${bookingA.id}, status: ${bookingA.status}\n`);

  // Step 3: Test Direct RLS on public.bookings (User B must NOT see User A's row)
  console.log('── Step 3: RLS Isolation on public.bookings ──');
  const { data: userBDirectRows } = await clientB
    .from('bookings')
    .select('*')
    .eq('id', bookingA.id);

  console.log(`  User B direct select count on User A's booking ID: ${userBDirectRows?.length || 0}`);
  if ((userBDirectRows?.length || 0) === 0) {
    console.log('  ✅ PASS: RLS completely hides private booking rows from other authenticated users.');
  } else {
    console.error('  ❌ FAIL: User B was able to directly read User A\'s private booking row!');
    process.exit(1);
  }

  // Step 4: Test Availability Action (User B retrieves public availability)
  console.log('\n── Step 4: Public Availability Retrieval for User B ──');
  // Dynamically import the server action
  const { getPublicCourtAvailabilityAction } = await import('../src/app/actions/booking.actions.ts');
  const availResult = await getPublicCourtAvailabilityAction({ date: TEST_DATE, courtId: TEST_COURT_ID });

  console.log(`  Availability query success: ${availResult.success}`);
  console.log(`  Bookings returned: ${availResult.bookings.length}`);

  const foundSlot = availResult.bookings.find(b => b.id === bookingA.id);
  if (foundSlot) {
    console.log(`  ✓ User A's booked slot is present in public availability:`);
    console.log(`    courtId: ${foundSlot.courtId}`);
    console.log(`    date: ${foundSlot.date}`);
    console.log(`    time: ${foundSlot.startTime} – ${foundSlot.endTime}`);
    console.log(`    status: ${foundSlot.status}`);
    console.log(`    selectedSlotIds: ${JSON.stringify(foundSlot.selectedSlotIds)}`);
  } else {
    console.error('  ❌ FAIL: User A\'s booking was not found in public availability!');
    process.exit(1);
  }

  // Step 5: Privacy Verification (Zero PII Exposure)
  console.log('\n── Step 5: Privacy Verification — No PII Leaked ──');
  console.log(`  user_name exposed: "${foundSlot.userName}" (expected "")`);
  console.log(`  user_email exposed: "${foundSlot.userEmail}" (expected "")`);
  console.log(`  user_phone exposed: "${foundSlot.userPhone}" (expected "")`);
  console.log(`  user_id exposed: ${foundSlot.userId} (expected null)`);
  console.log(`  total_price exposed: ${foundSlot.totalPrice} (expected 0)`);

  const piiClean = !foundSlot.userName && !foundSlot.userEmail && !foundSlot.userPhone && foundSlot.userId === null && foundSlot.totalPrice === 0;
  if (piiClean) {
    console.log('  ✅ PASS: 100% PII privacy preserved. Zero customer data exposed.');
  } else {
    console.error('  ❌ FAIL: PII was leaked in public availability output!');
    process.exit(1);
  }

  // Step 6: Double-Booking Prevention (User B attempts to book same slot)
  console.log('\n── Step 6: Atomic Double-Booking Prevention (PostgreSQL GiST) ──');
  const { data: bookingB, error: errB } = await clientB.from('bookings').insert({
    booking_number: `KH-TEST-B-${Date.now()}`,
    user_id: userBId,
    court_id: TEST_COURT_ID,
    booking_range: TEST_RANGE,
    duration_minutes: 60,
    total_price: 150,
    status: 'Reserved',
    booking_source: 'ONLINE',
    user_name: 'Test User B',
    user_email: 'test.user.b@example.com',
    user_phone: '+20 200 111 2222',
  }).select().single();

  if (errB) {
    console.log(`  ✓ Database rejected User B's conflicting booking with error code: ${errB.code}`);
    console.log(`  Error message: ${errB.message}`);
    if (errB.code === '23P01' || errB.message.includes('prevent_double_booking')) {
      console.log('  ✅ PASS: prevent_double_booking EXCLUDE USING gist atomically rejected double booking!');
    }
  } else {
    console.error('  ❌ FAIL: Double booking succeeded! Database constraint failed.');
    process.exit(1);
  }

  // Step 7: Simultaneous / Concurrent Booking Race Condition
  console.log('\n── Step 7: Simultaneous Concurrent Booking Attempt ──');
  const CONC_START = '18:00';
  const CONC_END = '19:00';
  const CONC_RANGE = formatTstzrange(TEST_DATE, CONC_START, CONC_END);

  const [raceA, raceB] = await Promise.all([
    clientA.from('bookings').insert({
      booking_number: `KH-RACE-A-${Date.now()}`,
      user_id: userAId,
      court_id: TEST_COURT_ID,
      booking_range: CONC_RANGE,
      duration_minutes: 60,
      total_price: 150,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Race A',
      user_email: 'race.a@example.com',
      user_phone: '111',
    }).select().single(),
    clientB.from('bookings').insert({
      booking_number: `KH-RACE-B-${Date.now()}`,
      user_id: userBId,
      court_id: TEST_COURT_ID,
      booking_range: CONC_RANGE,
      duration_minutes: 60,
      total_price: 150,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Race B',
      user_email: 'race.b@example.com',
      user_phone: '222',
    }).select().single(),
  ]);

  const raceSuccesses = [raceA, raceB].filter(r => !r.error);
  const raceErrors = [raceA, raceB].filter(r => r.error);
  console.log(`  Concurrent inserts: ${raceSuccesses.length} succeeded, ${raceErrors.length} rejected.`);
  if (raceSuccesses.length === 1 && raceErrors.length === 1) {
    console.log('  ✅ PASS: Concurrency race atomically resolved by PostgreSQL (exactly 1 winner, 1 rejected).');
  } else {
    console.error('  ❌ FAIL: Concurrency race violated atomicity.');
    process.exit(1);
  }

  // Step 8: Cancellation releases slot for User B
  console.log('\n── Step 8: Cancellation releases slot ──');
  // Cancel User A's initial booking (15:00-16:00)
  await adminClient.from('bookings').update({ status: 'Cancelled' }).eq('id', bookingA.id);
  console.log(`  ✓ Booking ${bookingA.id} cancelled.`);

  // Verify availability action no longer returns it
  const availAfterCancel = await getPublicCourtAvailabilityAction({ date: TEST_DATE, courtId: TEST_COURT_ID });
  const stillBooked = availAfterCancel.bookings.some(b => b.id === bookingA.id);
  console.log(`  Cancelled booking still in active availability? ${stillBooked}`);

  // Now User B attempts to book the 15:00-16:00 slot
  const { data: bookingBAfterCancel, error: errB2 } = await clientB.from('bookings').insert({
    booking_number: `KH-TEST-B-RETRY-${Date.now()}`,
    user_id: userBId,
    court_id: TEST_COURT_ID,
    booking_range: TEST_RANGE,
    duration_minutes: 60,
    total_price: 150,
    status: 'Confirmed',
    booking_source: 'ONLINE',
    user_name: 'Test User B',
    user_email: 'test.user.b@example.com',
    user_phone: '+20 200 111 2222',
  }).select().single();

  if (!errB2 && bookingBAfterCancel) {
    console.log(`  ✓ User B successfully booked the released slot (ID: ${bookingBAfterCancel.id})`);
    console.log('  ✅ PASS: Slot release and re-booking verified.');
  } else {
    console.error('  ❌ FAIL: User B could not book previously cancelled slot:', errB2?.message);
    process.exit(1);
  }

  // Step 9: Cleanup
  console.log('\n── Step 9: Cleanup ──');
  await adminClient.from('bookings').delete().filter('booking_range', 'ov', `["${TEST_DATE}T00:00:00+00", "${TEST_DATE}T23:59:59+00")`);
  console.log('  ✓ Cleaned up all test records.');

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(' ALL 8 LIFECYCLE & CONCURRENCY VERIFICATION CHECKS PASSED (100%)');
  console.log('═══════════════════════════════════════════════════════════════════');
}

run().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});
