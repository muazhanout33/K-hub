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

const TEST_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
})();

function formatRange(date: string, sh: number, eh: number): string {
  return '[' + date + ' ' + String(sh).padStart(2,'0') + ':00:00+00, ' + date + ' ' + String(eh).padStart(2,'0') + ':00:00+00)';
}

async function main() {
  console.log('=== CROSS-USER UPDATE DEFINITIVE TEST ===');
  const ts = Date.now();

  // Create user A
  const emailA = 'definitive-a-' + ts + '@test.com';
  const uA = await admin.auth.admin.createUser({
    email: emailA, password: 'DefA123!', email_confirm: true,
  });
  if (!uA.data?.user) { console.log('FAIL: create user A'); return; }
  const cA = createClient(URL, ANON_KEY);
  await cA.auth.signInWithPassword({ email: emailA, password: 'DefA123!' });

  // Create user B
  const emailB = 'definitive-b-' + ts + '@test.com';
  const uB = await admin.auth.admin.createUser({
    email: emailB, password: 'DefB123!', email_confirm: true,
  });
  if (!uB.data?.user) { console.log('FAIL: create user B'); return; }
  const cB = createClient(URL, ANON_KEY);
  await cB.auth.signInWithPassword({ email: emailB, password: 'DefB123!' });

  // User A inserts booking
  const { data: booking, error: insErr } = await (cA.from('bookings') as any).insert({
    booking_number: 'KH-DEF-' + ts,
    user_id: uA.data.user.id,
    court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
    booking_range: formatRange(TEST_DATE, 11, 12),
    duration_minutes: 60,
    total_price: 400,
    status: 'Reserved',
    booking_source: 'ONLINE',
    user_name: 'DefUserA',
    user_email: emailA,
    user_phone: '00000000000',
  }).select('id, user_id, status, court_id, total_price, booking_range').single();

  if (insErr || !booking) {
    console.log('User A INSERT FAIL:', insErr?.message);
    return;
  }
  console.log('User A INSERT OK:', JSON.stringify(booking));

  // User B attempts to UPDATE A's booking to Cancelled
  console.log('\n--- Test: User B UPDATE A booking -> Cancelled ---');
  const { data: updDataB, error: updErrB } = await (cB.from('bookings') as any)
    .update({ status: 'Cancelled' })
    .eq('id', booking.id)
    .select('id, user_id, status');

  console.log('  error:', updErrB ? updErrB.code + ': ' + updErrB.message : 'none');
  console.log('  returned data:', JSON.stringify(updDataB));

  // Check actual DB state
  const { data: verifyAfterB } = await (cA.from('bookings') as any)
    .select('id, status')
    .eq('id', booking.id)
    .single();
  console.log('  Actual DB state after B update:', JSON.stringify(verifyAfterB));

  if (!verifyAfterB || verifyAfterB.status !== 'Reserved') {
    console.log('  >>> RLS GAP: B successfully changed A booking! <<<');
  } else {
    console.log('  >>> RLS CORRECT: B update was blocked, A booking still Reserved <<<');
  }

  // User A updates own booking to Cancelled
  console.log('\n--- Test: User A UPDATE own -> Cancelled ---');
  const { data: updDataA, error: updErrA } = await (cA.from('bookings') as any)
    .update({ status: 'Cancelled' })
    .eq('id', booking.id)
    .select('id, status');
  console.log('  error:', updErrA ? updErrA.code + ': ' + updErrA.message : 'none');
  console.log('  returned data:', JSON.stringify(updDataA));
  const { data: verifyAfterA } = await (cA.from('bookings') as any)
    .select('id, status').eq('id', booking.id).single();
  console.log('  Actual DB state:', JSON.stringify(verifyAfterA));

  // Reset to Reserved for next test
  await (cA.from('bookings') as any).update({ status: 'Reserved' }).eq('id', booking.id);

  // User A attempts to change court_id
  console.log('\n--- Test: User A UPDATE own court_id ---');
  const { error: courtErr } = await (cA.from('bookings') as any)
    .update({ court_id: 'a1b2c3d4-0002-4000-8000-000000000002' })
    .eq('id', booking.id);
  console.log('  error:', courtErr ? courtErr.code + ': ' + courtErr.message : 'none (unexpected)');

  // User A attempts to change total_price
  console.log('\n--- Test: User A UPDATE own total_price ---');
  const { error: priceErr } = await (cA.from('bookings') as any)
    .update({ total_price: 1 })
    .eq('id', booking.id);
  console.log('  error:', priceErr ? priceErr.code + ': ' + priceErr.message : 'none (unexpected)');

  // User A attempts to change booking_range
  console.log('\n--- Test: User A UPDATE own booking_range ---');
  const { error: rangeErr } = await (cA.from('bookings') as any)
    .update({ booking_range: formatRange(TEST_DATE, 15, 16) })
    .eq('id', booking.id);
  console.log('  error:', rangeErr ? rangeErr.code + ': ' + rangeErr.message : 'none (unexpected)');

  // Verify immutable fields still intact
  const { data: finalState } = await (cA.from('bookings') as any)
    .select('id, status, court_id, total_price, booking_range')
    .eq('id', booking.id)
    .single();
  console.log('\nFinal state:', JSON.stringify(finalState));

  // Cleanup
  await admin.from('bookings').delete().eq('id', booking.id);
  await admin.auth.admin.deleteUser(uA.data.user.id);
  await admin.auth.admin.deleteUser(uB.data.user.id);

  console.log('\n=== DEFINITIVE TEST COMPLETE ===');
}

main().catch(console.error);
