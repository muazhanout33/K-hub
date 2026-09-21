/**
 * Phase 22.14.1 — RLS Policy Verification
 *
 * Verifies that the newly applied SELECT policies for courts and profiles
 * work correctly across different authentication contexts.
 *
 * Run: npx tsx scripts/verify-rls-policies.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Test credentials (from setup-test-identities.ts)
const TEST_USER_A = {
  email: process.env.TEST_USER_A_EMAIL || 'test.user.a@khub-test.com',
  password: process.env.TEST_USER_A_PASSWORD || 'TEST_UserA_2024!',
};

const TEST_USER_B = {
  email: process.env.TEST_USER_B_EMAIL || 'test.user.b@khub-test.com',
  password: process.env.TEST_USER_B_PASSWORD || 'TEST_UserB_2024!',
};

const TEST_ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL || 'test.admin@khub-test.com',
  password: process.env.TEST_ADMIN_PASSWORD || 'TEST_Admin_2024!',
};

const TEST_COURT_1 = '00000000-0000-4000-8000-000000000001';
const TEST_COURT_2 = '00000000-0000-4000-8000-000000000002';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${details}`);
}

async function signInAsUser(
  client: SupabaseClient,
  email: string,
  password: string
): Promise<string | null> {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) return null;
  return data.user.id;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Phase 22.14.1 — RLS Policy Verification');
  console.log('═══════════════════════════════════════════════\n');

  // Create different clients for different auth contexts
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ═══════════════════════════════════════════════
  // COURT RLS VERIFICATION
  // ═══════════════════════════════════════════════
  console.log('── Courts RLS ──\n');

  // Test 1: Anonymous reads non-deleted courts
  try {
    const { data, error } = await anonClient
      .from('courts')
      .select('id, name')
      .eq('id', TEST_COURT_1);

    if (error) {
      record('Anon reads non-deleted court', false, `Error: ${error.message}`);
    } else {
      const found = data && data.length > 0;
      record('Anon reads non-deleted court', found, found ? 'Court visible' : 'Court not visible');
    }
  } catch (e: any) {
    record('Anon reads non-deleted court', false, `Exception: ${e.message}`);
  }

  // Test 2: User A reads non-deleted courts
  try {
    const userIdA = await signInAsUser(anonClient, TEST_USER_A.email, TEST_USER_A.password);
    if (!userIdA) {
      record('User A reads non-deleted court', false, 'Failed to authenticate');
    } else {
      const { data, error } = await anonClient
        .from('courts')
        .select('id, name')
        .eq('id', TEST_COURT_1);

      if (error) {
        record('User A reads non-deleted court', false, `Error: ${error.message}`);
      } else {
        const found = data && data.length > 0;
        record('User A reads non-deleted court', found, found ? 'Court visible' : 'Court not visible');
      }
      await anonClient.auth.signOut();
    }
  } catch (e: any) {
    record('User A reads non-deleted court', false, `Exception: ${e.message}`);
  }

  // Test 3: Admin reads courts
  try {
    const userIdAdmin = await signInAsUser(anonClient, TEST_ADMIN.email, TEST_ADMIN.password);
    if (!userIdAdmin) {
      record('Admin reads courts', false, 'Failed to authenticate');
    } else {
      const { data, error } = await anonClient
        .from('courts')
        .select('id, name');

      if (error) {
        record('Admin reads courts', false, `Error: ${error.message}`);
      } else {
        const found = data && data.length > 0;
        record('Admin reads courts', found, found ? `Found ${data.length} courts` : 'No courts visible');
      }
      await anonClient.auth.signOut();
    }
  } catch (e: any) {
    record('Admin reads courts', false, `Exception: ${e.message}`);
  }

  // Test 4: Create a soft-deleted court and verify it's not visible to anon
  try {
    // Create a temporary court with a soft-delete marker
    const tempCourtId = '00000000-0000-4000-8000-000000000099';
    const { error: insertError } = await adminClient.from('courts').upsert({
      id: tempCourtId,
      name: 'TEST_DELETED_COURT',
      sport_type: 'Padel',
      surface: 'Test Surface',
      is_indoor: false,
      capacity: 4,
      price_per_hour: 100,
      rating: 0,
      review_count: 0,
      image_url: '',
      gallery_urls: [],
      description: 'Temporary test court for RLS verification',
      features: [],
      rules: [],
      status: 'Available',
      working_hours_open: '07:00:00',
      working_hours_close: '23:00:00',
      slot_duration_minutes: 60,
      deleted_at: new Date().toISOString(),
    });

    if (insertError) {
      record('Deleted court not visible to anon', false, `Setup error: ${insertError.message}`);
    } else {
      // Anon should NOT see this court
      const { data, error } = await anonClient
        .from('courts')
        .select('id, name')
        .eq('id', tempCourtId);

      if (error) {
        // If there's an error, it could be because the policy blocks it
        record('Deleted court not visible to anon', true, 'Query blocked (expected)');
      } else {
        const found = data && data.length > 0;
        record('Deleted court not visible to anon', !found, found ? 'SECURITY ISSUE: Deleted court visible' : 'Deleted court correctly hidden');
      }

      // Clean up
      await adminClient.from('courts').delete().eq('id', tempCourtId);
    }
  } catch (e: any) {
    record('Deleted court not visible to anon', false, `Exception: ${e.message}`);
  }

  // ═══════════════════════════════════════════════
  // PROFILES RLS VERIFICATION
  // ═══════════════════════════════════════════════
  console.log('\n── Profiles RLS ──\n');

  // Get user IDs from service-role (for reference)
  const { data: profilesData } = await adminClient
    .from('profiles')
    .select('id, email, role');

  const userAProfile = profilesData?.find(p => p.email === TEST_USER_A.email);
  const userBProfile = profilesData?.find(p => p.email === TEST_USER_B.email);
  const adminProfile = profilesData?.find(p => p.email === TEST_ADMIN.email);

  if (!userAProfile || !userBProfile || !adminProfile) {
    console.error('❌ Could not find all test user profiles via service-role');
    process.exit(1);
  }

  // Test 5: User A reads own profile
  try {
    const userIdA = await signInAsUser(anonClient, TEST_USER_A.email, TEST_USER_A.password);
    if (!userIdA) {
      record('User A reads own profile', false, 'Failed to authenticate');
    } else {
      const { data, error } = await anonClient
        .from('profiles')
        .select('id, email, role, full_name')
        .eq('id', userIdA)
        .single();

      if (error) {
        record('User A reads own profile', false, `Error: ${error.message}`);
      } else {
        record('User A reads own profile', true, `role=${data.role}, full_name=${data.full_name}`);
      }
      await anonClient.auth.signOut();
    }
  } catch (e: any) {
    record('User A reads own profile', false, `Exception: ${e.message}`);
  }

  // Test 6: User A cannot read User B's profile
  try {
    const userIdA = await signInAsUser(anonClient, TEST_USER_A.email, TEST_USER_A.password);
    if (!userIdA) {
      record('User A cannot read User B profile', false, 'Failed to authenticate');
    } else {
      const { data, error } = await anonClient
        .from('profiles')
        .select('id, email, role')
        .eq('id', userBProfile.id);

      if (error) {
        // 403 or empty result is expected
        record('User A cannot read User B profile', true, `Access denied: ${error.message}`);
      } else {
        const found = data && data.length > 0;
        record('User A cannot read User B profile', !found, found ? 'SECURITY ISSUE: Cross-user access' : 'Correctly blocked');
      }
      await anonClient.auth.signOut();
    }
  } catch (e: any) {
    record('User A cannot read User B profile', false, `Exception: ${e.message}`);
  }

  // Test 7: User B reads own profile
  try {
    const userIdB = await signInAsUser(anonClient, TEST_USER_B.email, TEST_USER_B.password);
    if (!userIdB) {
      record('User B reads own profile', false, 'Failed to authenticate');
    } else {
      const { data, error } = await anonClient
        .from('profiles')
        .select('id, email, role, full_name')
        .eq('id', userIdB)
        .single();

      if (error) {
        record('User B reads own profile', false, `Error: ${error.message}`);
      } else {
        record('User B reads own profile', true, `role=${data.role}, full_name=${data.full_name}`);
      }
      await anonClient.auth.signOut();
    }
  } catch (e: any) {
    record('User B reads own profile', false, `Exception: ${e.message}`);
  }

  // Test 8: User B cannot read User A's profile
  try {
    const userIdB = await signInAsUser(anonClient, TEST_USER_B.email, TEST_USER_B.password);
    if (!userIdB) {
      record('User B cannot read User A profile', false, 'Failed to authenticate');
    } else {
      const { data, error } = await anonClient
        .from('profiles')
        .select('id, email, role')
        .eq('id', userAProfile.id);

      if (error) {
        record('User B cannot read User A profile', true, `Access denied: ${error.message}`);
      } else {
        const found = data && data.length > 0;
        record('User B cannot read User A profile', !found, found ? 'SECURITY ISSUE: Cross-user access' : 'Correctly blocked');
      }
      await anonClient.auth.signOut();
    }
  } catch (e: any) {
    record('User B cannot read User A profile', false, `Exception: ${e.message}`);
  }

  // Test 9: Admin reads profiles per policy
  try {
    const userIdAdmin = await signInAsUser(anonClient, TEST_ADMIN.email, TEST_ADMIN.password);
    if (!userIdAdmin) {
      record('Admin reads profiles per policy', false, 'Failed to authenticate');
    } else {
      const { data, error } = await anonClient
        .from('profiles')
        .select('id, email, role');

      if (error) {
        record('Admin reads profiles per policy', false, `Error: ${error.message}`);
      } else {
        const found = data && data.length > 0;
        record('Admin reads profiles per policy', found, found ? `Found ${data.length} profiles` : 'No profiles visible');
      }
      await anonClient.auth.signOut();
    }
  } catch (e: any) {
    record('Admin reads profiles per policy', false, `Exception: ${e.message}`);
  }

  // ═══════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════');
  console.log(' Verification Summary');
  console.log('═══════════════════════════════════════════════\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.details}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
