import { createClient } from '@supabase/supabase-js';
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
const anon = createClient(URL, ANON_KEY);

const TEST_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
})();

function formatRange(date: string, sh: number, eh: number): string {
  return '[' + date + ' ' + String(sh).padStart(2,'0') + ':00:00+00, ' + date + ' ' + String(eh).padStart(2,'0') + ':00:00+00)';
}

function log(section: string, msg: string) {
  console.log('  [' + section + '] ' + msg);
}

async function main() {
  console.log('=== PHASE 9 REMEDIATION: PRE-FIX DIAGNOSTIC ===');

  // 1. Service-role table access survey
  console.log('\n--- 1. Service-role access per table ---');
  const tables = ['bookings', 'courts', 'profiles', 'blocked_periods', 'notifications', 'payments', 'events'];
  for (const t of tables) {
    const { data, error } = await admin.from(t).select('*').limit(1);
    if (error) {
      log(t, 'BLOCKED: ' + error.code + ' ' + error.message.substring(0, 80));
    } else {
      log(t, 'OK rows=' + (data ? data.length : 0));
    }
  }

  // 2. exec_sql RPC
  console.log('\n--- 2. exec_sql RPC ---');
  const { error: rpcErr } = await admin.rpc('exec_sql', { query: 'SELECT 1' });
  log('rpc', rpcErr ? 'NOT AVAILABLE: ' + rpcErr.message.substring(0, 80) : 'AVAILABLE');

  // 3. Test anon key: create authenticated users and test
  console.log('\n--- 3. Authenticated user bookings access ---');
  const ts = Date.now();
  const testEmail = 'diag-auth-' + ts + '@test.com';
  const { data: userData } = await admin.auth.admin.createUser({
    email: testEmail,
    password: 'DiagTest123!',
    email_confirm: true,
  });

  if (!userData || !userData.user) {
    console.log('  Could not create test user. Aborting.');
    return;
  }
  const userId = userData.user.id;
  log('setup', 'Created user ' + userId);

  const userClient = createClient(URL, ANON_KEY);
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email: testEmail,
    password: 'DiagTest123!',
  });
  log('auth', signInErr ? 'FAIL: ' + signInErr.message : 'OK');

  // 3a. SELECT on bookings
  const { data: selData, error: selErr } = await userClient.from('bookings').select('*').limit(1);
  log('SELECT bookings', selErr ? 'BLOCKED: ' + selErr.code + ' ' + selErr.message.substring(0, 60) : 'OK rows=' + (selData ? selData.length : 0));

  // 3b. INSERT on bookings
  const insPayload = {
    booking_number: 'KH-DIAG-' + ts,
    user_id: userId,
    court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
    booking_range: formatRange(TEST_DATE, 6, 7),
    duration_minutes: 60,
    total_price: 400,
    status: 'Reserved',
    booking_source: 'ONLINE',
    user_name: 'DiagUser',
    user_email: testEmail,
    user_phone: '00000000000',
  };
  const { data: insData, error: insErr } = await (userClient.from('bookings') as any)
    .insert(insPayload)
    .select('id')
    .single();
  log('INSERT bookings', insErr ? 'BLOCKED: ' + insErr.code + ' ' + insErr.message.substring(0, 80) : 'OK id=' + (insData ? insData.id : 'null'));

  // 3c. UPDATE own (Reserved -> Cancelled)
  if (insData) {
    const { error: updErr } = await (userClient.from('bookings') as any)
      .update({ status: 'Cancelled' })
      .eq('id', insData.id);
    log('UPDATE own -> Cancelled', updErr ? 'BLOCKED: ' + updErr.code : 'OK');

    // 3d. UPDATE own (try non-allowed status)
    const { data: insData2, error: insErr2 } = await (userClient.from('bookings') as any)
      .insert({ ...insPayload, booking_number: 'KH-DIAG2-' + ts, booking_range: formatRange(TEST_DATE, 7, 8) })
      .select('id')
      .single();
    if (insData2) {
      const { error: updErr2 } = await (userClient.from('bookings') as any)
        .update({ status: 'Expired' })
        .eq('id', insData2.id);
      log('UPDATE own -> Expired', updErr2 ? 'BLOCKED: ' + updErr2.code + ' (expected)' : 'SUCCEEDED (unexpected - RLS gap)');
    }
  }

  // Cleanup user A
  await admin.auth.admin.deleteUser(userId);

  // 4. Cross-user UPDATE test
  console.log('\n--- 4. Cross-user UPDATE test ---');
  const emailA = 'xuser-a-' + ts + '@test.com';
  const emailB = 'xuser-b-' + ts + '@test.com';
  const uA = await admin.auth.admin.createUser({ email: emailA, password: 'XUA123!', email_confirm: true });
  const uB = await admin.auth.admin.createUser({ email: emailB, password: 'XUB123!', email_confirm: true });

  if (!uA.data?.user || !uB.data?.user) {
    console.log('  Could not create test users. Aborting.');
    return;
  }

  const cA = createClient(URL, ANON_KEY);
  await cA.auth.signInWithPassword({ email: emailA, password: 'XUA123!' });
  const cB = createClient(URL, ANON_KEY);
  await cB.auth.signInWithPassword({ email: emailB, password: 'XUB123!' });

  // User A inserts booking
  const { data: bA, error: eA } = await (cA.from('bookings') as any).insert({
    booking_number: 'KH-XUA-' + ts,
    user_id: uA.data.user.id,
    court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
    booking_range: formatRange(TEST_DATE, 8, 9),
    duration_minutes: 60,
    total_price: 400,
    status: 'Reserved',
    booking_source: 'ONLINE',
    user_name: 'XUserA',
    user_email: emailA,
    user_phone: '00000000000',
  }).select('id, user_id, status').single();
  log('User A INSERT', eA ? 'FAIL: ' + eA.message : 'OK id=' + (bA ? bA.id : 'null'));

  if (bA) {
    // User B attempts to UPDATE User A booking
    const { data: updData, error: updErr } = await (cB.from('bookings') as any)
      .update({ status: 'Cancelled' })
      .eq('id', bA.id)
      .select('id, user_id, status');
    if (updErr) {
      log('User B UPDATE A booking', 'BLOCKED: ' + updErr.code + ' ' + updErr.message.substring(0, 80));
    } else if (updData && updData.length > 0) {
      log('User B UPDATE A booking', 'SUCCEEDED - ' + JSON.stringify(updData[0]));
      console.log('  >>> RLS GAP CONFIRMED <<<');
    } else {
      log('User B UPDATE A booking', 'BLOCKED (empty result set - RLS filtered post-update)');
    }

    // Verify A booking still intact
    const { data: verify } = await (cA.from('bookings') as any)
      .select('id, status')
      .eq('id', bA.id)
      .single();
    log('User A booking after B attempt', JSON.stringify(verify));

    // Cleanup
    await admin.from('bookings').delete().eq('id', bA.id);
  }

  await admin.auth.admin.deleteUser(uA.data.user.id);
  await admin.auth.admin.deleteUser(uB.data.user.id);

  // 5. Service role admin UPDATE test (for expire path)
  console.log('\n--- 5. Service-role admin operations ---');
  const adminU = await admin.auth.admin.createUser({ email: 'admin-test-' + ts + '@test.com', password: 'Admin123!', email_confirm: true });
  if (adminU.data?.user) {
    // Insert as admin via user client first
    const adminClient = createClient(URL, ANON_KEY);
    await adminClient.auth.signInWithPassword({ email: 'admin-test-' + ts + '@test.com', password: 'Admin123!' });
    
    // Set as Admin
    await admin.from('profiles').upsert({ id: adminU.data.user.id, full_name: 'AdminTest', role: 'Admin' });

    const { data: adminBooking } = await (adminClient.from('bookings') as any).insert({
      booking_number: 'KH-ADM-' + ts,
      user_id: adminU.data.user.id,
      court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
      booking_range: formatRange(TEST_DATE, 9, 10),
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'AdminTest',
      user_email: 'admin-test-' + ts + '@test.com',
      user_phone: '00000000000',
    }).select('id').single();

    if (adminBooking) {
      // Admin UPDATE own -> Expired
      const { error: expErr } = await (adminClient.from('bookings') as any)
        .update({ status: 'Expired' })
        .eq('id', adminBooking.id);
      log('Admin UPDATE -> Expired', expErr ? 'BLOCKED: ' + expErr.code : 'OK');
      
      // Reset for next test
      if (!expErr) {
        await (adminClient.from('bookings') as any).update({ status: 'Reserved' }).eq('id', adminBooking.id);
      }

      // Admin UPDATE own -> Cancelled
      const { error: canErr } = await (adminClient.from('bookings') as any)
        .update({ status: 'Cancelled' })
        .eq('id', adminBooking.id);
      log('Admin UPDATE -> Cancelled', canErr ? 'BLOCKED: ' + canErr.code : 'OK');

      await admin.from('bookings').delete().eq('id', adminBooking.id);
    }
    await admin.auth.admin.deleteUser(adminU.data.user.id);
  }

  // 6. Service role direct operations on bookings (will show 42501 if broken)
  console.log('\n--- 6. Service-role direct bookings operations ---');
  const { data: srSel, error: srSelErr } = await admin.from('bookings').select('id').limit(1);
  log('SR SELECT', srSelErr ? 'BLOCKED: ' + srSelErr.code + ' ' + srSelErr.message.substring(0, 60) : 'OK rows=' + (srSel ? srSel.length : 0));

  const { error: srInsErr } = await (admin.from('bookings') as any).insert({
    booking_number: 'KH-SR-' + ts,
    user_id: '00000000-0000-0000-0000-000000000000',
    court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
    booking_range: formatRange(TEST_DATE, 10, 11),
    duration_minutes: 60,
    total_price: 400,
    status: 'Reserved',
    booking_source: 'ONLINE',
    user_name: 'SRTest',
    user_email: 'sr@test.com',
    user_phone: '00000000000',
  });
  log('SR INSERT', srInsErr ? 'BLOCKED: ' + srInsErr.code + ' ' + srInsErr.message.substring(0, 80) : 'OK');

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

main().catch(console.error);
