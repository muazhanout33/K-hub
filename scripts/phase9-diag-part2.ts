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
  console.log('=== DIAGNOSTIC PART 2: Service-role test ===');
  console.log('Service-role key length:', SERVICE_KEY.length);
  console.log('Service-role prefix:', SERVICE_KEY.substring(0, 20));

  // Check if this is actually the service_role key or a different key
  // by trying to auth.admin operations (only service_role can do this)
  console.log('\n--- Auth admin test ---');
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  console.log('auth.admin.listUsers:', error ? 'FAIL: ' + error.message : 'OK users=' + (data?.users?.length || 0));

  // Check which tables service-role CAN access vs CANNOT
  console.log('\n--- Full table access matrix ---');
  const allTables = [
    'bookings', 'courts', 'profiles', 'blocked_periods',
    'notifications', 'payments', 'events', 'faqs', 'testimonials',
    'contact_submissions', 'system_settings', 'sponsorship_requests',
    'advertisement_requests'
  ];
  const canAccess: string[] = [];
  const cannotAccess: string[] = [];

  for (const t of allTables) {
    const { error: err } = await admin.from(t).select('*').limit(0);
    if (err) {
      cannotAccess.push(t + '(' + err.code + ')');
    } else {
      canAccess.push(t);
    }
  }
  console.log('CAN access:', canAccess.join(', '));
  console.log('CANNOT access:', cannotAccess.join(', '));

  // Try to use PostgREST schema endpoint to check if service_role is even the right role
  console.log('\n--- PostgREST schema check ---');
  const resp = await fetch(URL + '/rest/v1/', {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
  });
  console.log('Schema endpoint status:', resp.status);
  const body = await resp.text();
  console.log('Schema body preview:', body.substring(0, 300));

  // Check the JWT claims of the service key
  console.log('\n--- Service key JWT claims ---');
  try {
    const payload = JSON.parse(Buffer.from(SERVICE_KEY.split('.')[1], 'base64').toString());
    console.log('JWT role:', payload.role);
    console.log('JWT iss:', payload.iss);
    console.log('JWT exp:', new Date(payload.exp * 1000).toISOString());
  } catch (e) {
    console.log('Could not parse JWT:', e);
  }

  console.log('\n=== PART 2 COMPLETE ===');
}

main().catch(console.error);
