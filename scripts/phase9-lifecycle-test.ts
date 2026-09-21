/**
 * Phase 9 — Lifecycle & Edge Case Tests (user-level operations)
 * 
 * Tests status transitions, booking lifecycle, and edge cases.
 * Uses authenticated user clients (no service-role dependency).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
}

const URL = env['NEXT_PUBLIC_SUPABASE_URL']!;
const ANON_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!;
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']!;

const admin = createClient(URL, SERVICE_KEY);
const TEST_COURT_ID = 'a1b2c3d4-0001-4000-8000-000000000001';
const TEST_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().split('T')[0];
})();

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
  return `KH-LC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

async function createTestUser(email: string): Promise<TestUser | null> {
  const password = `LCTest${Date.now()}!`;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) return null;
    const client = createClient(URL, ANON_KEY);
    await client.auth.signInWithPassword({ email, password });
    return { id: data.user.id, email, client };
  } catch { return null; }
}

interface TestResult { name: string; passed: boolean; details: string; }

async function test_CancelReleasesSlot(): Promise<TestResult> {
  console.log('\n━━━ LIFECYCLE 1: Cancel releases slot for rebooking ━━━');
  const user = await createTestUser(`lc-cancel-${Date.now()}@test.com`);
  if (!user) return { name: 'Cancel releases slot', passed: false, details: 'Could not create user' };

  const range = formatTstzrange(TEST_DATE, '10:00', '11:00');

  // Step 1: Insert
  const { data: b1, error: e1 } = await (user.client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(), user_id: user.id, court_id: TEST_COURT_ID,
      booking_range: range, duration_minutes: 60, total_price: 400,
      status: 'Reserved', booking_source: 'ONLINE',
      user_name: 'LC Cancel Test', user_email: user.email, user_phone: '0000000000',
    }).select('id').single();

  if (e1 || !b1) return { name: 'Cancel releases slot', passed: false, details: `Insert failed: ${e1?.message}` };
  console.log(`  ✓ Step 1: Inserted booking ${b1.id}`);

  // Step 2: Update to Cancelled (user owns it, allowed by RLS)
  const { error: e2 } = await (user.client.from('bookings') as any)
    .update({ status: 'Cancelled' })
    .eq('id', b1.id);

  if (e2) return { name: 'Cancel releases slot', passed: false, details: `Cancel failed: ${e2.message} (code: ${e2.code})` };
  console.log('  ✓ Step 2: Booking cancelled');

  // Step 3: Rebook same slot
  const { data: b3, error: e3 } = await (user.client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(), user_id: user.id, court_id: TEST_COURT_ID,
      booking_range: range, duration_minutes: 60, total_price: 400,
      status: 'Reserved', booking_source: 'ONLINE',
      user_name: 'LC Cancel Rebook', user_email: user.email, user_phone: '0000000000',
    }).select('id').single();

  const passed = !e3 && !!b3;
  console.log(`  ${passed ? '✅' : '❌'} Step 3: Rebook after cancel: ${passed ? `SUCCESS (${b3?.id})` : `FAIL (${e3?.message})`}`);
  return { name: 'Cancel releases slot', passed, details: passed ? 'PASS' : `FAIL: ${e3?.message}` };
}

async function test_ConfirmKeepsSlot(): Promise<TestResult> {
  console.log('\n━━━ LIFECYCLE 2: Confirm keeps slot (no double booking possible) ━━━');
  const user = await createTestUser(`lc-confirm-${Date.now()}@test.com`);
  if (!user) return { name: 'Confirm keeps slot', passed: false, details: 'Could not create user' };

  const range = formatTstzrange(TEST_DATE, '11:00', '12:00');

  // Step 1: Insert Reserved
  const { data: b1, error: e1 } = await (user.client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(), user_id: user.id, court_id: TEST_COURT_ID,
      booking_range: range, duration_minutes: 60, total_price: 400,
      status: 'Reserved', booking_source: 'ONLINE',
      user_name: 'LC Confirm Test', user_email: user.email, user_phone: '0000000000',
    }).select('id').single();

  if (e1 || !b1) return { name: 'Confirm keeps slot', passed: false, details: `Insert failed: ${e1?.message}` };

  // Step 2: Update to Confirmed (user owns it, allowed by RLS WITH CHECK: status IN ('Cancelled','Confirmed'))
  const { error: e2 } = await (user.client.from('bookings') as any)
    .update({ status: 'Confirmed' })
    .eq('id', b1.id);

  if (e2) return { name: 'Confirm keeps slot', passed: false, details: `Confirm failed: ${e2.message}` };
  console.log('  ✓ Step 2: Booking confirmed');

  // Step 3: Try to book same slot — should fail (Confirmed is in constraint's WHERE clause)
  const { error: e3 } = await (user.client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(), user_id: user.id, court_id: TEST_COURT_ID,
      booking_range: range, duration_minutes: 60, total_price: 400,
      status: 'Reserved', booking_source: 'ONLINE',
      user_name: 'LC Confirm Double', user_email: user.email, user_phone: '0000000000',
    });

  const passed = e3?.code === '23P01' || (e3?.message || '').includes('prevent_double_booking');
  console.log(`  ${passed ? '✅' : '❌'} Step 3: Double booking blocked after confirm: code=${e3?.code}`);
  return { name: 'Confirm keeps slot', passed, details: passed ? 'PASS — Confirmed booking correctly blocks rebooking' : `FAIL: ${e3?.message}` };
}

async function test_ExpiredReleasesSlot(): Promise<TestResult> {
  console.log('\n━━━ LIFECYCLE 3: Expired status releases slot ━━━');
  const user = await createTestUser(`lc-expired-${Date.now()}@test.com`);
  if (!user) return { name: 'Expired releases slot', passed: false, details: 'Could not create user' };

  const range = formatTstzrange(TEST_DATE, '12:00', '13:00');

  // Step 1: Insert
  const { data: b1, error: e1 } = await (user.client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(), user_id: user.id, court_id: TEST_COURT_ID,
      booking_range: range, duration_minutes: 60, total_price: 400,
      status: 'Reserved', booking_source: 'ONLINE',
      user_name: 'LC Expired Test', user_email: user.email, user_phone: '0000000000',
    }).select('id').single();

  if (e1 || !b1) return { name: 'Expired releases slot', passed: false, details: `Insert failed: ${e1?.message}` };

  // Step 2: Directly update to Expired (simulate what expireStaleBookingsAction does)
  // Note: User can't update to Expired via RLS (WITH CHECK only allows Cancelled/Confirmed for non-admins)
  // So we use admin client for this specific operation
  const { error: e2 } = await admin.from('bookings')
    .update({ status: 'Expired' })
    .eq('id', b1.id);

  if (e2) {
    console.log(`  ⚠️  Admin update to Expired failed: ${e2.message} (code: ${e2.code})`);
    // Try via user client — RLS may block non-Cancelled/Confirmed transitions
    const { error: e2b } = await (user.client.from('bookings') as any)
      .update({ status: 'Expired' })
      .eq('id', b1.id);
    if (e2b) {
      return { name: 'Expired releases slot', passed: false, details: `Cannot set Expired status: admin err=${e2.message}, user err=${e2b.message}` };
    }
  }
  console.log('  ✓ Step 2: Booking marked Expired');

  // Step 3: Rebook same slot
  const { data: b3, error: e3 } = await (user.client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(), user_id: user.id, court_id: TEST_COURT_ID,
      booking_range: range, duration_minutes: 60, total_price: 400,
      status: 'Reserved', booking_source: 'ONLINE',
      user_name: 'LC Expired Rebook', user_email: user.email, user_phone: '0000000000',
    }).select('id').single();

  const passed = !e3 && !!b3;
  console.log(`  ${passed ? '✅' : '❌'} Step 3: Rebook after expire: ${passed ? `SUCCESS (${b3?.id})` : `FAIL (${e3?.message})`}`);
  return { name: 'Expired releases slot', passed, details: passed ? 'PASS' : `FAIL: ${e3?.message}` };
}

async function test_RLS_PreventsOtherUserUpdate(): Promise<TestResult> {
  console.log('\n━━━ LIFECYCLE 4: RLS prevents other user from updating your booking ━━━');
  const userA = await createTestUser(`lc-rls-a-${Date.now()}@test.com`);
  const userB = await createTestUser(`lc-rls-b-${Date.now()}@test.com`);
  if (!userA || !userB) return { name: 'RLS blocks other user update', passed: false, details: 'Could not create users' };

  const range = formatTstzrange(TEST_DATE, '13:00', '14:00');

  // User A inserts a booking
  const { data: b1, error: e1 } = await (userA.client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(), user_id: userA.id, court_id: TEST_COURT_ID,
      booking_range: range, duration_minutes: 60, total_price: 400,
      status: 'Reserved', booking_source: 'ONLINE',
      user_name: 'RLS Test A', user_email: userA.email, user_phone: '0000000000',
    }).select('id').single();

  if (e1 || !b1) return { name: 'RLS blocks other user update', passed: false, details: `Insert failed: ${e1?.message}` };

  // User B tries to cancel User A's booking
  const { error: e2 } = await (userB.client.from('bookings') as any)
    .update({ status: 'Cancelled' })
    .eq('id', b1.id);

  const passed = !!e2; // Should fail
  console.log(`  ${passed ? '✅' : '❌'} User B update of User A's booking: ${passed ? 'BLOCKED (correct)' : 'ALLOWED (WRONG!)'}`);
  return { name: 'RLS blocks other user update', passed, details: passed ? 'PASS — RLS correctly blocked unauthorized update' : 'FAIL — RLS allowed cross-user update!' };
}

async function test_CannotChangeImmutableFields(): Promise<TestResult> {
  console.log('\n━━━ LIFECYCLE 5: Cannot change immutable fields (court_id, total_price, booking_range) ━━━');
  const user = await createTestUser(`lc-immutable-${Date.now()}@test.com`);
  if (!user) return { name: 'Immutable fields enforced', passed: false, details: 'Could not create user' };

  const range = formatTstzrange(TEST_DATE, '14:00', '15:00');
  const { data: b1, error: e1 } = await (user.client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(), user_id: user.id, court_id: TEST_COURT_ID,
      booking_range: range, duration_minutes: 60, total_price: 400,
      status: 'Reserved', booking_source: 'ONLINE',
      user_name: 'Immutable Test', user_email: user.email, user_phone: '0000000000',
    }).select('id, court_id, total_price').single();

  if (e1 || !b1) return { name: 'Immutable fields enforced', passed: false, details: `Insert failed: ${e1?.message}` };

  // Try to change court_id (should fail via trigger)
  const { error: e2 } = await (user.client.from('bookings') as any)
    .update({ court_id: 'a1b2c3d4-0002-4000-8000-000000000002' })
    .eq('id', b1.id);

  // Try to change total_price
  const { error: e3 } = await (user.client.from('bookings') as any)
    .update({ total_price: 1 })
    .eq('id', b1.id);

  // Try to change booking_range
  const { error: e4 } = await (user.client.from('bookings') as any)
    .update({ booking_range: formatTstzrange(TEST_DATE, '15:00', '16:00') })
    .eq('id', b1.id);

  const courtBlocked = !!e2;
  const priceBlocked = !!e3;
  const rangeBlocked = !!e4;
  const allBlocked = courtBlocked && priceBlocked && rangeBlocked;

  console.log(`  court_id: ${courtBlocked ? '✅ blocked' : '❌ NOT blocked'}`);
  console.log(`  total_price: ${priceBlocked ? '✅ blocked' : '❌ NOT blocked'}`);
  console.log(`  booking_range: ${rangeBlocked ? '✅ blocked' : '❌ NOT blocked'}`);

  return {
    name: 'Immutable fields enforced',
    passed: allBlocked,
    details: allBlocked
      ? 'PASS — All immutable field changes correctly rejected by BEFORE UPDATE trigger'
      : `FAIL — court_id=${courtBlocked}, total_price=${priceBlocked}, booking_range=${rangeBlocked}`,
  };
}

async function test_SameUserCannotDoubleBookSelf(): Promise<TestResult> {
  console.log('\n━━━ LIFECYCLE 6: Same user cannot double-book themselves ━━━');
  const user = await createTestUser(`lc-self-${Date.now()}@test.com`);
  if (!user) return { name: 'Self double-book blocked', passed: false, details: 'Could not create user' };

  const range = formatTstzrange(TEST_DATE, '15:00', '16:00');

  // First booking
  const { error: e1 } = await (user.client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(), user_id: user.id, court_id: TEST_COURT_ID,
      booking_range: range, duration_minutes: 60, total_price: 400,
      status: 'Reserved', booking_source: 'ONLINE',
      user_name: 'Self Test', user_email: user.email, user_phone: '0000000000',
    });

  if (e1) return { name: 'Self double-book blocked', passed: false, details: `First insert failed: ${e1.message}` };

  // Same user tries to book same slot again
  const { error: e2 } = await (user.client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(), user_id: user.id, court_id: TEST_COURT_ID,
      booking_range: range, duration_minutes: 60, total_price: 400,
      status: 'Reserved', booking_source: 'ONLINE',
      user_name: 'Self Test Double', user_email: user.email, user_phone: '0000000000',
    });

  const passed = e2?.code === '23P01' || (e2?.message || '').includes('prevent_double_booking');
  console.log(`  ${passed ? '✅' : '❌'} Self double-book: code=${e2?.code}`);
  return { name: 'Self double-book blocked', passed, details: passed ? 'PASS' : `FAIL: ${e2?.message}` };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 9 — Booking Lifecycle & Edge Case Tests              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Test date: ${TEST_DATE}, Court: ${TEST_COURT_ID}\n`);

  const results: TestResult[] = [];

  results.push(await test_CancelReleasesSlot());
  results.push(await test_ConfirmKeepsSlot());
  results.push(await test_ExpiredReleasesSlot());
  results.push(await test_RLS_PreventsOtherUserUpdate());
  results.push(await test_CannotChangeImmutableFields());
  results.push(await test_SameUserCannotDoubleBookSelf());

  // Cleanup test bookings
  console.log('\n=== CLEANUP ===');
  const { data: deleted } = await admin.from('bookings').delete().like('booking_number', 'KH-LC-%').select('id');
  console.log(`  Removed ${deleted?.length || 0} lifecycle test bookings`);

  // Cleanup test users
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  const testUsers = users?.users?.filter(u => u.email?.includes('lc-') || u.email?.includes('phase9-test-')) || [];
  for (const u of testUsers) {
    try { await admin.auth.admin.deleteUser(u.id); } catch {}
  }
  console.log(`  Removed ${testUsers.length} test users`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  LIFECYCLE TEST RESULTS                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}: ${r.details}`);
  }

  const allPassed = results.every(r => r.passed);
  console.log(`\n${allPassed ? '✅ ALL LIFECYCLE TESTS PASSED' : '❌ SOME LIFECYCLE TESTS FAILED'}`);

  // Write results
  fs.writeFileSync(
    path.resolve(__dirname, '..', 'phase9-lifecycle-results.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)
  );
}

main().catch(console.error);
