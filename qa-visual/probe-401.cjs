/* Reproduce the anon bookings 401 and inspect the exact error body. */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

async function main() {
  const d = '2026-11-03';
  const range = `["${d}T00:00:00+00", "${d}T23:59:59+00")`;

  // 1. The exact query useAllBookingsForDate makes
  const r1 = await c
    .from('bookings')
    .select('*')
    .neq('status', 'Cancelled')
    .neq('status', 'Expired')
    .filter('booking_range', 'ov', range);
  console.log('QUERY1 status=', r1.status, 'error=', JSON.stringify(r1.error));
  console.log('QUERY1 data len=', r1.data && r1.data.length);

  // 2. Plain select to isolate whether `filter/ov` is the trigger
  const r2 = await c.from('bookings').select('*').limit(5);
  console.log('QUERY2 status=', r2.status, 'error=', JSON.stringify(r2.error));
  console.log('QUERY2 data len=', r2.data && r2.data.length);

  // 3. Count-only select
  const r3 = await c.from('bookings').select('*', { count: 'exact', head: true });
  console.log('QUERY3 status=', r3.status, 'error=', JSON.stringify(r3.error), 'count=', r3.count);
}
main().catch((e) => console.error('FATAL', e));
