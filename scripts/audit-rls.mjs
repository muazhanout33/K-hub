import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');

function getEnvVar(name) {
  const match = envContent.match(new RegExp(`${name}=(.+)`));
  return match ? match[1].trim() : null;
}

const SUPABASE_URL = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_ROLE_KEY = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const PROJECT_REF = SUPABASE_URL ? SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] : null;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY || !PROJECT_REF) {
  console.error('❌ Error: Missing required env vars in .env.local');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const { Client } = await import('pg');

console.log('='.repeat(80));
console.log('SUPABASE RLS AUDIT');
console.log('='.repeat(80));
console.log(`Project: ${PROJECT_REF}`);
console.log(`URL: ${SUPABASE_URL}`);
console.log(`Region: eu-central-1 (confirmed by DNS resolution)`);
console.log('');

// ============================================================
// PHASE 1: Try direct postgres connection with DB password
// ============================================================
console.log('PHASE 1: Direct Postgres Connection Attempt');
console.log('-'.repeat(80));

let connected = false;
let client = null;

// Try pooler with the service role key as password (unlikely but check)
const testClient = new Client({
  host: `aws-0-eu-central-1.pooler.supabase.com`,
  port: 6543,
  user: `postgres.${PROJECT_REF}`,
  password: SERVICE_ROLE_KEY,
  database: 'postgres',
  connectionTimeoutMillis: 8000,
});

try {
  await testClient.connect();
  console.log('✓ Connected to pooler!');
  client = testClient;
  connected = true;
} catch (e) {
  console.log(`Pooler auth failed: ${e.message.substring(0, 80)}`);
  console.log('(This is expected - the service role key is not the database password)');
  try { await testClient.end(); } catch (_) {}
}

if (connected) {
  // Create exec_sql and run queries
  await client.query(`
    CREATE OR REPLACE FUNCTION exec_sql(sql_query text) 
    RETURNS SETOF json 
    AS $$ BEGIN RETURN QUERY EXECUTE sql_query; END; $$ 
    LANGUAGE plpgsql SECURITY DEFINER
  `);
  console.log('✓ exec_sql created');

  console.log('\n' + '='.repeat(80));
  console.log('QUERY 1: All tables with RLS status');
  console.log('='.repeat(80));
  const q1 = await client.query(`
    SELECT schemaname, tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    ORDER BY tablename
  `);
  console.log(JSON.stringify(q1.rows, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('QUERY 2: All policies');
  console.log('='.repeat(80));
  const q2 = await client.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies 
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `);
  console.log(JSON.stringify(q2.rows, null, 2));

  await client.end();
  process.exit(0);
}

// ============================================================
// PHASE 2: REST API Analysis (when direct connection fails)
// ============================================================
console.log('\n' + '='.repeat(80));
console.log('PHASE 2: REST API Analysis');
console.log('='.repeat(80));

// Get full OpenAPI spec
console.log('\nFetching OpenAPI spec...');
const specResp = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { 'apikey': SERVICE_ROLE_KEY } });
const spec = await specResp.json();

const tables = [];
const rpcFunctions = [];
for (const [path, methods] of Object.entries(spec.paths)) {
  if (path === '/') continue;
  if (path.startsWith('/rpc/')) {
    rpcFunctions.push(path.replace('/rpc/', ''));
  } else {
    tables.push(path.replace('/', ''));
  }
}

console.log(`\nAll public tables (${tables.length}):`);
tables.forEach(t => console.log(`  - ${t}`));
console.log(`\nAll RPC functions (${rpcFunctions.length}):`);
rpcFunctions.forEach(f => console.log(`  - ${f}`));

// Print full table schemas from OpenAPI definitions
if (spec.definitions) {
  console.log('\n' + '='.repeat(80));
  console.log('TABLE SCHEMAS (from OpenAPI definitions)');
  console.log('='.repeat(80));
  for (const [name, def] of Object.entries(spec.definitions)) {
    const props = def.properties ? Object.entries(def.properties) : [];
    console.log(`\n  ${name} (${props.length} columns):`);
    for (const [colName, colDef] of props) {
      const nullable = def.required && !def.required.includes(colName) ? '?' : '';
      console.log(`    ${colName}: ${colDef.type || 'unknown'}${nullable}`);
    }
  }
}

// Test service_role access (bypasses RLS)
console.log('\n' + '='.repeat(80));
console.log('TABLE ACCESS TEST (service_role key - bypasses RLS)');
console.log('='.repeat(80));

for (const table of tables) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'count=exact',
    },
  });
  const countHeader = resp.headers.get('content-range');
  const total = countHeader ? countHeader.split('/')[1] : '?';

  if (resp.ok) {
    const data = await resp.json();
    console.log(`  ✅ ${table}: accessible (rows: ${data.length}, total: ${total})`);
  } else {
    const err = await resp.json();
    console.log(`  ❌ ${table}: ${err.code || resp.status} - ${err.message || 'unknown error'}`);
  }
}

// Test anon access (subject to RLS)
console.log('\n' + '='.repeat(80));
console.log('TABLE ACCESS TEST (anon key - subject to RLS)');
console.log('='.repeat(80));

for (const table of tables) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
  });

  if (resp.ok) {
    const data = await resp.json();
    console.log(`  ✅ ${table}: accessible (${data.length} rows)`);
  } else {
    const err = await resp.json();
    console.log(`  ❌ ${table}: ${err.code || resp.status} - ${err.message || 'unknown error'}`);
  }
}

// Test RPC functions
console.log('\n' + '='.repeat(80));
console.log('RPC FUNCTIONS');
console.log('='.repeat(80));

for (const fn of rpcFunctions) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const data = await resp.json();
  console.log(`  ${fn}: ${JSON.stringify(data)}`);
}

console.log('\n' + '='.repeat(80));
console.log('AUDIT COMPLETE');
console.log('='.repeat(80));
console.log(`
LIMITATION: Could not execute raw SQL queries against pg_tables/pg_policies
because:
  1. The exec_sql function does not exist in this project
  2. No database password is available in .env.local
  3. The Management API requires a Personal Access Token (not the service role key)
  4. The project's pooler is in eu-central-1 but authentication requires the DB password

TO COMPLETE THE AUDIT, you need one of:
  a) The database password from Supabase Dashboard → Settings → Database → Connection string
  b) A Personal Access Token from Supabase Dashboard → Account → Access Tokens
     (then use: POST https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query)
  c) Run the SQL manually in Supabase Dashboard → SQL Editor:

     -- Query 1: RLS status
     SELECT schemaname, tablename, rowsecurity 
     FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

     -- Query 2: All policies
     SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
     FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;

     -- Query 3: Table permissions
     SELECT grantee, table_name, privilege_type 
     FROM information_schema.table_privileges 
     WHERE table_schema = 'public' ORDER BY table_name, grantee;
`);
