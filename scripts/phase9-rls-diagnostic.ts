/**
 * Phase 9 — Diagnostic: Investigate RLS policy failures
 * 
 * Finds why: (1) service_role can't UPDATE bookings
 *            (2) cross-user UPDATE succeeded
 */
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

const TEST_COURT_ID = 'a1b2c3d4-0001-4000-8000-000000000001';
const TEST_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toISOString().split('T')[0];
})();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 9 — RLS Diagnostic Investigation                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // ── 1. Check Supabase config ──
  console.log('\n━━━ 1. Supabase Configuration ━━━');
  console.log(`  URL: ${URL}`);
  console.log(`  SERVICE_KEY length: ${SERVICE_KEY.length}`);
  console.log(`  SERVICE_KEY prefix: ${SERVICE_KEY.substring(0, 20)}...`);

  // ── 2. Try raw SQL via RPC (check if exec_sql exists) ──
  console.log('\n━━━ 2. Check for exec_sql RPC ━━━');
  const { data: rpcData, error: rpcErr } = await admin.rpc('exec_sql', {
    query: "SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bookings' ORDER BY cmd, policyname;"
  });
  if (rpcErr) {
    console.log(`  ❌ exec_sql not available: ${rpcErr.message}`);
    // Try alternative: use the SQL API endpoint
    console.log('  Trying Supabase SQL API...');
    const sqlResp = await fetch(`${URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: "SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='bookings' ORDER BY cmd;"
      }),
    });
    const sqlBody = await sqlResp.text();
    console.log(`  SQL API response: ${sqlBody.substring(0, 500)}`);
  } else {
    console.log(`  ✅ exec_sql returned: ${JSON.stringify(rpcData).substring(0, 1000)}`);
  }

  // ── 3. Test service-role SELECT on bookings ──
  console.log('\n━━━ 3. Service-role SELECT on bookings ━━━');
  const { data: selData, error: selErr } = await admin.from('bookings').select('*').limit(5);
  console.log(`  SELECT: ${selErr ? `❌ ${selErr.message} (code: ${selErr.code})` : `✅ ${selData?.length || 0} rows`}`);

  // ── 4. Test service-role INSERT on bookings ──
  console.log('\n━━━ 4. Service-role INSERT on bookings ━━━');
  const testUser = await admin.auth.admin.createUser({
    email: `diag-${Date.now()}@test.com`,
    password: 'DiagTest123!',
    email_confirm: true,
  });
  if (testUser.data?.user) {
    const userId = testUser.data.user.id;
    const range = formatTstzrange(TEST_DATE, '07:00', '08:00');
    
    // Try admin INSERT
    const { data: insData, error: insErr } = await admin.from('bookings').insert({
      booking_number: `KH-DIAG-${Date.now()}`,
      user_id: userId,
      court_id: TEST_COURT_ID,
      booking_range: range,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Diag Test',
      user_email: `diag-${Date.now()}@test.com`,
      user_phone: '0000000000',
    }).select('id').single();
    
    console.log(`  Admin INSERT: ${insErr ? `❌ ${insErr.message} (code: ${insErr.code})` : `✅ ${insData?.id}`}`);

    if (insData) {
      // Try admin UPDATE to Expired
      const { error: updErr } = await admin.from('bookings')
        .update({ status: 'Expired' })
        .eq('id', insData.id);
      console.log(`  Admin UPDATE→Expired: ${updErr ? `❌ ${updErr.message} (code: ${updErr.code})` : '✅ SUCCESS'}`);

      // Try admin UPDATE to Cancelled
      const { error: updErr2 } = await admin.from('bookings')
        .update({ status: 'Cancelled' })
        .eq('id', insData.id);
      console.log(`  Admin UPDATE→Cancelled: ${updErr2 ? `❌ ${updErr2.message} (code: ${updErr2.code})` : '✅ SUCCESS'}`);

      // Cleanup
      await admin.from('bookings').delete().eq('id', insData.id);
    }

    // Cleanup user
    await admin.auth.admin.deleteUser(testUser.data.user.id);
  }

  // ── 5. Test cross-user UPDATE ──
  console.log('\n━━━ 5. Cross-user UPDATE test (detailed) ━━━');
  const ts2 = Date.now();
  const emailA = `diag-a-${ts2}@test.com`;
  const emailB = `diag-b-${ts2}@test.com`;
  const userA = await admin.auth.admin.createUser({
    email: emailA, password: 'DiagA123!', email_confirm: true,
  });
  const userB = await admin.auth.admin.createUser({
    email: emailB, password: 'DiagB123!', email_confirm: true,
  });

  if (userA.data?.user && userB.data?.user) {
    const clientA = createClient(URL, ANON_KEY);
    await clientA.auth.signInWithPassword({ email: emailA, password: 'DiagA123!' });
    const clientB = createClient(URL, ANON_KEY);
    await clientB.auth.signInWithPassword({ email: emailB, password: 'DiagB123!' });
    console.log(`  User A email: ${emailA}, ID: ${userA.data.user.id}`);
    console.log(`  User B email: ${emailB}, ID: ${userB.data.user.id}`);

    // User A inserts
    const range2 = formatTstzrange(TEST_DATE, '08:00', '09:00');
    const { data: bA, error: eA } = await (clientA.from('bookings') as any).insert({
      booking_number: `KH-DIAG-A-${Date.now()}`,
      user_id: userA.data.user.id,
      court_id: TEST_COURT_ID,
      booking_range: range2,
      duration_minutes: 60,
      total_price: 400,
      status: 'Reserved',
      booking_source: 'ONLINE',
      user_name: 'Diag User A',
      user_email: emailA,
      user_phone: '0000000000',
    }).select('id, user_id').single();
    console.log(`  User A INSERT: ${eA ? `❌ ${eA.message}` : `✅ ${bA?.id} (user_id: ${bA?.user_id})`}`);

    if (bA) {
      // User B tries to cancel User A's booking
      const { data: updData, error: updErr } = await (clientB.from('bookings') as any)
        .update({ status: 'Cancelled' })
        .eq('id', bA.id)
        .select('id, user_id, status');
      console.log(`  User B UPDATE A's booking: ${updErr ? `❌ ${updErr.message} (code: ${updErr.code})` : `⚠️ SUCCEEDED: ${JSON.stringify(updData)}`}`);

      // Cleanup
      await admin.from('bookings').delete().eq('id', bA.id);
    }

    await admin.auth.admin.deleteUser(userA.data.user.id);
    await admin.auth.admin.deleteUser(userB.data.user.id);
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

main().catch(console.error);
