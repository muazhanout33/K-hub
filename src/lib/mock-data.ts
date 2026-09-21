import { Court, Sponsor, EventItem, Testimonial, FAQItem, TimeSlot, Booking } from '@/types';
import { generateAvailabilitySlots } from '@/lib/availability';
import { useBlockedPeriodStore } from '@/features/booking/useBlockedPeriodStore';

export const MOCK_COURTS: Court[] = [
  {
    id: 'a1b2c3d4-0001-4000-8000-000000000001',
    name: 'Pro Padel Center Arena 1',
    sportType: 'Padel',
    surface: 'Mondo Supercourt XN',
    isIndoor: true,
    capacity: 4,
    pricePerHour: 400,
    rating: 4.9,
    reviewCount: 128,
    image: '/images/courts/padel-1.jpg',
    gallery: [
      '/images/courts/padel-1.jpg',
      '/images/courts/gallery-padel-2.jpg',
      '/images/courts/gallery-padel-3.jpg',
    ],
    description: 'State-of-the-art panoramic indoor Padel court featuring official WPT turf, LED lighting system, and climate control for year-round optimal performance.',
    features: ['Panoramic Glass Walls', 'Official WPT Turf', 'Climate Controlled', 'Pro Audio System', 'Locker Room Access'],
    rules: ['Non-marking shoes required', 'Maximum 4 players', 'Cancel up to 12 hours prior', 'No glass containers'],
    status: 'Available',
    workingHours: { open: '07:00', close: '00:00' },
    slotDurationMinutes: 60,
  },
  {
    id: 'a1b2c3d4-0002-4000-8000-000000000002',
    name: 'Emirates Pitch 5v5',
    sportType: 'Football',
    surface: 'FIFA Quality Pro Turf',
    isIndoor: false,
    capacity: 10,
    pricePerHour: 300,
    rating: 4.8,
    reviewCount: 94,
    image: '/images/courts/football-5v5.jpg',
    gallery: [
      '/images/courts/football-5v5.jpg',
      '/images/courts/football-7v7.jpg',
      '/images/courts/gallery-football-2.jpg',
    ],
    description: 'Premium outdoor 5-a-side football field equipped with shock-pad underlay synthetic turf, floodlights, and electronic scoreboard.',
    features: ['Floodlights', 'Electronic Scoreboard', 'Shock-Pad Turf', 'Team Dugouts', 'Chilled Water Station'],
    rules: ['Turf shoes or FG cleats required', 'Maximum 12 players', 'No metal studs', 'Reschedule allowed 24h prior'],
    status: 'Available',
    workingHours: { open: '07:00', close: '00:00' },
    slotDurationMinutes: 60,
  },
  {
    id: 'a1b2c3d4-0003-4000-8000-000000000003',
    name: 'Grandstand Hard Court 1',
    sportType: 'Tennis',
    surface: 'DecoTurf Acrylic Hard Court',
    isIndoor: true,
    capacity: 4,
    pricePerHour: 350,
    rating: 4.95,
    reviewCount: 86,
    image: '/images/courts/tennis-hard-1.jpg',
    gallery: [
      '/images/courts/tennis-hard-1.jpg',
      '/images/courts/tennis-clay.jpg',
      '/images/courts/gallery-tennis-2.jpg',
    ],
    description: 'Tournament-grade indoor hard court used for regional championships. Features Hawk-Eye camera playback and spectator seating.',
    features: ['Hawk-Eye Camera Playback', 'Tournament Lighting', 'Spectator Seating (50 seats)', 'Ball Machine Rental Available'],
    rules: ['Tennis attire required', 'Appropriate tennis shoes only', 'Silence during play'],
    status: 'Starts Soon',
    workingHours: { open: '07:00', close: '00:00' },
    slotDurationMinutes: 60,
  },
  {
    id: 'a1b2c3d4-0004-4000-8000-000000000004',
    name: 'Sunset Outdoor Padel Court 2',
    sportType: 'Padel',
    surface: 'Mondo Supercourt',
    isIndoor: false,
    capacity: 4,
    pricePerHour: 250,
    rating: 4.75,
    reviewCount: 65,
    image: '/images/courts/padel-1.jpg',
    gallery: [
      '/images/courts/padel-1.jpg',
    ],
    description: 'Scenic outdoor court perfect for evening matches with high-lux LED illumination and breeze shade net cover.',
    features: ['LED Night Lighting', 'Shade Canopy', 'Lounge Area Nearby', 'Fresh Towel Service'],
    rules: ['Proper sports shoes', 'Reservation confirmed upon checkout'],
    status: 'Booked',
    workingHours: { open: '08:00', close: '02:00' },
    slotDurationMinutes: 60,
  },
  {
    id: 'a1b2c3d4-0005-4000-8000-000000000005',
    name: 'Champions Stadium 7v7',
    sportType: 'Football',
    surface: 'Hybrid Grass',
    isIndoor: false,
    capacity: 14,
    pricePerHour: 95,
    rating: 4.92,
    reviewCount: 150,
    image: '/images/courts/football-7v7.jpg',
    gallery: [
      '/images/courts/football-7v7.jpg',
    ],
    description: 'Full-size 7-a-side professional hybrid pitch with grandstand seating, broadcast lighting, and dedicated referee lounge.',
    features: ['Grandstand 200 Capacity', 'HD Recording Camera', 'Player Tunnel', 'Sound System'],
    rules: ['No food on pitch', 'Standard football footwear'],
    status: 'Available',
    workingHours: { open: '07:00', close: '00:00' },
    slotDurationMinutes: 60,
  },
  {
    id: 'a1b2c3d4-0006-4000-8000-000000000006',
    name: 'Clay Court Roland Garros Replica',
    sportType: 'Tennis',
    surface: 'Red Clay',
    isIndoor: false,
    capacity: 4,
    pricePerHour: 60,
    rating: 4.88,
    reviewCount: 79,
    image: '/images/courts/tennis-clay.jpg',
    gallery: [
      '/images/courts/tennis-clay.jpg',
    ],
    description: 'Authentic European red clay court maintained daily. Drag-mat provided before and after every match.',
    features: ['Daily Clay Grooming', 'Shaded Player Benches', 'Clay Court Shoes Recommended'],
    rules: ['Brush court after match', 'Clean shoes before entering clubhouse'],
    status: 'Available',
    workingHours: { open: '07:00', close: '00:00' },
    slotDurationMinutes: 60,
  },
];

export const MOCK_SPONSORS: Sponsor[] = [
  {
    id: 'sponsor-1',
    companyName: 'Nike Pro Sports',
    logo: '⚡',
    tagline: 'Official Performance Apparel Partner',
    offer: '20% OFF all footwear & apparel for K-HUB members',
    discountCode: 'KHUB-NIKE20',
    website: 'https://nike.com',
    category: 'Apparel',
  },
  {
    id: 'sponsor-2',
    companyName: 'Babolat Padel & Tennis',
    logo: '🎾',
    tagline: 'Official Racket & Ball Supplier',
    offer: '15% OFF pro rackets at K-HUB Pro Shop',
    discountCode: 'BABOLAT-KHUB',
    website: 'https://babolat.com',
    category: 'Equipment',
  },
  {
    id: 'sponsor-3',
    companyName: 'Gatorade Hydration',
    logo: '🥤',
    tagline: 'Official Sports Fuel & Hydration',
    offer: 'Buy 1 Get 1 Free on all Gatorade products at clubhouse',
    discountCode: 'GATOR-KHUB',
    website: 'https://gatorade.com',
    category: 'Nutrition',
  },
  {
    id: 'sponsor-4',
    companyName: 'Red Bull Energy',
    logo: '🐂',
    tagline: 'Energy for High Performance',
    offer: 'Free Red Bull after every tournament match',
    discountCode: 'REDBULL-KHUB',
    website: 'https://redbull.com',
    category: 'Energy',
  },
];

export const MOCK_EVENTS: EventItem[] = [
  {
    id: 'event-1',
    title: 'K-HUB Open Padel Championship 2026',
    description: 'Join the biggest Padel tournament of the summer! Cash prizes up to $5,000 for top 3 teams, live DJ, BBQ, and sponsor giveaways.',
    image: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
    date: '2026-08-15',
    time: '09:00 AM - 08:00 PM',
    location: 'Pro Padel Center Arenas 1-4',
    sportType: 'Padel',
    maxParticipants: 32,
    currentParticipants: 24,
    entryFee: 500,
    organizer: 'K-HUB Sports Director',
    registeredUsers: ['user-1', 'user-2'],
  },
  {
    id: 'event-2',
    title: 'Summer 5v5 Football Night League',
    description: 'Under-the-lights 5-a-side football league running every Friday evening. Trophy, medals, and free kit customization for winning team.',
    image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=1200&q=80',
    date: '2026-08-21',
    time: '07:00 PM - 11:00 PM',
    location: 'Emirates Pitch 5v5',
    sportType: 'Football',
    maxParticipants: 16,
    currentParticipants: 12,
    entryFee: 1200,
    organizer: 'K-HUB Football Academy',
    registeredUsers: ['user-1'],
  },
  {
    id: 'event-3',
    title: 'Tennis Masters Singles Knockout',
    description: 'UTR-rated tennis tournament open to intermediate and advanced players. Certified umpire matches with video recording.',
    image: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=80',
    date: '2026-09-02',
    time: '10:00 AM - 06:00 PM',
    location: 'Grandstand Hard Court 1',
    sportType: 'Tennis',
    maxParticipants: 16,
    currentParticipants: 10,
    entryFee: 400,
    organizer: 'K-HUB Tennis Head Coach',
    registeredUsers: [],
  },
];

export const MOCK_TESTIMONIALS: Testimonial[] = [
  {
    id: 'test-1',
    name: 'Alexander Wright',
    role: 'Pro Padel Player & Club Member',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    comment: 'K-HUB is miles ahead of any sports club in the region. The court quality is unbelievable, and reserving a slot takes literally 15 seconds. Seamless!',
    date: '2 days ago',
  },
  {
    id: 'test-2',
    name: 'Sarah Jenkins',
    role: 'Tennis Coach & Member',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    comment: 'The 10-minute temporary lock feature prevents duplicate bookings completely when my students reserve. World class UI experience!',
    date: '1 week ago',
  },
  {
    id: 'test-3',
    name: 'Michael Chang',
    role: 'Captain, FC Thunder',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    comment: 'We book Emirates Pitch 5v5 every Tuesday night. The instant confirmation, clear pricing, and lighting make night games feel like Champions League!',
    date: '2 weeks ago',
  },
];

export const MOCK_FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'Booking',
    question: 'How does the 10-minute temporary reservation work?',
    answer: 'When you select an available time slot, it immediately locks for 10 minutes exclusively for you. A live countdown timer starts at the top of your screen. Other users cannot select it during this window while you log in and confirm. If needed, you can extend it once by 5 minutes.',
  },
  {
    id: 'faq-2',
    category: 'Cancellation',
    question: 'What is the court cancellation policy?',
    answer: 'You can cancel any confirmed booking directly from "My Bookings" up to 12 hours before your start time for a 100% full refund or club credit. Cancellations made between 6 to 12 hours receive a 50% credit. Under 6 hours notice is non-refundable.',
  },
  {
    id: 'faq-3',
    category: 'Membership',
    question: 'Do I need a membership to book a court?',
    answer: 'No! Anyone can book courts as a Registered User. Simply create an account and start booking.',
  },
  {
    id: 'faq-4',
    category: 'General',
    question: 'Can I rent rackets, balls, and equipment on site?',
    answer: 'Yes! Our Pro Shop offers Babolat Padel rackets, Wilson Tennis rackets, and match balls for rent at $5 per session. Premium & VIP members receive free rentals.',
  },
  {
    id: 'faq-5',
    category: 'General',
    question: 'What are the club working hours?',
    answer: 'We are open 7 days a week from 06:00 AM to 12:00 AM (midnight). All courts are fully illuminated with high-lux LED floodlights after sunset.',
  },
];

/**
 * Generates time slots for a given court/date using the availability engine.
 * This is the backward-compatible wrapper used by booking.service and UI components.
 *
 * Delegates all business logic to generateAvailabilitySlots in @/lib/availability.
 *
 * @param courtOrId - Court object (preferred) or court ID string. When a full Court
 *                    object is passed the MOCK_COURTS lookup is bypassed, allowing
 *                    real Supabase courts to generate slots correctly.
 */
export const GENERATE_TIME_SLOTS = (
  courtOrId: string | Court,
  date: string,
  pricePerHour: number,
  bookings: Booking[] = []
): TimeSlot[] => {
  const court = typeof courtOrId === 'object'
    ? courtOrId
    : MOCK_COURTS.find((c) => c.id === courtOrId);
  if (!court) return [];

  const blockedPeriods = useBlockedPeriodStore.getState().getBlockedPeriodsForCourtDate(court.id, date);
  return generateAvailabilitySlots(court, date, bookings, blockedPeriods);
};

export const INITIAL_USER_BOOKINGS: Booking[] = [];
