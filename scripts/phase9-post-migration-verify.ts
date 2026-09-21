/**
 * Phase 9 Remediation — Post-migration verification
 * 
 * Run AFTER applying the migration in Supabase SQL Editor:
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO service_role;
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_periods TO service_role;
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO service_role;
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_submissions TO service_role;
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO service_role;
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsorship_requests TO service_role;
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.advertisement_requests TO service_role;
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

const TEST_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
})();

function formatRange(date: string, sh: number, eh: number): string {
  return '[' + date + ' ' + String(sh).padStart(2,'0') + ':00:00+00, ' + date + ' ' + String(eh).padStart(2,'0') + ':00:00+00)';
}

let passed = 0;
let failed = 0;
const results: string[] = [];

function assert(name: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    results.push('  PASS  ' + name + ': ' + detail);
  } else {
    failed++;
    results.push('  FAIL  ' + name + ': ' + detail);
  }
}

async function main() {
  console.log('=== PHASE 9 REMEDIATION: POST-MIGRATION VERIFICATION ===\n');

  // ── 1. Service-role table access ──
  console.log('--- 1. Service-role table access ---');
  const mustAccess = ['bookings', 'profiles', 'blocked_periods', 'notifications', 'payments',
    'contact_submissions', 'system_settings', 'sponsorship_requests', 'advertisement_requests'];
  const alreadyWorked = ['courts', 'events', 'faqs', 'testimonials'];

  for (const t of [...mustAccess, ...alreadyWorked]) {
    const { data, error } = await admin.from(t).select('*').limit(0);
    const ok = !error;
    assert('SR access ' + t, ok, ok ? 'OK' : error!.code + ': ' + error!.message.substring(0, 60));
  }

  // ── 2. Service-role bookings CRUD ──
  console.log('\n--- 2. Service-role bookings CRUD ---');
  const ts = Date.now();

  // INSERT via service-role
  const { data: srIns, error: srInsErr } = await (admin.from('bookings') as any).insert({
    booking_number: 'KH-SR-VERIFY-' + ts,
    user_id: '00000000-0000-0000-0000-000000000000',
    court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
    booking_range: formatRange(TEST_DATE, 6, 7),
    duration_minutes: 60, total_price: 400, status: 'Reserved',
    booking_source: 'ONLINE', user_name: 'SRVerify', user_email: 'sr-verify@test.com', user_phone: '000',
  }).select('id').single();
  assert('SR INSERT bookings', !srInsErr, srInsErr ? srInsErr.code + ': ' + srInsErr.message.substring(0, 60) : 'OK id=' + srIns?.id);

  if (srIns) {
    // SELECT via service-role
    const { data: srSel, error: srSelErr } = await admin.from('bookings').select('id, status').eq('id', srIns.id).single();
    assert('SR SELECT bookings', !srSelErr, srSelErr ? srSelErr.code : 'OK status=' + srSel?.status);

    // UPDATE via service-role (Reserved -> Expired - the path that failed before)
    const { error: srUpdErr } = await (admin.from('bookings') as any)
      .update({ status: 'Expired' }).eq('id', srIns.id);
    assert('SR UPDATE bookings -> Expired', !srUpdErr, srUpdErr ? srUpdErr.code + ': ' + srUpdErr.message.substring(0, 60) : 'OK');

    // Verify it's actually Expired
    const { data: srVerify } = await admin.from('bookings').select('status').eq('id', srIns.id).single();
    assert('SR UPDATE verified', srVerify?.status === 'Expired', 'status=' + srVerify?.status);

    // DELETE via service-role
    const { error: srDelErr } = await admin.from('bookings').delete().eq('id', srIns.id);
    assert('SR DELETE bookings', !srDelErr, srDelErr ? srDelErr.code + ': ' + srDelErr.message.substring(0, 60) : 'OK');
  }

  // ── 3. expireStaleBookingsAction path ──
  console.log('\n--- 3. expireStaleBookingsAction path ---');
  // Create a test user, insert a booking, then try the expire path
  const expireEmail = 'expire-verify-' + ts + '@test.com';
  const { data: expireUser } = await admin.auth.admin.createUser({
    email: expireEmail, password: 'Expire123!', email_confirm: true,
  });
  if (expireUser?.user) {
    const uc = createClient(URL, ANON_KEY);
    await uc.auth.signInWithPassword({ email: expireEmail, password: 'Expire123!' });

    // Insert booking as user
    const { data: expireBooking } = await (uc.from('bookings') as any).insert({
      booking_number: 'KH-EXPIRE-' + ts,
      user_id: expireUser.user.id,
      court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
      booking_range: formatRange(TEST_DATE, 7, 8),
      duration_minutes: 60, total_price: 400, status: 'Reserved',
      booking_source: 'ONLINE', user_name: 'ExpireVerify', user_email: expireEmail, user_phone: '000',
    }).select('id').single();

    if (expireBooking) {
      // Simulate expireStaleBookingsAction: service-role updates status to Expired
      const { error: expireErr } = await (admin.from('bookings') as any)
        .update({ status: 'Expired' }).eq('id', expireBooking.id);
      assert('expireStaleBookingsAction path', !expireErr, expireErr ? expireErr.code : 'OK');

      const { data: afterExpire } = await admin.from('bookings').select('status').eq('id', expireBooking.id).single();
      assert('Expire verified', afterExpire?.status === 'Expired', 'status=' + afterExpire?.status);

      // Verify slot is now available (EXCLUDE constraint should not block)
      const { error: rebookErr } = await (uc.from('bookings') as any).insert({
        booking_number: 'KH-REBOOK-' + ts,
        user_id: expireUser.user.id,
        court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
        booking_range: formatRange(TEST_DATE, 7, 8),
        duration_minutes: 60, total_price: 400, status: 'Reserved',
        booking_source: 'ONLINE', user_name: 'Rebook', user_email: expireEmail, user_phone: '000',
      });
      assert('Slot available after expire', !rebookErr, rebookErr ? rebookErr.code + ' (should be 23P01 if still blocked)' : 'OK - slot freed');

      // Cleanup rebook
      if (!rebookErr) {
        const { data: rb } = await (uc.from('bookings') as any).select('id').eq('booking_number', 'KH-REBOOK-' + ts).single();
        if (rb) await admin.from('bookings').delete().eq('id', rb.id);
      }
    }
    await admin.auth.admin.deleteUser(expireUser.user.id);
  }

  // ── 4. Cross-user UPDATE still blocked ──
  console.log('\n--- 4. Cross-user UPDATE still blocked ---');
  const emailA2 = 'xuser-a-v2-' + ts + '@test.com';
  const emailB2 = 'xuser-b-v2-' + ts + '@test.com';
  const uA2 = await admin.auth.admin.createUser({ email: emailA2, password: 'XUA123!', email_confirm: true });
  const uB2 = await admin.auth.admin.createUser({ email: emailB2, password: 'XUB123!', email_confirm: true });

  if (uA2.data?.user && uB2.data?.user) {
    const cA2 = createClient(URL, ANON_KEY);
    await cA2.auth.signInWithPassword({ email: emailA2, password: 'XUA123!' });
    const cB2 = createClient(URL, ANON_KEY);
    await cB2.auth.signInWithPassword({ email: emailB2, password: 'XUB123!' });

    const { data: crossBooking } = await (cA2.from('bookings') as any).insert({
      booking_number: 'KH-CROSS-' + ts,
      user_id: uA2.data.user.id,
      court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
      booking_range: formatRange(TEST_DATE, 8, 9),
      duration_minutes: 60, total_price: 400, status: 'Reserved',
      booking_source: 'ONLINE', user_name: 'CrossA', user_email: emailA2, user_phone: '000',
    }).select('id').single();

    if (crossBooking) {
      const { data: crossUpd } = await (cB2.from('bookings') as any)
        .update({ status: 'Cancelled' }).eq('id', crossBooking.id).select('id');
      assert('Cross-user UPDATE blocked', !crossUpd || crossUpd.length === 0, 'returned ' + (crossUpd ? crossUpd.length : 'null') + ' rows');

      const { data: stillReserved } = await (cA2.from('bookings') as any)
        .select('status').eq('id', crossBooking.id).single();
      assert('Cross-user booking intact', stillReserved?.status === 'Reserved', 'status=' + stillReserved?.status);

      await admin.from('bookings').delete().eq('id', crossBooking.id);
    }
    await admin.auth.admin.deleteUser(uA2.data.user.id);
    await admin.auth.admin.deleteUser(uB2.data.user.id);
  }

  // ── 5. cancelBookingAction path ──
  console.log('\n--- 5. cancelBookingAction path ---');
  const cancelEmail = 'cancel-verify-' + ts + '@test.com';
  const { data: cancelUser } = await admin.auth.admin.createUser({
    email: cancelEmail, password: 'Cancel123!', email_confirm: true,
  });
  if (cancelUser?.user) {
    const cc = createClient(URL, ANON_KEY);
    await cc.auth.signInWithPassword({ email: cancelEmail, password: 'Cancel123!' });

    const { data: cancelBooking } = await (cc.from('bookings') as any).insert({
      booking_number: 'KH-CANCEL-' + ts,
      user_id: cancelUser.user.id,
      court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
      booking_range: formatRange(TEST_DATE, 9, 10),
      duration_minutes: 60, total_price: 400, status: 'Reserved',
      booking_source: 'ONLINE', user_name: 'CancelV', user_email: cancelEmail, user_phone: '000',
    }).select('id').single();

    if (cancelBooking) {
      const { error: canErr } = await (cc.from('bookings') as any)
        .update({ status: 'Cancelled' }).eq('id', cancelBooking.id);
      assert('cancelBookingAction path', !canErr, canErr ? canErr.code : 'OK');

      const { data: afterCancel } = await cc.from('bookings').select('status').eq('id', cancelBooking.id).single();
      assert('Cancel verified', afterCancel?.status === 'Cancelled', 'status=' + afterCancel?.status);
    }
    await admin.auth.admin.deleteUser(cancelUser.user.id);
  }

  // ── 6. confirmBookingStatusAction path ──
  console.log('\n--- 6. confirmBookingStatusAction path ---');
  const confirmEmail = 'confirm-verify-' + ts + '@test.com';
  const { data: confirmUser } = await admin.auth.admin.createUser({
    email: confirmEmail, password: 'Confirm123!', email_confirm: true,
  });
  if (confirmUser?.user) {
    const cfc = createClient(URL, ANON_KEY);
    await cfc.auth.signInWithPassword({ email: confirmEmail, password: 'Confirm123!' });

    const { data: confirmBooking } = await (cfc.from('bookings') as any).insert({
      booking_number: 'KH-CONFIRM-' + ts,
      user_id: confirmUser.user.id,
      court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
      booking_range: formatRange(TEST_DATE, 10, 11),
      duration_minutes: 60, total_price: 400, status: 'Reserved',
      booking_source: 'ONLINE', user_name: 'ConfirmV', user_email: confirmEmail, user_phone: '000',
    }).select('id').single();

    if (confirmBooking) {
      const { error: confErr } = await (cfc.from('bookings') as any)
        .update({ status: 'Confirmed' }).eq('id', confirmBooking.id);
      assert('confirmBookingStatusAction path', !confErr, confErr ? confErr.code : 'OK');

      const { data: afterConfirm } = await cfc.from('bookings').select('status').eq('id', confirmBooking.id).single();
      assert('Confirm verified', afterConfirm?.status === 'Confirmed', 'status=' + afterConfirm?.status);

      // Verify confirmed booking blocks rebooking
      const { error: rebookErr } = await (cfc.from('bookings') as any).insert({
        booking_number: 'KH-REBOOK2-' + ts,
        user_id: confirmUser.user.id,
        court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
        booking_range: formatRange(TEST_DATE, 10, 11),
        duration_minutes: 60, total_price: 400, status: 'Reserved',
        booking_source: 'ONLINE', user_name: 'Rebook2', user_email: confirmEmail, user_phone: '000',
      });
      assert('Confirmed blocks rebooking', rebookErr?.code === '23P01', 'code=' + rebookErr?.code);
    }
    await admin.auth.admin.deleteUser(confirmUser.user.id);
  }

  // ── 7. Immutable fields via trigger ──
  console.log('\n--- 7. Immutable fields (BEFORE UPDATE trigger) ---');
  const immEmail = 'immutable-verify-' + ts + '@test.com';
  const { data: immUser } = await admin.auth.admin.createUser({
    email: immEmail, password: 'Imm123!', email_confirm: true,
  });
  if (immUser?.user) {
    const ic = createClient(URL, ANON_KEY);
    await ic.auth.signInWithPassword({ email: immEmail, password: 'Imm123!' });

    const { data: immBooking } = await (ic.from('bookings') as any).insert({
      booking_number: 'KH-IMM-' + ts,
      user_id: immUser.user.id,
      court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
      booking_range: formatRange(TEST_DATE, 12, 13),
      duration_minutes: 60, total_price: 400, status: 'Reserved',
      booking_source: 'ONLINE', user_name: 'ImmV', user_email: immEmail, user_phone: '000',
    }).select('id').single();

    if (immBooking) {
      const { error: courtErr } = await (ic.from('bookings') as any)
        .update({ court_id: 'a1b2c3d4-0002-4000-8000-000000000002' }).eq('id', immBooking.id);
      assert('court_id immutable', !!courtErr, courtErr ? courtErr.code : 'no error');

      const { error: priceErr } = await (ic.from('bookings') as any)
        .update({ total_price: 1 }).eq('id', immBooking.id);
      assert('total_price immutable', !!priceErr, priceErr ? priceErr.code : 'no error');

      const { error: rangeErr } = await (ic.from('bookings') as any)
        .update({ booking_range: formatRange(TEST_DATE, 15, 16) }).eq('id', immBooking.id);
      assert('booking_range immutable', !!rangeErr, rangeErr ? rangeErr.code : 'no error');

      const { error: uidErr } = await (ic.from('bookings') as any)
        .update({ user_id: '00000000-0000-0000-0000-000000000000' }).eq('id', immBooking.id);
      assert('user_id immutable', !!uidErr, uidErr ? uidErr.code : 'no error');
    }
    await admin.auth.admin.deleteUser(immUser.user.id);
  }

  // ── 8. EXCLUDE constraint ──
  console.log('\n--- 8. EXCLUDE constraint still works ---');
  const exEmail = 'exclude-verify-' + ts + '@test.com';
  const { data: exUser } = await admin.auth.admin.createUser({
    email: exEmail, password: 'Ex123!', email_confirm: true,
  });
  if (exUser?.user) {
    const ec = createClient(URL, ANON_KEY);
    await ec.auth.signInWithPassword({ email: exEmail, password: 'Ex123!' });

    const { data: exBooking } = await (ec.from('bookings') as any).insert({
      booking_number: 'KH-EX-' + ts,
      user_id: exUser.user.id,
      court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
      booking_range: formatRange(TEST_DATE, 13, 14),
      duration_minutes: 60, total_price: 400, status: 'Reserved',
      booking_source: 'ONLINE', user_name: 'ExV', user_email: exEmail, user_phone: '000',
    }).select('id').single();

    if (exBooking) {
      const { error: overlapErr } = await (ec.from('bookings') as any).insert({
        booking_number: 'KH-EX2-' + ts,
        user_id: exUser.user.id,
        court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
        booking_range: formatRange(TEST_DATE, 13, 14),
        duration_minutes: 60, total_price: 400, status: 'Reserved',
        booking_source: 'ONLINE', user_name: 'ExV2', user_email: exEmail, user_phone: '000',
      });
      assert('EXCLUDE constraint blocks overlap', overlapErr?.code === '23P01', 'code=' + overlapErr?.code);

      const { error: noOverlapErr } = await (ec.from('bookings') as any).insert({
        booking_number: 'KH-EX3-' + ts,
        user_id: exUser.user.id,
        court_id: 'a1b2c3d4-0001-4000-8000-000000000001',
        booking_range: formatRange(TEST_DATE, 14, 15),
        duration_minutes: 60, total_price: 400, status: 'Reserved',
        booking_source: 'ONLINE', user_name: 'ExV3', user_email: exEmail, user_phone: '000',
      });
      assert('EXCLUDE allows adjacent slot', !noOverlapErr, noOverlapErr ? noOverlapErr.code : 'OK');
    }
    await admin.auth.admin.deleteUser(exUser.user.id);
  }

  // ── Results ──
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS:');
  results.forEach(r => console.log(r));
  console.log('='.repeat(60));
  console.log('PASSED: ' + passed + '/' + (passed + failed));
  console.log('FAILED: ' + failed + '/' + (passed + failed));
  console.log(failed === 0 ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
}

main().catch(console.error);
