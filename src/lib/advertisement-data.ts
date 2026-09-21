import { AdvertisingSpace } from '@/types';

/**
 * Advertising Spaces — seed data owned by the Advertisement feature.
 *
 * isAvailable = true  → space is commercially offered (will appear on /advertise)
 * isAvailable = false → space is NOT for sale (hidden/disabled — e.g. VIP Lounge Frame)
 *
 * Seeded across 3 courts + 2 facility areas, varying sizes and prices.
 */
export const ADVERTISING_SPACES: AdvertisingSpace[] = [
  {
    id: 'adspace-001',
    name: 'Football Pitch Side Banner A',
    location: 'Emirates Pitch 5v5 – Wall A (Long Side)',
    dimensions: '3m × 1m',
    basePrice: 2500,
    billingPeriod: 'Month',
    isAvailable: true,
    description:
      'High-visibility horizontal banner along the full length of Wall A. Faces players and spectators throughout every match.',
  },
  {
    id: 'adspace-002',
    name: 'Football Pitch Side Banner B',
    location: 'Emirates Pitch 5v5 – Wall B (Short End)',
    dimensions: '2m × 1m',
    basePrice: 1800,
    billingPeriod: 'Month',
    isAvailable: true,
    description:
      'End-wall banner directly behind the goal — captured in every goal-mouth replay and wide-angle shot.',
  },
  {
    id: 'adspace-003',
    name: 'Champions Stadium Perimeter Board',
    location: 'Champions Stadium 7v7 – Pitch Perimeter',
    dimensions: '6m × 0.8m',
    basePrice: 4000,
    billingPeriod: 'Month',
    isAvailable: true,
    description:
      'Stadium-style perimeter LED-quality board surrounding the full-size 7v7 pitch. Visible from grandstand seating (200 capacity).',
  },
  {
    id: 'adspace-004',
    name: 'Padel Arena 1 Back Wall Panel',
    location: 'Pro Padel Center Arena 1 – Back Wall',
    dimensions: '2m × 2m',
    basePrice: 3500,
    billingPeriod: 'Month',
    isAvailable: true,
    description:
      'Premium square panel on the panoramic glass back wall. Maximum dwell time — the most-photographed surface in the arena.',
  },
  {
    id: 'adspace-005',
    name: 'Padel Arena 1 Side Glass Panel',
    location: 'Pro Padel Center Arena 1 – Side Glass',
    dimensions: '1m × 1.5m',
    basePrice: 2000,
    billingPeriod: 'Month',
    isAvailable: true,
    description:
      'Vertical format panel on the side glass wall. Highly visible from the spectator viewing area along the court.',
  },
  {
    id: 'adspace-006',
    name: 'Tennis Grandstand Perimeter Banner',
    location: 'Grandstand Hard Court 1 – Perimeter Rail',
    dimensions: '4m × 0.8m',
    basePrice: 3000,
    billingPeriod: 'Month',
    isAvailable: true,
    description:
      'Court-perimeter banner seen by all 50 spectator seats and captured by the Hawk-Eye camera system on every recorded match.',
  },
  {
    id: 'adspace-007',
    name: 'Reception Digital Display',
    location: 'Club Reception – Main Entry Wall',
    dimensions: '75" Display (1.7m × 1m)',
    basePrice: 5500,
    billingPeriod: 'Month',
    isAvailable: true,
    description:
      'Digital display screen at the main club entry point. Every member and visitor passes this screen on entry and exit — highest daily impressions.',
  },
  {
    id: 'adspace-008',
    name: 'VIP Lounge Static Frame',
    location: 'VIP Lounge – Feature Wall',
    dimensions: '1.2m × 0.9m',
    basePrice: 1200,
    billingPeriod: 'Month',
    isAvailable: false, // NOT for sale — reserved for club use
    description:
      'Premium static frame in the VIP lounge. Currently reserved for internal club use and not commercially available.',
  },
];
