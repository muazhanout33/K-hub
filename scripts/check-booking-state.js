require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
(async () => {
  // 1. List all courts (no filter)
  const { data: courts, error: cErr } = await sb.from('courts').select('id, name, status, price_per_hour');
  console.log('=== COURTS ===', cErr?.message);
  courts?.forEach(c => console.log(c.id, c.name, c.status, c.price_per_hour));

  // 2. List profiles
  const { data: profiles, error: pErr } = await sb.from('profiles').select('id, full_name, role');
  console.log('\n=== PROFILES ===', pErr?.message);
  profiles?.forEach(p => console.log(p.id, p.full_name, p.role));

  // 3. List all bookings
  const { data: bookings, error: bErr } = await sb.from('bookings').select('id, booking_number, court_id, user_id, status, booking_range');
  console.log('\n=== ALL BOOKINGS ===', bErr?.message);
  bookings?.forEach(b => console.log(b.booking_number, b.court_id, b.user_id, b.status));

  // 4. Check blocked periods
  const { data: blocked, error: blErr } = await sb.from('blocked_periods').select('*');
  console.log('\n=== BLOCKED PERIODS ===', blErr?.message);
  blocked?.forEach(b => console.log(JSON.stringify(b)));

  process.exit(0);
})();
