/**
 * Seed script for static data: Events, FAQs, Testimonials.
 *
 * Usage:
 *   node scripts/seed-static-data.mjs
 *
 * Environment variables required (loaded from .env.local via dotenv):
 *   NEXT_PUBLIC_SUPABASE_URL  – your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – service role key (server-side only, never exposed to client)
 *
 * Idempotent: uses natural-key lookup (title/question/name) to find existing rows.
 *   - If a row with the natural key exists: UPDATE it (preserve existing UUID).
 *   - If no row exists: INSERT with a deterministic UUID.
 *   - If duplicate natural-key rows exist: LOG a warning, skip that seed item.
 *
 * NEVER deletes rows. NEVER uses onConflict(id).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Deterministic UUID v5-like generator.
 * Produces the same UUID for the same namespace+name input.
 * Used ONLY for new inserts — never for conflict detection.
 */
function deterministicUUID(namespace, name) {
  const hash = createHash('sha256')
    .update(`${namespace}:${name}`)
    .digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from project root
import dotenv from 'dotenv';
dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

// ── Step 0: Ensure GRANTs exist ───────────────

async function ensureGrants() {
  console.log('Ensuring GRANTs for service_role...');
  const grants = [
    'GRANT ALL ON public.events TO service_role;',
    'GRANT ALL ON public.faqs TO service_role;',
    'GRANT ALL ON public.testimonials TO service_role;',
    'GRANT SELECT ON public.events TO authenticated;',
    'GRANT SELECT ON public.faqs TO authenticated;',
    'GRANT SELECT ON public.testimonials TO authenticated;',
  ];

  for (const sql of grants) {
    const { error } = await supabase.rpc('exec_sql', { query: sql }).single();
    if (error && !error.message?.includes('function')) {
      // Some other error — log but continue
    }
  }
  console.log('  GRANT check complete.\n');
}

// ── Events ────────────────────────────────────

const EVENT_NS = 'k-hub-events-v1';
const events = [
  {
    naturalKey: 'K-HUB Open Padel Championship 2026',
    title: 'K-HUB Open Padel Championship 2026',
    description: 'Join the biggest Padel tournament of the summer! Cash prizes up to $5,000 for top 3 teams, live DJ, BBQ, and sponsor giveaways.',
    image_url: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
    event_date: '2026-08-15',
    start_time: '09:00 AM',
    end_time: '08:00 PM',
    location: 'Pro Padel Center Arenas 1-4',
    sport_type: 'Padel',
    max_participants: 32,
    current_participants: 24,
    entry_fee: 500,
    organizer: 'K-HUB Sports Director',
  },
  {
    naturalKey: 'Summer 5v5 Football Night League',
    title: 'Summer 5v5 Football Night League',
    description: 'Under-the-lights 5-a-side football league running every Friday evening. Trophy, medals, and free kit customization for winning team.',
    image_url: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=1200&q=80',
    event_date: '2026-08-21',
    start_time: '07:00 PM',
    end_time: '11:00 PM',
    location: 'Emirates Pitch 5v5',
    sport_type: 'Football',
    max_participants: 16,
    current_participants: 12,
    entry_fee: 1200,
    organizer: 'K-HUB Football Academy',
  },
  {
    naturalKey: 'Tennis Masters Singles Knockout',
    title: 'Tennis Masters Singles Knockout',
    description: 'UTR-rated tennis tournament open to intermediate and advanced players. Certified umpire matches with video recording.',
    image_url: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=80',
    event_date: '2026-09-02',
    start_time: '10:00 AM',
    end_time: '06:00 PM',
    location: 'Grandstand Hard Court 1',
    sport_type: 'Tennis',
    max_participants: 16,
    current_participants: 10,
    entry_fee: 400,
    organizer: 'K-HUB Tennis Head Coach',
  },
];

// ── FAQs ──────────────────────────────────────

const FAQ_NS = 'k-hub-faqs-v1';
const faqs = [
  {
    naturalKey: 'How does the 10-minute temporary reservation work?',
    category: 'Booking',
    question: 'How does the 10-minute temporary reservation work?',
    answer: 'When you select an available time slot, it immediately locks for 10 minutes exclusively for you. A live countdown timer starts at the top of your screen. Other users cannot select it during this window while you log in and confirm. If needed, you can extend it once by 5 minutes.',
    display_order: 1,
  },
  {
    naturalKey: 'What is the court cancellation policy?',
    category: 'Cancellation',
    question: 'What is the court cancellation policy?',
    answer: 'You can cancel any confirmed booking directly from "My Bookings" up to 12 hours before your start time for a 100% full refund or club credit. Cancellations made between 6 to 12 hours receive a 50% credit. Under 6 hours notice is non-refundable.',
    display_order: 2,
  },
  {
    naturalKey: 'Do I need a membership to book a court?',
    category: 'Membership',
    question: 'Do I need a membership to book a court?',
    answer: 'No! Anyone can book courts as a Registered User. Simply create an account and start booking.',
    display_order: 3,
  },
  {
    naturalKey: 'Can I rent rackets, balls, and equipment on site?',
    category: 'General',
    question: 'Can I rent rackets, balls, and equipment on site?',
    answer: 'Yes! Our Pro Shop offers Babolat Padel rackets, Wilson Tennis rackets, and match balls for rent at $5 per session. Premium & VIP members receive free rentals.',
    display_order: 4,
  },
  {
    naturalKey: 'What are the club working hours?',
    category: 'General',
    question: 'What are the club working hours?',
    answer: 'We are open 7 days a week from 06:00 AM to 12:00 AM (midnight). All courts are fully illuminated with high-lux LED floodlights after sunset.',
    display_order: 5,
  },
];

// ── Testimonials ──────────────────────────────

const TESTIMONIAL_NS = 'k-hub-testimonials-v1';
const testimonials = [
  {
    naturalKey: 'Alexander Wright',
    name: 'Alexander Wright',
    role: 'Pro Padel Player & Club Member',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    comment: 'K-HUB is miles ahead of any sports club in the region. The court quality is unbelievable, and reserving a slot takes literally 15 seconds. Seamless!',
  },
  {
    naturalKey: 'Sarah Jenkins',
    name: 'Sarah Jenkins',
    role: 'Tennis Coach & Member',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    comment: 'The 10-minute temporary lock feature prevents duplicate bookings completely when my students reserve. World class UI experience!',
  },
  {
    naturalKey: 'Michael Chang',
    name: 'Michael Chang',
    role: 'Captain, FC Thunder',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    comment: 'We book Emirates Pitch 5v5 every Tuesday night. The instant confirmation, clear pricing, and lighting make night games feel like Champions League!',
  },
];

// ── Seed Functions ────────────────────────────

/**
 * Seed a table using natural-key lookup.
 *
 * For each seed row:
 *   1. SELECT all rows where naturalColumn = seed.naturalKey
 *   2. If 0 found → INSERT with deterministic UUID
 *   3. If 1 found → UPDATE that row (preserve existing UUID)
 *   4. If >1 found → LOG warning, skip (duplicates already exist)
 *
 * Returns { created, updated, skipped, warnings }
 */
async function seedTable(tableName, seedRows, naturalColumn, idNamespace) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const warnings = [];

  for (const row of seedRows) {
    const { data: existing, error: selectError } = await supabase
      .from(tableName)
      .select('id')
      .eq(naturalColumn, row.naturalKey);

    if (selectError) {
      console.error(`  ERROR selecting from ${tableName}:`, selectError.message);
      warnings.push(`SELECT failed for "${row.naturalKey}": ${selectError.message}`);
      continue;
    }

    if (!existing || existing.length === 0) {
      // No existing row → INSERT with deterministic UUID
      const id = deterministicUUID(idNamespace, row.naturalKey);
      const { naturalKey: _nk, ...insertData } = row;
      const { error: insertError } = await supabase
        .from(tableName)
        .insert({ id, ...insertData });

      if (insertError) {
        console.error(`  ERROR inserting into ${tableName}:`, insertError.message);
        warnings.push(`INSERT failed for "${row.naturalKey}": ${insertError.message}`);
        continue;
      }
      created++;
    } else if (existing.length === 1) {
      // Exactly one existing row → UPDATE it (preserve existing UUID)
      const existingId = existing[0].id;
      const { naturalKey: _nk, ...updateData } = row;
      const { error: updateError } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', existingId);

      if (updateError) {
        console.error(`  ERROR updating ${tableName}:`, updateError.message);
        warnings.push(`UPDATE failed for "${row.naturalKey}": ${updateError.message}`);
        continue;
      }
      updated++;
    } else {
      // Multiple existing rows → duplicate detected, skip
      console.warn(`  WARNING: ${tableName} has ${existing.length} rows with ${naturalColumn}="${row.naturalKey}" — skipping (manual cleanup needed)`);
      warnings.push(`Duplicate: ${existing.length} rows with ${naturalColumn}="${row.naturalKey}" (IDs: ${existing.map(r => r.id).join(', ')})`);
      skipped++;
    }
  }

  return { created, updated, skipped, warnings };
}

async function seedEvents() {
  console.log('Seeding events...');
  const result = await seedTable('events', events, 'title', EVENT_NS);
  console.log(`  OK — created: ${result.created}, updated: ${result.updated}, skipped: ${result.skipped}`);
  if (result.warnings.length) {
    console.log(`  Warnings: ${result.warnings.length}`);
    result.warnings.forEach(w => console.log(`    - ${w}`));
  }
  return result.skipped === 0;
}

async function seedFaqs() {
  console.log('Seeding FAQs...');
  const result = await seedTable('faqs', faqs, 'question', FAQ_NS);
  console.log(`  OK — created: ${result.created}, updated: ${result.updated}, skipped: ${result.skipped}`);
  if (result.warnings.length) {
    console.log(`  Warnings: ${result.warnings.length}`);
    result.warnings.forEach(w => console.log(`    - ${w}`));
  }
  return result.skipped === 0;
}

async function seedTestimonials() {
  console.log('Seeding testimonials...');
  const result = await seedTable('testimonials', testimonials, 'name', TESTIMONIAL_NS);
  console.log(`  OK — created: ${result.created}, updated: ${result.updated}, skipped: ${result.skipped}`);
  if (result.warnings.length) {
    console.log(`  Warnings: ${result.warnings.length}`);
    result.warnings.forEach(w => console.log(`    - ${w}`));
  }
  return result.skipped === 0;
}

// ── Main ──────────────────────────────────────

async function main() {
  console.log('--- Seed Static Data ---');
  console.log('Strategy: natural-key lookup (title/question/name)');
  console.log('  - 0 existing rows → INSERT with deterministic UUID');
  console.log('  - 1 existing row   → UPDATE (preserve existing UUID)');
  console.log('  - >1 existing rows → WARN, skip (no auto-delete)\n');

  await ensureGrants();

  const results = await Promise.all([
    seedEvents(),
    seedFaqs(),
    seedTestimonials(),
  ]);

  const allPassed = results.every(Boolean);
  console.log(allPassed
    ? '\nAll static data seeded successfully.'
    : '\nSome seeds had warnings. Check output above for details.');

  process.exit(allPassed ? 0 : 1);
}

main();
