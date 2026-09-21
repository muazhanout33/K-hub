/**
 * Phase 22.14 — Real Test Identities & Data Setup
 *
 * Creates dedicated test users and test courts in the real Supabase project.
 * Uses the service-role key ONLY for provisioning (creating auth users, seeding courts).
 * Future tests MUST authenticate as the actual test users — service-role is NOT used for testing.
 *
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: npx tsx scripts/setup-test-identities.ts
 *
 * SAFETY:
 *   - Only creates new records; does NOT modify/delete existing data
 *   - All test entities use "TEST_" prefix for easy identification
 *   - No secrets are printed or committed
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('❌ Missing required environment variables in .env.local');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

// ── Test Identity Definitions ─────────────────────

// Test credentials are loaded from environment variables.
// Required env vars: TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD, etc.
// All six must be set — no fallbacks, no hardcoded values.
const REQUIRED_ENV_VARS = [
  'TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL', 'TEST_USER_B_PASSWORD',
  'TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD',
] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    console.error('   All six test credentials must be set in .env.local');
    process.exit(1);
  }
}

const TEST_USERS = [
  {
    email: process.env.TEST_USER_A_EMAIL!,
    password: process.env.TEST_USER_A_PASSWORD!,
    fullName: 'TEST_USER_A',
    role: 'User' as const,
  },
  {
    email: process.env.TEST_USER_B_EMAIL!,
    password: process.env.TEST_USER_B_PASSWORD!,
    fullName: 'TEST_USER_B',
    role: 'User' as const,
  },
  {
    email: process.env.TEST_ADMIN_EMAIL!,
    password: process.env.TEST_ADMIN_PASSWORD!,
    fullName: 'TEST_ADMIN',
    role: 'Admin' as const,
  },
];

const TEST_COURTS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'TEST_COURT_1',
    sport_type: 'Padel',
    surface: 'Test Surface',
    is_indoor: false,
    capacity: 4,
    price_per_hour: 100,
    rating: 0,
    review_count: 0,
    image_url: '',
    gallery_urls: [],
    description: 'Test court for automated testing',
    features: [],
    rules: [],
    status: 'Available',
    working_hours_open: '07:00:00',
    working_hours_close: '23:00:00',
    slot_duration_minutes: 60,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'TEST_COURT_2',
    sport_type: 'Tennis',
    surface: 'Test Surface',
    is_indoor: true,
    capacity: 2,
    price_per_hour: 150,
    rating: 0,
    review_count: 0,
    image_url: '',
    gallery_urls: [],
    description: 'Second test court for concurrency testing',
    features: [],
    rules: [],
    status: 'Available',
    working_hours_open: '07:00:00',
    working_hours_close: '23:00:00',
    slot_duration_minutes: 60,
  },
];

// ── Service-role client (for provisioning only) ──

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ───────────────────────────────────────

async function findUserByEmail(email: string): Promise<string | null> {
  const { data, error } = await adminClient.auth.admin.listUsers();
  if (error) throw new Error(`Failed to list users: ${error.message}`);
  const user = data.users.find((u) => u.email === email);
  return user?.id ?? null;
}

async function createAuthUser(
  email: string,
  password: string,
  fullName: string
): Promise<string> {
  const existingId = await findUserByEmail(email);
  if (existingId) {
    console.log(`  ℹ User ${email} already exists (${existingId}), skipping creation`);
    return existingId;
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) throw new Error(`Failed to create user ${email}: ${error.message}`);
  console.log(`  ✓ Created auth user: ${email} (${data.user.id})`);
  return data.user.id;
}

async function getProfile(userId: string): Promise<{ role: string } | null> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}

async function updateProfileRole(userId: string, role: string): Promise<void> {
  const { error } = await adminClient
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(`Failed to update profile role for ${userId}: ${error.message}`);
  console.log(`  ✓ Updated profile role to ${role} for ${userId}`);
}

async function createCourt(court: (typeof TEST_COURTS)[0]): Promise<void> {
  const { data: existing } = await adminClient
    .from('courts')
    .select('id')
    .eq('id', court.id)
    .single();

  if (existing) {
    console.log(`  ℹ Court ${court.name} already exists (${court.id}), skipping creation`);
    return;
  }

  const { error } = await adminClient.from('courts').insert(court);
  if (error) throw new Error(`Failed to create court ${court.name}: ${error.message}`);
  console.log(`  ✓ Created court: ${court.name} (${court.id})`);
}

// ── Main ──────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Phase 22.14 — Test Identities & Data Setup');
  console.log('═══════════════════════════════════════════════');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log('');

  // ── Step 1: Create Auth Users ──
  console.log('── Creating Test Auth Users ──');
  const userIds: Record<string, string> = {};

  for (const user of TEST_USERS) {
    userIds[user.email] = await createAuthUser(user.email, user.password, user.fullName);
  }
  console.log('');

  // ── Step 2: Verify/Update Profiles ──
  console.log('── Verifying Profiles & Roles ──');
  for (const user of TEST_USERS) {
    const userId = userIds[user.email];
    const profile = await getProfile(userId);

    if (!profile) {
      console.log(`  ⚠ Profile not found for ${user.fullName} (${userId}).`);
      console.log('    The handle_new_user trigger may not have fired. Waiting 2s and retrying...');
      await new Promise((r) => setTimeout(r, 2000));
      const retryProfile = await getProfile(userId);
      if (!retryProfile) {
        console.error(`  ❌ Profile still not found for ${userId}. Manual intervention needed.`);
        continue;
      }
      if (retryProfile.role !== user.role) {
        await updateProfileRole(userId, user.role);
      } else {
        console.log(`  ✓ ${user.fullName}: profile exists, role=${retryProfile.role} (correct)`);
      }
    } else if (profile.role !== user.role) {
      console.log(`  ⚠ ${user.fullName}: profile role is '${profile.role}', expected '${user.role}'`);
      await updateProfileRole(userId, user.role);
    } else {
      console.log(`  ✓ ${user.fullName}: profile exists, role=${profile.role} (correct)`);
    }
  }
  console.log('');

  // ── Step 3: Create Test Courts ──
  console.log('── Creating Test Courts ──');
  for (const court of TEST_COURTS) {
    await createCourt(court);
  }
  console.log('');

  // ── Step 4: Verify Authentication ──
  console.log('── Verifying Authentication ──');
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);

  for (const user of TEST_USERS) {
    const { data, error } = await anonClient.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });

    if (error || !data.user) {
      console.error(`  ❌ ${user.fullName}: login FAILED — ${error?.message || 'No user returned'}`);
    } else {
      console.log(`  ✓ ${user.fullName}: login SUCCESS (user_id=${data.user.id})`);

      // Verify profile via authenticated anon client (RLS enforced)
      const { data: profileData, error: profileError } = await anonClient
        .from('profiles')
        .select('role, full_name')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.log(`    ⚠ Could not read profile via RLS: ${profileError.message}`);
      } else {
        console.log(`    ✓ Profile: full_name=${profileData.full_name}, role=${profileData.role}`);
      }

      // Sign out to reset session for next user
      await anonClient.auth.signOut();
    }
  }
  console.log('');

  // ── Step 5: Verify Courts ──
  console.log('── Verifying Test Courts ──');
  const { data: courts, error: courtsError } = await anonClient
    .from('courts')
    .select('id, name, sport_type, status')
    .in('id', TEST_COURTS.map((c) => c.id));

  if (courtsError) {
    console.error(`  ❌ Failed to query courts: ${courtsError.message}`);
  } else {
    for (const court of TEST_COURTS) {
      const found = courts?.find((c) => c.id === court.id);
      if (found) {
        console.log(`  ✓ ${found.name}: sport_type=${found.sport_type}, status=${found.status}`);
      } else {
        console.log(`  ⚠ ${court.name} (${court.id}): not found in query results`);
      }
    }
  }
  console.log('');

  // ── Summary ──
  console.log('═══════════════════════════════════════════════');
  console.log(' Setup Complete');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('Test Users (emails only — passwords stored in env vars):');
  console.log(`  TEST_USER_A  = ${TEST_USERS[0].email}`);
  console.log(`  TEST_USER_B  = ${TEST_USERS[1].email}`);
  console.log(`  TEST_ADMIN   = ${TEST_USERS[2].email}`);
  console.log('');
  console.log('Test Courts:');
  console.log('  TEST_COURT_1 = 00000000-0000-4000-8000-000000000001');
  console.log('  TEST_COURT_2 = 00000000-0000-4000-8000-000000000002');
  console.log('');
  console.log('⚠ IMPORTANT: These credentials are for testing only.');
  console.log('  Do NOT use service-role key to simulate user behavior.');
  console.log('  Future tests MUST authenticate via signInWithPassword().');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
