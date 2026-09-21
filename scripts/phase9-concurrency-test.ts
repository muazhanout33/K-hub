/**
 * Phase 9 — Double Booking Concurrency Stress Test
 * 
 * EXECUTES against live Supabase. Creates test users, fires concurrent
 * booking attempts, collects metrics, cleans up.
 * 
 * Run: npx tsx scripts/phase9-concurrency-test.ts
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ── Load env ──────────────────────────────────────
const envPath = path.resolve(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']!;
const SUPABASE_ANON_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!;
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']!;

// Admin client for user creation (bypasses RLS)
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Config ────────────────────────────────────────
const TEST_COURT_ID = 'a1b2c3d4-0001-4000-8000-000000000001'; // Pro Padel Center Arena 1
const TEST_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 2); // 2 days from now
  return d.toISOString().split('T')[0];
})();
const CONCURRENT_USERS = 20; // Number of concurrent test users to create
const STRESS_TEST_SIZE = 200; // Number of concurrent INSERT attempts for stress test

// ── Helpers ───────────────────────────────────────

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
  return `KH-TEST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}

async function createTestUser(index: number): Promise<TestUser | null> {
  const email = `phase9-test-${index}-${Date.now()}@khub-test.com`;
  const password = `TestPass${index}!${Date.now()}`;

  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm so we can sign in immediately
    });

    if (error || !data.user) {
      console.log(`  ⚠️  Failed to create user ${index}: ${error?.message}`);
      return null;
    }

    // Sign in with anon client (RLS enforced)
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
    if (signInErr) {
      console.log(`  ⚠️  Failed to sign in user ${index}: ${signInErr.message}`);
      return null;
    }

    return { id: data.user.id, email, password, client };
  } catch (e: any) {
    console.log(`  ⚠️  Exception creating user ${index}: ${e.message}`);
    return null;
  }
}

async function cleanupTestUsers(users: TestUser[]): Promise<void> {
  console.log(`\n=== CLEANUP: Removing ${users.length} test users ===`);
  for (const u of users) {
    try {
      await admin.auth.admin.deleteUser(u.id);
    } catch {
      // Ignore cleanup errors
    }
  }
  console.log('  ✓ Test users cleaned up');
}

async function cleanupTestBookings(): Promise<void> {
  console.log('=== CLEANUP: Removing test bookings ===');
  // Use admin to delete test bookings (bypasses RLS)
  const { data, error } = await admin
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

// ── Test Result Types ─────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  metrics?: Record<string, any>;
}

interface ConcurrencyMetrics {
  totalAttempts: number;
  successes: number;
  failures: number;
  constraintViolations: number;
  otherErrors: number;
  avgResponseTimeMs: number;
  maxResponseTimeMs: number;
  minResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
}

// ── Tests ─────────────────────────────────────────

async function test1_ConstraintExists(): Promise<TestResult> {
  console.log('\n━━━ TEST 1: Verify EXCLUDE constraint exists ━━━');

  // Try to insert an overlapping booking — should fail with 23P01
  // First, insert a booking
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // We need an authenticated user. Use the first existing user or create one.
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 5 });
  if (!users?.users?.length) {
    return { name: 'Test 1', passed: false, details: 'No auth users available' };
  }

  const testUser = users.users[0];
  const { error: signInErr } = await client.auth.signInWithPassword({
    email: testUser.email!,
    password: 'temp', // We don't know the password
  });

  if (signInErr) {
    // Can't sign in — create a temporary user
    const tempUser = await createTestUser(0);
    if (!tempUser) {
      return { name: 'Test 1', passed: false, details: 'Cannot create test user' };
    }

    const range = formatTstzrange(TEST_DATE, '09:00', '10:00');
    const { error: insertErr } = await (tempUser.client.from('bookings') as any)
      .insert({
        booking_number: makeBookingNumber(),
        user_id: tempUser.id,
        court_id: TEST_COURT_ID,
        booking_range: range,
        duration_minutes: 60,
        total_price: 400,
        status: 'Reserved',
        booking_source: 'ONLINE',
        user_name: 'Constraint Test',
        user_email: tempUser.email,
        user_phone: '0000000000',
      });

    if (insertErr) {
      return { name: 'Test 1', passed: false, details: `Initial insert failed: ${insertErr.message}` };
    }

    // Now try to insert an overlapping booking
    const { error: overlapErr } = await (tempUser.client.from('bookings') as any)
      .insert({
        booking_number: makeBookingNumber(),
        user_id: tempUser.id,
        court_id: TEST_COURT_ID,
        booking_range: range,
        duration_minutes: 60,
        total_price: 400,
        status: 'Reserved',
        booking_source: 'ONLINE',
        user_name: 'Constraint Test Overlap',
        user_email: tempUser.email,
        user_phone: '0000000000',
      });

    const passed = overlapErr?.code === '23P01' || (overlapErr?.message || '').includes('prevent_double_booking');
    console.log(`  ${passed ? '✅' : '❌'} Constraint violation: code=${overlapErr?.code}, msg=${overlapErr?.message?.substring(0, 100)}`);

    // Cleanup
    await admin.from('bookings').delete().like('booking_number', 'KH-TEST-%');

    return {
      name: 'Test 1: EXCLUDE constraint exists',
      passed,
      details: passed
        ? `PASS — Overlapping insert correctly rejected with code ${overlapErr?.code}`
        : `FAIL — Overlapping insert was NOT rejected (code: ${overlapErr?.code})`,
    };
  }

  return { name: 'Test 1', passed: false, details: 'Need to rework auth flow' };
}

async function test2_ConcurrentOverlap(users: TestUser[]): Promise<TestResult> {
  console.log('\n━━━ TEST 2: Concurrent identical overlap (10 users, same slot) ━━━');

  if (users.length < 2) {
    return { name: 'Test 2', passed: false, details: 'Need at least 2 test users' };
  }

  const range = formatTstzrange(TEST_DATE, '10:00', '11:00');
  const startTime = Date.now();

  const results = await Promise.all(
    users.slice(0, 10).map(async (u, i) => {
      const t0 = Date.now();
      try {
        const { data, error } = await (u.client.from('bookings') as any)
          .insert({
            booking_number: makeBookingNumber(),
            user_id: u.id,
            court_id: TEST_COURT_ID,
            booking_range: range,
            duration_minutes: 60,
            total_price: 400,
            status: 'Reserved',
            booking_source: 'ONLINE',
            user_name: `User ${i}`,
            user_email: u.email,
            user_phone: '0000000000',
          })
          .select('id')
          .single();

        return {
          success: !error && !!data,
          errorCode: error?.code,
          errorMsg: error?.message,
          responseTimeMs: Date.now() - t0,
        };
      } catch (e: any) {
        return {
          success: false,
          errorCode: 'EXCEPTION',
          errorMsg: e.message,
          responseTimeMs: Date.now() - t0,
        };
      }
    })
  );

  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);
  const constraintViolations = failures.filter(f => f.errorCode === '23P01' || (f.errorMsg || '').includes('prevent_double_booking'));

  const responseTimes = results.map(r => r.responseTimeMs);
  const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const maxTime = Math.max(...responseTimes);
  const minTime = Math.min(...responseTimes);
  const sorted = [...responseTimes].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  const passed = successes.length === 1 && constraintViolations.length === failures.length;

  console.log(`  Results: ${successes.length} success, ${failures.length} failures (${constraintViolations.length} constraint violations)`);
  console.log(`  Response times: avg=${avgTime.toFixed(0)}ms, min=${minTime}ms, max=${maxTime}ms, p95=${p95}ms, p99=${p99}ms`);

  return {
    name: 'Test 2: Concurrent identical overlap',
    passed,
    details: passed
      ? `PASS — Exactly 1 succeeded, ${constraintViolations.length} correctly rejected by EXCLUDE constraint`
      : `FAIL — ${successes.length} succeeded (expected 1), ${failures.length} failed`,
    metrics: { successes: successes.length, failures: failures.length, constraintViolations: constraintViolations.length, avgTime, maxTime, minTime, p95, p99 },
  };
}

async function test3_PartialOverlap(users: TestUser[]): Promise<TestResult> {
  console.log('\n━━━ TEST 3: Partial overlap (18:00–19:00 vs 18:30–19:30) ━━━');

  if (users.length < 2) {
    return { name: 'Test 3', passed: false, details: 'Need at least 2 test users' };
  }

  const rangeA = formatTstzrange(TEST_DATE, '18:00', '19:00');
  const rangeB = formatTstzrange(TEST_DATE, '18:30', '19:30');

  // Insert booking A first (sequential, to ensure it's committed)
  const { error: errA } = await (users[0].client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(),
      user_id: users[0].id,
      court_id: TEST_COURT_ID,
      booking_range: rangeA,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Partial Test A',
      user_email: users[0].email,
      user_phone: '0000000000',
    });

  if (errA) {
    return { name: 'Test 3', passed: false, details: `Insert A failed: ${errA.message}` };
  }

  // Now try to insert overlapping booking B
  const { error: errB } = await (users[1].client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(),
      user_id: users[1].id,
      court_id: TEST_COURT_ID,
      booking_range: rangeB,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Partial Test B',
      user_email: users[1].email,
      user_phone: '0000000000',
    });

  const passed = errB?.code === '23P01' || (errB?.message || '').includes('prevent_double_booking');
  console.log(`  ${passed ? '✅' : '❌'} Partial overlap rejected: code=${errB?.code}`);

  return {
    name: 'Test 3: Partial overlap',
    passed,
    details: passed
      ? 'PASS — Partial overlap correctly rejected'
      : `FAIL — Partial overlap was NOT rejected (code: ${errB?.code})`,
  };
}

async function test4_BackToBackAllowed(users: TestUser[]): Promise<TestResult> {
  console.log('\n━━━ TEST 4: Back-to-back bookings (12:00–13:00 and 13:00–14:00) — should BOTH succeed ━━━');

  if (users.length < 2) {
    return { name: 'Test 4', passed: false, details: 'Need at least 2 test users' };
  }

  const rangeA = formatTstzrange(TEST_DATE, '12:00', '13:00');
  const rangeB = formatTstzrange(TEST_DATE, '13:00', '14:00');

  const [{ error: errA }, { error: errB }] = await Promise.all([
    (users[0].client.from('bookings') as any).insert({
      booking_number: makeBookingNumber(),
      user_id: users[0].id,
      court_id: TEST_COURT_ID,
      booking_range: rangeA,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'BackToBack A',
      user_email: users[0].email,
      user_phone: '0000000000',
    }),
    (users[1].client.from('bookings') as any).insert({
      booking_number: makeBookingNumber(),
      user_id: users[1].id,
      court_id: TEST_COURT_ID,
      booking_range: rangeB,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'BackToBack B',
      user_email: users[1].email,
      user_phone: '0000000000',
    }),
  ]);

  const passed = !errA && !errB;
  console.log(`  ${passed ? '✅' : '❌'} Both back-to-back bookings: A=${errA ? 'FAIL' : 'OK'}, B=${errB ? 'FAIL' : 'OK'}`);

  return {
    name: 'Test 4: Back-to-back allowed',
    passed,
    details: passed
      ? 'PASS — Both back-to-back bookings succeeded (no false rejection)'
      : `FAIL — One or both incorrectly rejected (A: ${errA?.message}, B: ${errB?.message})`,
  };
}

async function test5_StatusTransitionReleasesSlot(users: TestUser[]): Promise<TestResult> {
  console.log('\n━━━ TEST 5: Cancelled/Expired booking releases slot ━━━');

  if (users.length < 1) {
    return { name: 'Test 5', passed: false, details: 'Need at least 1 test user' };
  }

  const range = formatTstzrange(TEST_DATE, '15:00', '16:00');

  // Step 1: Insert a booking
  const { data: inserted, error: insertErr } = await (users[0].client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(),
      user_id: users[0].id,
      court_id: TEST_COURT_ID,
      booking_range: range,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Lifecycle Test',
      user_email: users[0].email,
      user_phone: '0000000000',
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return { name: 'Test 5', passed: false, details: `Step 1 failed: ${insertErr?.message}` };
  }
  console.log(`  ✓ Step 1: Inserted booking ${inserted.id}`);

  // Step 2: Cancel it (via admin, since RLS may restrict user updates)
  const { error: cancelErr } = await admin
    .from('bookings')
    .update({ status: 'Cancelled' })
    .eq('id', inserted.id);

  if (cancelErr) {
    return { name: 'Test 5', passed: false, details: `Step 2 cancel failed: ${cancelErr.message}` };
  }
  console.log('  ✓ Step 2: Booking cancelled');

  // Step 3: Try to book the same slot again
  const { data: newBooking, error: newErr } = await (users[0].client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(),
      user_id: users[0].id,
      court_id: TEST_COURT_ID,
      booking_range: range,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Lifecycle Test Rebook',
      user_email: users[0].email,
      user_phone: '0000000000',
    })
    .select('id')
    .single();

  const passed = !newErr && !!newBooking;
  console.log(`  ${passed ? '✅' : '❌'} Step 3: Rebooking after cancel: ${passed ? `SUCCESS (${newBooking?.id})` : `FAIL (${newErr?.message})`}`);

  return {
    name: 'Test 5: Status transition releases slot',
    passed,
    details: passed
      ? 'PASS — Cancelled booking freed the slot, new booking succeeded'
      : `FAIL — Cancelled booking still blocks new booking (${newErr?.message})`,
  };
}

async function test6_ExpiredDoesNotBlock(users: TestUser[]): Promise<TestResult> {
  console.log('\n━━━ TEST 6: Expired status does NOT block new booking ━━━');

  if (users.length < 1) {
    return { name: 'Test 6', passed: false, details: 'Need at least 1 test user' };
  }

  const range = formatTstzrange(TEST_DATE, '16:00', '17:00');

  // Step 1: Insert a booking
  const { data: inserted, error: insertErr } = await (users[0].client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(),
      user_id: users[0].id,
      court_id: TEST_COURT_ID,
      booking_range: range,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Expired Test',
      user_email: users[0].email,
      user_phone: '0000000000',
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return { name: 'Test 6', passed: false, details: `Step 1 failed: ${insertErr?.message}` };
  }

  // Step 2: Mark as Expired (via admin)
  const { error: expireErr } = await admin
    .from('bookings')
    .update({ status: 'Expired' })
    .eq('id', inserted.id);

  if (expireErr) {
    return { name: 'Test 6', passed: false, details: `Step 2 expire failed: ${expireErr.message}` };
  }
  console.log('  ✓ Step 2: Booking marked as Expired');

  // Step 3: Try to book the same slot again
  const { data: newBooking, error: newErr } = await (users[0].client.from('bookings') as any)
    .insert({
      booking_number: makeBookingNumber(),
      user_id: users[0].id,
      court_id: TEST_COURT_ID,
      booking_range: range,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Expired Test Rebook',
      user_email: users[0].email,
      user_phone: '0000000000',
    })
    .select('id')
    .single();

  const passed = !newErr && !!newBooking;
  console.log(`  ${passed ? '✅' : '❌'} Step 3: Rebooking after expire: ${passed ? `SUCCESS (${newBooking?.id})` : `FAIL (${newErr?.message})`}`);

  return {
    name: 'Test 6: Expired status does not block',
    passed,
    details: passed
      ? 'PASS — Expired booking freed the slot, new booking succeeded'
      : `FAIL — Expired booking still blocks new booking (${newErr?.message})`,
  };
}

async function test7_DifferentCourtSameTime(users: TestUser[]): Promise<TestResult> {
  console.log('\n━━━ TEST 7: Same time, different courts — should BOTH succeed ━━━');

  if (users.length < 2) {
    return { name: 'Test 7', passed: false, details: 'Need at least 2 test users' };
  }

  const COURT_2 = 'a1b2c3d4-0002-4000-8000-000000000002'; // Emirates Pitch 5v5
  const range = formatTstzrange(TEST_DATE, '14:00', '15:00');

  const [{ error: errA }, { error: errB }] = await Promise.all([
    (users[0].client.from('bookings') as any).insert({
      booking_number: makeBookingNumber(),
      user_id: users[0].id,
      court_id: TEST_COURT_ID,
      booking_range: range,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'DiffCourt A',
      user_email: users[0].email,
      user_phone: '0000000000',
    }),
    (users[1].client.from('bookings') as any).insert({
      booking_number: makeBookingNumber(),
      user_id: users[1].id,
      court_id: COURT_2,
      booking_range: range,
      duration_minutes: 60,
      total_price: 300,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'DiffCourt B',
      user_email: users[1].email,
      user_phone: '0000000000',
    }),
  ]);

  const passed = !errA && !errB;
  console.log(`  ${passed ? '✅' : '❌'} Different courts: A=${errA ? 'FAIL' : 'OK'}, B=${errB ? 'FAIL' : 'OK'}`);

  return {
    name: 'Test 7: Same time different courts',
    passed,
    details: passed
      ? 'PASS — Both bookings on different courts succeeded (constraint is per-court)'
      : `FAIL — One or both incorrectly rejected (A: ${errA?.message}, B: ${errB?.message})`,
  };
}

// ── Stress Test ───────────────────────────────────

async function stressTest_NConcurrentInserts(users: TestUser[], n: number): Promise<ConcurrencyMetrics> {
  console.log(`\n━━━ STRESS TEST: ${n} concurrent INSERT attempts ━━━`);

  const range = formatTstzrange(TEST_DATE, '20:00', '21:00');
  const startTime = Date.now();

  const results = await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const user = users[i % users.length]; // Round-robin across available users
      const t0 = Date.now();
      try {
        const { data, error } = await (user.client.from('bookings') as any)
          .insert({
            booking_number: makeBookingNumber(),
            user_id: user.id,
            court_id: TEST_COURT_ID,
            booking_range: range,
            duration_minutes: 60,
            total_price: 400,
            status: 'Reserved',
            booking_source: 'ONLINE',
            user_name: `Stress User ${i}`,
            user_email: user.email,
            user_phone: '0000000000',
          })
          .select('id')
          .single();

        return {
          success: !error && !!data,
          errorCode: error?.code,
          errorMsg: error?.message,
          responseTimeMs: Date.now() - t0,
        };
      } catch (e: any) {
        return {
          success: false,
          errorCode: 'EXCEPTION',
          errorMsg: e.message,
          responseTimeMs: Date.now() - t0,
        };
      }
    })
  );

  const totalTime = Date.now() - startTime;
  const successes = results.filter(r => r.success).length;
  const failures = results.filter(r => !r.success).length;
  const constraintViolations = results.filter(r => r.errorCode === '23P01' || (r.errorMsg || '').includes('prevent_double_booking')).length;
  const otherErrors = failures - constraintViolations;

  const responseTimes = results.map(r => r.responseTimeMs);
  const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const maxTime = Math.max(...responseTimes);
  const minTime = Math.min(...responseTimes);
  const sorted = [...responseTimes].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  console.log(`  Total time: ${totalTime}ms`);
  console.log(`  Results: ${successes} success, ${failures} failures (${constraintViolations} constraint, ${otherErrors} other)`);
  console.log(`  Response times: avg=${avgTime.toFixed(0)}ms, min=${minTime}ms, max=${maxTime}ms, p95=${p95}ms, p99=${p99}ms`);
  console.log(`  Throughput: ${(n / (totalTime / 1000)).toFixed(1)} attempts/sec`);

  return {
    totalAttempts: n,
    successes,
    failures,
    constraintViolations,
    otherErrors,
    avgResponseTimeMs: avgTime,
    maxResponseTimeMs: maxTime,
    minResponseTimeMs: minTime,
    p95ResponseTimeMs: p95,
    p99ResponseTimeMs: p99,
  };
}

async function stressTest_MultiSlot(users: TestUser[]): Promise<TestResult> {
  console.log('\n━━━ STRESS TEST: Multi-slot concurrency (different time slots on same court) ━━━');

  if (users.length < 2) {
    return { name: 'Multi-slot stress', passed: false, details: 'Need at least 2 test users' };
  }

  // 5 different time slots, 4 users each = 20 concurrent attempts
  const slots = [
    { start: '08:00', end: '09:00' },
    { start: '09:00', end: '10:00' },
    { start: '11:00', end: '12:00' },
    { start: '17:00', end: '18:00' },
    { start: '19:00', end: '20:00' },
  ];

  const results = await Promise.all(
    slots.flatMap((slot, slotIdx) =>
      Array.from({ length: Math.min(4, users.length) }, async (_, userIdx) => {
        const user = users[userIdx % users.length];
        const range = formatTstzrange(TEST_DATE, slot.start, slot.end);
        const t0 = Date.now();
        try {
          const { data, error } = await (user.client.from('bookings') as any)
            .insert({
              booking_number: makeBookingNumber(),
              user_id: user.id,
              court_id: TEST_COURT_ID,
              booking_range: range,
              duration_minutes: 60,
              total_price: 400,
              status: 'Reserved',
              booking_source: 'ONLINE',
              user_name: `MultiSlot S${slotIdx}U${userIdx}`,
              user_email: user.email,
              user_phone: '0000000000',
            })
            .select('id')
            .single();

          return {
            slot: `${slot.start}-${slot.end}`,
            success: !error && !!data,
            errorCode: error?.code,
            responseTimeMs: Date.now() - t0,
          };
        } catch (e: any) {
          return {
            slot: `${slot.start}-${slot.end}`,
            success: false,
            errorCode: 'EXCEPTION',
            responseTimeMs: Date.now() - t0,
          };
        }
      })
    )
  );

  // Each slot should have exactly 1 success (since they're all on the same court)
  const bySlot = slots.map((slot, i) => {
    const slotResults = results.filter(r => r.slot === `${slot.start}-${slot.end}`);
    const successes = slotResults.filter(r => r.success).length;
    return { slot: slot.start + '-' + slot.end, successes, total: slotResults.length };
  });

  const allSlotsCorrect = bySlot.every(s => s.successes === 1);
  const totalSuccesses = results.filter(r => r.success).length;

  console.log(`  Total attempts: ${results.length}, successes: ${totalSuccesses}`);
  for (const s of bySlot) {
    console.log(`    Slot ${s.slot}: ${s.successes}/${s.total} succeeded`);
  }

  return {
    name: 'Multi-slot concurrency',
    passed: allSlotsCorrect,
    details: allSlotsCorrect
      ? `PASS — Each of ${slots.length} slots had exactly 1 success (${totalSuccesses}/${results.length} total)`
      : `FAIL — Expected ${slots.length} successes, got ${totalSuccesses}`,
    metrics: { bySlot, totalAttempts: results.length, totalSuccesses },
  };
}

// ── Main ──────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 9 — Double Booking Concurrency Stress Test           ║');
  console.log('║  EXECUTING against LIVE Supabase                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nSupabase URL: ${SUPABASE_URL}`);
  console.log(`Test court: ${TEST_COURT_ID}`);
  console.log(`Test date: ${TEST_DATE}`);
  console.log(`Creating ${CONCURRENT_USERS} test users...\n`);

  // ── Setup: Create test users ──
  const users: TestUser[] = [];
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    const user = await createTestUser(i);
    if (user) {
      users.push(user);
      if ((i + 1) % 5 === 0) console.log(`  Created ${i + 1}/${CONCURRENT_USERS} users...`);
    }
  }
  console.log(`  ✓ Created ${users.length}/${CONCURRENT_USERS} test users\n`);

  if (users.length < 2) {
    console.error('❌ Need at least 2 test users to proceed');
    await cleanupTestUsers(users);
    process.exit(1);
  }

  const allResults: TestResult[] = [];

  try {
    // ── Run all tests ──
    allResults.push(await test1_ConstraintExists());
    allResults.push(await test2_ConcurrentOverlap(users));
    allResults.push(await test3_PartialOverlap(users));
    allResults.push(await test4_BackToBackAllowed(users));
    allResults.push(await test5_StatusTransitionReleasesSlot(users));
    allResults.push(await test6_ExpiredDoesNotBlock(users));
    allResults.push(await test7_DifferentCourtSameTime(users));

    // ── Stress tests ──
    const metrics100 = await stressTest_NConcurrentInserts(users, Math.min(100, users.length * 5));
    const metrics200 = await stressTest_NConcurrentInserts(users, Math.min(STRESS_TEST_SIZE, users.length * 10));
    allResults.push(await stressTest_MultiSlot(users));

    // ── Cleanup ──
    await cleanupTestBookings();
    await cleanupTestUsers(users);

    // ── Final Summary ──
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  FINAL RESULTS                                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    for (const r of allResults) {
      console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
      console.log(`     ${r.details}`);
      if (r.metrics) {
        console.log(`     Metrics: ${JSON.stringify(r.metrics)}`);
      }
    }

    console.log('\n=== CONCURRENCY METRICS ===');
    console.log(`  Stress Test 1 (${metrics100.totalAttempts} attempts):`);
    console.log(`    Success: ${metrics100.successes}, Failures: ${metrics100.failures} (constraint: ${metrics100.constraintViolations})`);
    console.log(`    Response: avg=${metrics100.avgResponseTimeMs.toFixed(0)}ms, p95=${metrics100.p95ResponseTimeMs}ms, p99=${metrics100.p99ResponseTimeMs}ms`);
    console.log(`  Stress Test 2 (${metrics200.totalAttempts} attempts):`);
    console.log(`    Success: ${metrics200.successes}, Failures: ${metrics200.failures} (constraint: ${metrics200.constraintViolations})`);
    console.log(`    Response: avg=${metrics200.avgResponseTimeMs.toFixed(0)}ms, p95=${metrics200.p95ResponseTimeMs}ms, p99=${metrics200.p99ResponseTimeMs}ms`);

    const allPassed = allResults.every(r => r.passed);
    console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    // Write results to file for the report
    const reportData = {
      timestamp: new Date().toISOString(),
      testCourt: TEST_COURT_ID,
      testDate: TEST_DATE,
      usersCreated: users.length,
      results: allResults.map(r => ({ name: r.name, passed: r.passed, details: r.details, metrics: r.metrics })),
      stressTest100: metrics100,
      stressTest200: metrics200,
    };
    fs.writeFileSync(
      path.resolve(__dirname, '..', 'phase9-test-results.json'),
      JSON.stringify(reportData, null, 2)
    );
    console.log('\n📄 Results written to phase9-test-results.json');

    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('\n❌ Test suite error:', err);
    await cleanupTestBookings();
    await cleanupTestUsers(users);
    process.exit(1);
  }
}

main();
