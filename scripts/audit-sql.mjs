import { readFileSync } from 'fs';

const sql = readFileSync('docs/0001_supabase_schema.sql', 'utf8');

const results = [];
let pass = 0;
let fail = 0;

function check(label, condition) {
  const status = condition ? 'PASS' : 'FAIL';
  if (condition) pass++; else fail++;
  results.push({ status, label });
}

// ── 1. EXTENSIONS ──────────────────────────────────────────────────────────────
check('btree_gist extension declared', sql.includes('CREATE EXTENSION IF NOT EXISTS "btree_gist"'));
check('uuid-ossp extension declared', sql.includes('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'));

// ── 2. ENUM IDEMPOTENCY ────────────────────────────────────────────────────────
const enums = [
  'user_role_enum', 'user_status_enum', 'sport_type_enum', 'court_status_enum',
  'booking_status_enum', 'booking_source_enum', 'payment_status_enum',
  'sponsorship_target_enum', 'sponsorship_pricing_enum', 'sponsorship_status_enum',
  'advertisement_status_enum'
];
enums.forEach(e => {
  const pattern = new RegExp('DO \\$\\$[\\s\\S]*?' + e + '[\\s\\S]*?EXCEPTION WHEN duplicate_object');
  check('ENUM idempotent DO/EXCEPTION: ' + e, pattern.test(sql));
});

// ── 3. TABLE IF NOT EXISTS ─────────────────────────────────────────────────────
const tables = [
  'profiles', 'courts', 'blocked_periods', 'bookings', 'payments', 'notifications',
  'events', 'event_registrations', 'sponsors', 'sponsorship_requests',
  'advertising_spaces', 'advertisement_requests', 'faqs', 'testimonials',
  'contact_submissions', 'system_settings'
];
tables.forEach(t => check('Table CREATE IF NOT EXISTS: ' + t,
  sql.includes('CREATE TABLE IF NOT EXISTS public.' + t)));

// ── 4. FOREIGN KEYS & CASCADE BEHAVIOR ────────────────────────────────────────
check('blocked_periods.created_by ON DELETE SET NULL',
  sql.includes('created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL'));
check('bookings.user_id ON DELETE RESTRICT',
  sql.includes('user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT'));
check('bookings.court_id ON DELETE RESTRICT',
  sql.includes('court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE RESTRICT'));
check('payments.booking_id ON DELETE RESTRICT',
  sql.includes('booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT'));
check('profiles -> auth.users ON DELETE CASCADE',
  sql.includes('REFERENCES auth.users(id) ON DELETE CASCADE'));
check('notifications.related_booking_id ON DELETE SET NULL',
  sql.includes('related_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL'));

// ── 5. DOUBLE-BOOKING EXCLUDE CONSTRAINT ──────────────────────────────────────
check('prevent_double_booking EXCLUDE USING gist declared',
  sql.includes('CONSTRAINT prevent_double_booking EXCLUDE USING gist'));
check('prevent_double_booking: court_id WITH = and booking_range WITH &&',
  sql.includes('court_id WITH =,') && sql.includes('booking_range WITH &&'));
check("prevent_double_booking WHERE status IN ('Reserved', 'Confirmed')",
  sql.includes("WHERE (status IN ('Reserved', 'Confirmed'))"));
check('prevent_overlapping_blocked_periods EXCLUDE declared',
  sql.includes('CONSTRAINT prevent_overlapping_blocked_periods EXCLUDE USING gist'));
check('prevent_overlapping_ad_requests EXCLUDE declared',
  sql.includes('CONSTRAINT prevent_overlapping_ad_requests EXCLUDE USING gist'));

// ── 6. PAYMENT FINANCIAL INTEGRITY ────────────────────────────────────────────
check('payments.amount BIGINT NOT NULL CHECK > 0 (piastres)',
  sql.includes('amount BIGINT NOT NULL CHECK (amount > 0)'));
check('payments.idempotency_key TEXT UNIQUE NOT NULL',
  sql.includes('idempotency_key TEXT UNIQUE NOT NULL'));
check('payments.refunded_amount nullable safety check',
  sql.includes('refunded_amount BIGINT CHECK (refunded_amount IS NULL OR refunded_amount >= 0)'));
check("payments.currency VARCHAR(3) DEFAULT 'EGP'",
  sql.includes("currency VARCHAR(3) NOT NULL DEFAULT 'EGP'"));
check('payments has no open user INSERT policy',
  !sql.includes('public.payments FOR INSERT WITH CHECK (auth.uid()'));

// ── 7. INDEXES ─────────────────────────────────────────────────────────────────
const indexes = [
  'idx_bookings_court_range', 'idx_bookings_user_status', 'idx_bookings_status_range',
  'idx_blocked_periods_court_range', 'idx_payments_booking_id', 'idx_payments_status',
  'idx_notifications_user_read', 'idx_courts_sport_status',
  'idx_sponsorship_requests_status', 'idx_ad_requests_status'
];
indexes.forEach(i => check('Index declared: ' + i, sql.includes(i)));

// ── 8. SECURITY DEFINER + search_path ─────────────────────────────────────────
const sdWithPath = (sql.match(/LANGUAGE plpgsql SECURITY DEFINER SET search_path = public/g) || []).length;
check('is_admin() uses SECURITY DEFINER SET search_path = public', sdWithPath >= 1);
check('handle_new_user() uses SECURITY DEFINER SET search_path = public', sdWithPath >= 2);
check('No bare SECURITY DEFINER without search_path',
  !sql.includes('LANGUAGE plpgsql SECURITY DEFINER;') &&
  !sql.includes('LANGUAGE plpgsql SECURITY DEFINER\n'));

// ── 9. TRIGGERS ────────────────────────────────────────────────────────────────
const triggers = [
  'tr_profiles_updated_at', 'tr_courts_updated_at', 'tr_bookings_updated_at',
  'tr_payments_updated_at', 'tr_events_updated_at', 'tr_sponsorship_requests_updated_at',
  'tr_advertisement_requests_updated_at', 'on_auth_user_created'
];
triggers.forEach(t => check('Trigger DROP IF EXISTS + CREATE: ' + t,
  sql.includes('DROP TRIGGER IF EXISTS ' + t) && sql.includes('CREATE TRIGGER ' + t)));

// ── 10. RLS ENABLED ON ALL TABLES ─────────────────────────────────────────────
tables.forEach(t => check('RLS ENABLE ROW LEVEL SECURITY: ' + t,
  sql.includes('ALTER TABLE public.' + t + ' ENABLE ROW LEVEL SECURITY')));

// ── 11. PROFILE RLS – NO INVALID SYNTAX, ROLE ESCALATION GUARD ───────────────
// Verify 'IS NOT CHANGED' never appears as executable SQL (only safe if in comment lines)
const notChangedLines = sql.split('\n').filter(l => l.includes('IS NOT CHANGED'));
const allInComments = notChangedLines.every(l => l.trimStart().startsWith('--'));
check('Profile UPDATE policy: invalid IS NOT CHANGED not present as executable SQL',
  allInComments);
check('Profile UPDATE policy: role subquery guard uses get_my_role() (anti-recursion)',
  sql.includes('AND role = public.get_my_role()'));
check('Profile UPDATE policy: does NOT contain raw subquery on public.profiles (recursion risk)',
  !sql.includes('role = (SELECT role FROM public.profiles WHERE id = auth.uid())'));

// ── SECTION 12b: get_my_role() SECURITY DEFINER HELPER ────────────────────────
check('get_my_role() SECURITY DEFINER SET search_path = empty string declared',
  sql.includes("LANGUAGE sql SECURITY DEFINER SET search_path = ''"));
check('get_my_role() returns user_role_enum',
  sql.includes('RETURNS user_role_enum'));

// ── 12. BOOKING RLS – STATUS RESTRICTION FOR USERS ──────────────────────────────
check('Booking UPDATE policy named "Users cancel own bookings"',
  sql.includes('"Users cancel own bookings"'));
check("Booking policy enforces status IN ('Cancelled', 'Confirmed') for users",
  sql.includes("AND status IN ('Cancelled', 'Confirmed')"));
check('Booking cancel policy guards court_id immutability',
  sql.includes('court_id   = (SELECT court_id   FROM public.bookings WHERE id = bookings.id)'));
check('Booking cancel policy guards total_price immutability',
  sql.includes('total_price = (SELECT total_price FROM public.bookings WHERE id = bookings.id)'));
check('Booking cancel policy guards booking_range immutability',
  sql.includes('booking_range = (SELECT booking_range FROM public.bookings WHERE id = bookings.id)'));

// ── 13. PROPOSAL INSERT POLICIES ──────────────────────────────────────────────
check('Sponsorship INSERT locked to status=\'Pending\' AND is_active=false',
  sql.includes("status = 'Pending' AND is_active = false"));
check("Advertisement INSERT locked to status='Pending'",
  sql.includes('"Public insert advertisement requests"') &&
  sql.includes("FOR INSERT WITH CHECK (status = 'Pending')"));
check('No unrestricted WITH CHECK (true) on proposal tables',
  !sql.includes("sponsorship_requests FOR INSERT WITH CHECK (true)") &&
  !sql.includes("advertisement_requests FOR INSERT WITH CHECK (true)"));

// ── SECTION 13b: NOTIFICATIONS GRANULAR POLICIES ──────────────────────────────
// Old policy only dangerous if it is still a CREATE POLICY line; DROP IF EXISTS lines are safe cleanup
const oldNotifLines = sql.split('\n').filter(l => l.includes('"Users access own notifications"'));
const oldNotifIsOnlyDrop = oldNotifLines.every(l => l.trimStart().startsWith('DROP'));
check('Notifications: old FOR ALL policy removed (no CREATE remains)',
  oldNotifIsOnlyDrop);
check('Notifications: Users view own notifications SELECT policy present',
  sql.includes('"Users view own notifications"'));
check('Notifications: Users mark notifications read UPDATE policy present',
  sql.includes('"Users mark notifications read"'));
check('Notifications: Users delete own notifications DELETE policy present',
  sql.includes('"Users delete own notifications"'));
check('Notifications: Admins manage notifications FOR ALL policy present',
  sql.includes('"Admins manage notifications"'));
check('Notifications mark-read: immutable fields enforced via WITH CHECK subqueries',
  sql.includes('AND title            = (SELECT title') &&
  sql.includes('AND message          = (SELECT message') &&
  sql.includes('AND type             = (SELECT type'));

// ── 14. OAUTH NULL-SAFETY ──────────────────────────────────────────────────────
check("handle_new_user COALESCE guards email using id::TEXT (OAuth unique sentinel)",
  sql.includes("COALESCE(NEW.email, NEW.id::TEXT)"));
check('handle_new_user does NOT fall back to empty string email',
  !sql.includes("COALESCE(NEW.email, '')"));
check("handle_new_user COALESCE on full_name with id fallback",
  sql.includes("COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.id::TEXT)"));

// ── 15. POSTGRESQL TABLE GRANTS ────────────────────────────────────────────────
check('Schema USAGE granted to anon, authenticated, service_role',
  sql.includes('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;'));
check('GRANT ALL ON ALL TABLES to service_role declared',
  sql.includes('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;'));
check('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES to anon, authenticated declared',
  sql.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;'));
check('ALTER DEFAULT PRIVILEGES declared for service_role',
  sql.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;'));
check('ALTER DEFAULT PRIVILEGES declared for anon, authenticated',
  sql.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;'));

// ── OUTPUT ────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('   K-HUB SQL MIGRATION AUDIT — COMPLETE VERIFICATION SUITE');
console.log('═══════════════════════════════════════════════════════════\n');

results.forEach(r => {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(icon + ' ' + r.label);
});

console.log('\n───────────────────────────────────────────────────────────');
console.log('PASSED: ' + pass + ' / ' + (pass + fail));
console.log('FAILED: ' + fail);
console.log('───────────────────────────────────────────────────────────');

if (fail === 0) {
  console.log('\n✅  FINAL: SAFE TO RUN\n');
  process.exit(0);
} else {
  console.log('\n❌  FINAL: NOT SAFE TO RUN — ' + fail + ' check(s) failing\n');
  process.exit(1);
}
