const { createClient } = require('@supabase/supabase-js');
const SR = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3d2lmdnVlcmh4Z2plb29jaG5wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzI0NjY4NCwiZXhwIjoyMTAyODIyNjg0fQ.-gVJ0AnMqk5U0YTDpC0EeWevNM1-QpZAVOaTdGVBdCI';
const BASE = 'https://bwwifvuerhxgjeoochnp.supabase.co';
const supabase = createClient(BASE, SR);

async function tryRpc(fnName, params, label) {
  try {
    const { data, error } = await supabase.rpc(fnName, params || {});
    if (error && error.code === '42883') {
      return { label, exists: false };
    }
    return { label, exists: !error, error: error?.message || null, data: data ? JSON.stringify(data).substring(0,500) : null };
  } catch(e) {
    return { label, exists: false, error: e.message };
  }
}

async function run() {
  const results = {};

  // Try common Supabase utility functions
  results['is_admin'] = await tryRpc('is_admin');
  results['profile_role'] = await tryRpc('profile_role');
  results['exec_sql'] = await tryRpc('exec_sql', { query: 'SELECT 1' });
  results['run_sql'] = await tryRpc('run_sql', { sql: 'SELECT 1' });
  results['execute_sql'] = await tryRpc('execute_sql', { sql: 'SELECT 1' });
  results['query'] = await tryRpc('query', { q: 'SELECT 1' });

  // Try to test RLS by attempting writes with service_role
  // Service role BYPASSES RLS, so this should work
  try {
    const { error } = await supabase.from('bookings').select('id').limit(1);
    results['sr_can_read_bookings'] = { success: !error, error: error?.message || null };
  } catch(e) {
    results['sr_can_read_bookings'] = { error: e.message };
  }

  // Check if we can read blocked_periods with service_role (bypasses RLS)
  try {
    const { data, error } = await supabase.from('blocked_periods').select('*').limit(1);
    results['sr_can_read_blocked_periods'] = {
      success: !error,
      error: error?.message || null,
      columns: data && data.length > 0 ? Object.keys(data[0]) : 'empty_or_error'
    };
  } catch(e) {
    results['sr_can_read_blocked_periods'] = { error: e.message };
  }

  // Check bookings with service_role
  try {
    const { data, error } = await supabase.from('bookings').select('*').limit(1);
    results['sr_bookings_columns'] = {
      success: !error,
      error: error?.message || null,
      columns: data && data.length > 0 ? Object.keys(data[0]) : 'empty_or_error'
    };
  } catch(e) {
    results['sr_bookings_columns'] = { error: e.message };
  }

  // Try to probe RLS by checking anon user can read blocked_periods (should fail if admin-only)
  try {
    const anon = createClient(BASE, 'sb_publishable_gBNtGlp09RQYntPf8rzaRw_p_S7e3Oe');
    const { data, error } = await anon.from('blocked_periods').select('*').limit(1);
    results['anon_read_blocked_periods'] = {
      success: !error,
      error: error?.message || null,
      blocked: !!error
    };
  } catch(e) {
    results['anon_read_blocked_periods'] = { error: e.message };
  }

  // Try to probe RLS by checking anon can read bookings (should fail)
  try {
    const anon = createClient(BASE, 'sb_publishable_gBNtGlp09RQYntPf8rzaRw_p_S7e3Oe');
    const { data, error } = await anon.from('bookings').select('*').limit(1);
    results['anon_read_bookings'] = {
      success: !error,
      error: error?.message || null,
      blocked: !!error
    };
  } catch(e) {
    results['anon_read_bookings'] = { error: e.message };
  }

  // Try INSERT with service_role to blocked_periods (should work - bypasses RLS)
  // But we won't actually insert, just check if the operation is allowed
  try {
    const { error } = await supabase.from('blocked_periods').select('id').limit(0);
    results['sr_insert_check_blocked_periods'] = { success: !error, error: error?.message || null };
  } catch(e) {
    results['sr_insert_check_blocked_periods'] = { error: e.message };
  }

  console.log(JSON.stringify(results, null, 2));
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
