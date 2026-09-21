import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use SUPABASE_SERVICE_ROLE_KEY for administrative DB seeding to bypass RLS, falling back to ANON_KEY
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const isServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log(`Connecting to Supabase project: ${SUPABASE_URL}`);
console.log(`Auth key role: ${isServiceRole ? 'service_role (Administrative)' : 'anon (Public / Client)'}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const COURTS = [
  {
    id: 'a1b2c3d4-0001-4000-8000-000000000001',
    name: 'Pro Padel Center Arena 1',
    sport_type: 'Padel',
    surface: 'Mondo Supercourt XN',
    is_indoor: true,
    capacity: 4,
    price_per_hour: 400,
    rating: 4.9,
    review_count: 128,
    image_url: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
    gallery_urls: [
      'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1626248801379-51a0748a5f96?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=1200&q=80',
    ],
    description: 'State-of-the-art panoramic indoor Padel court featuring official WPT turf, LED lighting system, and climate control for year-round optimal performance.',
    features: ['Panoramic Glass Walls', 'Official WPT Turf', 'Climate Controlled', 'Pro Audio System', 'Locker Room Access'],
    rules: ['Non-marking shoes required', 'Maximum 4 players', 'Cancel up to 12 hours prior', 'No glass containers'],
    status: 'Available',
    working_hours_open: '07:00:00',
    working_hours_close: '00:00:00',
    slot_duration_minutes: 60,
  },
  {
    id: 'a1b2c3d4-0002-4000-8000-000000000002',
    name: 'Emirates Pitch 5v5',
    sport_type: 'Football',
    surface: 'FIFA Quality Pro Turf',
    is_indoor: false,
    capacity: 10,
    price_per_hour: 300,
    rating: 4.8,
    review_count: 94,
    image_url: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=1200&q=80',
    gallery_urls: [
      'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80',
    ],
    description: 'Premium outdoor 5-a-side football field equipped with shock-pad underlay synthetic turf, floodlights, and electronic scoreboard.',
    features: ['Floodlights', 'Electronic Scoreboard', 'Shock-Pad Turf', 'Team Dugouts', 'Chilled Water Station'],
    rules: ['Turf shoes or FG cleats required', 'Maximum 12 players', 'No metal studs', 'Reschedule allowed 24h prior'],
    status: 'Available',
    working_hours_open: '07:00:00',
    working_hours_close: '00:00:00',
    slot_duration_minutes: 60,
  },
  {
    id: 'a1b2c3d4-0003-4000-8000-000000000003',
    name: 'Grandstand Hard Court 1',
    sport_type: 'Tennis',
    surface: 'DecoTurf Acrylic Hard Court',
    is_indoor: true,
    capacity: 4,
    price_per_hour: 350,
    rating: 4.95,
    review_count: 86,
    image_url: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=80',
    gallery_urls: [
      'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80',
    ],
    description: 'Tournament-grade indoor hard court used for regional championships. Features Hawk-Eye camera playback and spectator seating.',
    features: ['Hawk-Eye Camera Playback', 'Tournament Lighting', 'Spectator Seating (50 seats)', 'Ball Machine Rental Available'],
    rules: ['Tennis attire required', 'Appropriate tennis shoes only', 'Silence during play'],
    status: 'Starts Soon',
    working_hours_open: '07:00:00',
    working_hours_close: '00:00:00',
    slot_duration_minutes: 60,
  },
  {
    id: 'a1b2c3d4-0004-4000-8000-000000000004',
    name: 'Sunset Outdoor Padel Court 2',
    sport_type: 'Padel',
    surface: 'Mondo Supercourt',
    is_indoor: false,
    capacity: 4,
    price_per_hour: 250,
    rating: 4.75,
    review_count: 65,
    image_url: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
    gallery_urls: [
      'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
    ],
    description: 'Scenic outdoor court perfect for evening matches with high-lux LED illumination and breeze shade net cover.',
    features: ['LED Night Lighting', 'Shade Canopy', 'Lounge Area Nearby', 'Fresh Towel Service'],
    rules: ['Proper sports shoes', 'Reservation confirmed upon checkout'],
    status: 'Booked',
    working_hours_open: '08:00:00',
    working_hours_close: '02:00:00',
    slot_duration_minutes: 60,
  },
  {
    id: 'a1b2c3d4-0005-4000-8000-000000000005',
    name: 'Champions Stadium 7v7',
    sport_type: 'Football',
    surface: 'Hybrid Grass',
    is_indoor: false,
    capacity: 14,
    price_per_hour: 95,
    rating: 4.92,
    review_count: 150,
    image_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
    gallery_urls: [
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
    ],
    description: 'Full-size 7-a-side professional hybrid pitch with grandstand seating, broadcast lighting, and dedicated referee lounge.',
    features: ['Grandstand 200 Capacity', 'HD Recording Camera', 'Player Tunnel', 'Sound System'],
    rules: ['No food on pitch', 'Standard football footwear'],
    status: 'Available',
    working_hours_open: '07:00:00',
    working_hours_close: '00:00:00',
    slot_duration_minutes: 60,
  },
  {
    id: 'a1b2c3d4-0006-4000-8000-000000000006',
    name: 'Clay Court Roland Garros Replica',
    sport_type: 'Tennis',
    surface: 'Red Clay',
    is_indoor: false,
    capacity: 4,
    price_per_hour: 60,
    rating: 4.88,
    review_count: 79,
    image_url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1200&q=80',
    gallery_urls: [
      'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1200&q=80',
    ],
    description: 'Authentic European red clay court maintained daily. Drag-mat provided before and after every match.',
    features: ['Daily Clay Grooming', 'Shaded Player Benches', 'Clay Court Shoes Recommended'],
    rules: ['Brush court after match', 'Clean shoes before entering clubhouse'],
    status: 'Available',
    working_hours_open: '07:00:00',
    working_hours_close: '00:00:00',
    slot_duration_minutes: 60,
  },
];

async function seed() {
  console.log('Seeding 6 courts into Supabase public.courts...');

  let successCount = 0;
  let failCount = 0;

  for (const court of COURTS) {
    const { error } = await supabase
      .from('courts')
      .upsert(court, { onConflict: 'id' });

    if (error) {
      console.error(`❌ Failed to insert ${court.name}:`, error.message);
      failCount++;
    } else {
      console.log(`✅ Seeded ${court.name}`);
      successCount++;
    }
  }

  // Query final row count
  const { data, error } = await supabase.from('courts').select('id, name, sport_type');
  if (error) {
    console.error('❌ Failed to query courts:', error.message);
  } else {
    console.log(`\n--- SUMMARY ---`);
    console.log(`Successfully seeded: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total courts in public.courts: ${data ? data.length : 0}`);
  }

  if (!isServiceRole && failCount > 0) {
    console.log('\n💡 TIP: The database has RLS enabled on public.courts ("Admins write courts").');
    console.log('   Add SUPABASE_SERVICE_ROLE_KEY=your_service_role_key to .env.local to run administrative seed scripts.');
  }
}

seed().catch(console.error);
