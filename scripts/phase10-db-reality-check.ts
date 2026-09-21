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
const admin = createClient(URL, SERVICE_KEY);

async function main() {
  console.log('=== PHASE 10 STEP 2: DATABASE REALITY CHECK ===\n');

  // Query 1: All user indexes on our tables
  console.log('--- 1. ALL USER INDEXES (pg_indexes) ---');
  const { data: indexes, error: idxErr } = await admin.rpc('exec_sql', {
    query: `
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN (
          'bookings', 'courts', 'blocked_periods', 'profiles',
          'payments', 'notifications', 'events', 'event_registrations',
          'sponsors', 'sponsorship_requests', 'advertising_spaces',
          'advertisement_requests', 'faqs', 'testimonials',
          'contact_submissions', 'system_settings'
        )
      ORDER BY tablename, indexname;
    `
  });

  if (idxErr) {
    console.log('exec_sql not available, trying alternative approach...');
    // Try information_schema
    const { data: altIndexes, error: altErr } = await admin.rpc('exec_sql', {
      query: `SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;`
    });
    if (altErr) {
      console.log('Cannot query pg_indexes directly. Will use behavioral testing.');
      console.log('ERROR:', idxErr.message);
    } else {
      console.log(JSON.stringify(altIndexes, null, 2));
    }
  } else {
    console.log(JSON.stringify(indexes, null, 2));
  }

  // Query 2: Index sizes
  console.log('\n--- 2. INDEX SIZES ---');
  const { data: sizes, error: sizeErr } = await admin.rpc('exec_sql', {
    query: `
      SELECT
        indexrelname AS index_name,
        relname AS table_name,
        pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
        pg_relation_size(indexrelid) AS index_size_bytes
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND relname IN (
          'bookings', 'courts', 'blocked_periods', 'profiles',
          'payments', 'notifications', 'events'
        )
      ORDER BY pg_relation_size(indexrelid) DESC;
    `
  });

  if (sizeErr) {
    console.log('Cannot query pg_stat_user_indexes:', sizeErr.message);
  } else {
    console.log(JSON.stringify(sizes, null, 2));
  }

  // Query 3: Index usage stats
  console.log('\n--- 3. INDEX USAGE STATS ---');
  const { data: usage, error: usageErr } = await admin.rpc('exec_sql', {
    query: `
      SELECT
        indexrelname AS index_name,
        relname AS table_name,
        idx_scan AS scans,
        idx_tup_read AS tuples_read,
        idx_tup_fetch AS tuples_fetched,
        CASE WHEN idx_scan = 0 THEN 'UNUSED' ELSE 'USED' END AS status
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND relname IN (
          'bookings', 'courts', 'blocked_periods', 'profiles',
          'payments', 'notifications', 'events'
        )
      ORDER BY relname, idx_scan DESC;
    `
  });

  if (usageErr) {
    console.log('Cannot query usage stats:', usageErr.message);
  } else {
    console.log(JSON.stringify(usage, null, 2));
  }

  // Query 4: Table sizes
  console.log('\n--- 4. TABLE SIZES ---');
  const { data: tableSizes, error: tsErr } = await admin.rpc('exec_sql', {
    query: `
      SELECT
        relname AS table_name,
        pg_size_pretty(pg_relation_size(oid)) AS table_size,
        pg_size_pretty(pg_total_relation_size(oid)) AS total_size,
        n_live_tup AS row_count
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
        AND relname IN (
          'bookings', 'courts', 'blocked_periods', 'profiles',
          'payments', 'notifications', 'events'
        )
      ORDER BY pg_relation_size(oid) DESC;
    `
  });

  if (tsErr) {
    console.log('Cannot query table sizes:', tsErr.message);
  } else {
    console.log(JSON.stringify(tableSizes, null, 2));
  }

  // Query 5: Check for GiST indexes (EXCLUDE constraint related)
  console.log('\n--- 5. GiST INDEXES (EXCLUDE constraint related) ---');
  const { data: gistIdx, error: gistErr } = await admin.rpc('exec_sql', {
    query: `
      SELECT
        indexrelname AS index_name,
        relname AS table_name,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexdef LIKE '%gist%'
      ORDER BY tablename, indexname;
    `
  });

  if (gistErr) {
    console.log('Cannot query GiST indexes:', gistErr.message);
  } else {
    console.log(JSON.stringify(gistIdx, null, 2));
  }

  // Query 6: EXPLAIN for key booking queries
  console.log('\n--- 6. EXPLAIN: User bookings query ---');
  const { data: explain1, error: e1Err } = await admin.rpc('exec_sql', {
    query: `
      EXPLAIN (FORMAT JSON)
      SELECT * FROM public.bookings
      WHERE user_id = '00000000-0000-0000-0000-000000000000'
      ORDER BY created_at DESC;
    `
  });
  if (e1Err) console.log('Error:', e1Err.message);
  else console.log(JSON.stringify(explain1, null, 2));

  console.log('\n--- 7. EXPLAIN: Admin bookings by status ---');
  const { data: explain2, error: e2Err } = await admin.rpc('exec_sql', {
    query: `
      EXPLAIN (FORMAT JSON)
      SELECT * FROM public.bookings
      WHERE status = 'Reserved'
      ORDER BY booking_range;
    `
  });
  if (e2Err) console.log('Error:', e2Err.message);
  else console.log(JSON.stringify(explain2, null, 2));

  console.log('\n--- 8. EXPLAIN: Court availability lookup ---');
  const { data: explain3, error: e3Err } = await admin.rpc('exec_sql', {
    query: `
      EXPLAIN (FORMAT JSON)
      SELECT * FROM public.bookings
      WHERE court_id = 'a1b2c3d4-0001-4000-8000-000000000001'
        AND booking_range && tstzrange('2026-09-01 10:00:00+00', '2026-09-01 11:00:00+00')
        AND status IN ('Reserved', 'Confirmed');
    `
  });
  if (e3Err) console.log('Error:', e3Err.message);
  else console.log(JSON.stringify(explain3, null, 2));

  console.log('\n--- 9. EXPLAIN: Expire stale bookings ---');
  const { data: explain4, error: e4Err } = await admin.rpc('exec_sql', {
    query: `
      EXPLAIN (FORMAT JSON)
      SELECT * FROM public.bookings
      WHERE status = 'Reserved'
        AND booking_range < tstzrange('[2026-08-23 00:00:00+00,)');
    `
  });
  if (e4Err) console.log('Error:', e4Err.message);
  else console.log(JSON.stringify(explain4, null, 2));

  console.log('\n--- 10. EXPLAIN: Blocked periods overlap ---');
  const { data: explain5, error: e5Err } = await admin.rpc('exec_sql', {
    query: `
      EXPLAIN (FORMAT JSON)
      SELECT * FROM public.blocked_periods
      WHERE court_id = 'a1b2c3d4-0001-4000-8000-000000000001'
        AND blocked_range && tstzrange('2026-09-01 10:00:00+00', '2026-09-01 11:00:00+00');
    `
  });
  if (e5Err) console.log('Error:', e5Err.message);
  else console.log(JSON.stringify(explain5, null, 2));

  // Query 11: Check duplicate/overlapping indexes
  console.log('\n--- 11. DUPLICATE/OVERLAPPING INDEX CHECK ---');
  const { data: dups, error: dupErr } = await admin.rpc('exec_sql', {
    query: `
      WITH index_cols AS (
        SELECT
          indexrelid,
          indrelid,
          indexrelid::regclass AS index_name,
          indrelid::regclass AS table_name,
          array_agg(attname ORDER BY array_position(indkey, attkey)) AS columns,
          CASE WHEN indisunique THEN 'unique' ELSE 'non-unique' END AS uniqueness,
          CASE WHEN indpred IS NOT NULL THEN pg_get_expr(indpred, indrelid) END AS predicate
        FROM pg_index
        JOIN pg_attribute ON attrelid = indrelid AND attnum = ANY(indkey)
        JOIN pg_class ON oid = indexrelid
        WHERE indrelid::regclass::schema = 'public'
        GROUP BY indexrelid, indrelid, indisunique, indpred
      )
      SELECT a.table_name, a.index_name AS index_a, a.columns AS cols_a,
             b.index_name AS index_b, b.columns AS cols_b,
             a.uniqueness, a.predicate
      FROM index_cols a
      JOIN index_cols b ON a.table_name = b.table_name
        AND a.index_name < b.index_name
        AND a.columns = b.columns
      ORDER BY a.table_name;
    `
  });
  if (dupErr) console.log('Cannot check duplicates:', dupErr.message);
  else console.log(JSON.stringify(dups, null, 2));
}

main().catch(console.error);
