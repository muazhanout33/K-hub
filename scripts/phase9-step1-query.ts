/**
 * Phase 9 — Step 1: Query live DB using service role for test setup
 * (Service role used ONLY for test data setup, not for production code)
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
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']!;
const ANON_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!;

// Service-role client for admin queries (bypasses RLS)
const admin = createClient(URL, SERVICE_KEY);
// Anon client for actual testing (RLS enforced)
const anon = createClient(URL, ANON_KEY);

async function main() {
  console.log('=== Phase 9 — Live DB Query (Service Role) ===\n');

  // 1. Get courts
  const { data: courts, error: courtErr } = await admin
    .from('courts')
    .select('id, name, status, price_per_hour, working_hours_open, working_hours_close, slot_duration_minutes')
    .is('deleted_at', null)
    .order('name');

  if (courtErr) {
    console.error('Court query error:', courtErr.message);
  } else {
    console.log('=== COURTS ===');
    for (const c of courts || []) {
      console.log(`  ${c.id} | ${c.name} | status=${c.status} | price=${c.price_per_hour} | hours=${c.working_hours_open}-${c.working_hours_close} | slot=${c.slot_duration_minutes}min`);
    }
  }

  // 2. Get bookings count
  const { count: bookingCount, error: countErr } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true });
  console.log(`\n=== BOOKINGS: ${bookingCount ?? 'error: ' + countErr?.message} ===`);

  // 3. Get profiles
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, role, full_name')
    .limit(20);

  console.log('\n=== PROFILES (first 20) ===');
  if (profiles && profiles.length > 0) {
    for (const p of profiles) {
      console.log(`  ${p.id} | ${p.email} | role=${p.role} | name=${p.full_name}`);
    }
  } else {
    console.log('  (none found)');
  }

  // 4. Get existing bookings
  const { data: bookings } = await admin
    .from('bookings')
    .select('id, booking_number, status, booking_range, user_id, court_id')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n=== EXISTING BOOKINGS (last 10) ===');
  if (bookings && bookings.length > 0) {
    for (const b of bookings) {
      console.log(`  ${b.booking_number} | status=${b.status} | court=${b.court_id} | range=${b.booking_range}`);
    }
  } else {
    console.log('  (no bookings)');
  }

  // 5. Try to list auth users via admin API
  console.log('\n=== AUTH USERS (list) ===');
  try {
    const { data: users, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 20 });
    if (usersErr) {
      console.log(`  Error: ${usersErr.message}`);
    } else if (users?.users) {
      for (const u of users.users) {
        console.log(`  ${u.id} | ${u.email} | created=${u.created_at}`);
      }
    }
  } catch (e: any) {
    console.log(`  Exception: ${e.message}`);
  }
}

main().catch(console.error);
