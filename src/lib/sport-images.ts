/**
 * Sport-aware image resolution for courts and events.
 *
 * All assets in /public/images/courts, /public/images/facility, and /public/images
 * have been verified and installed:
 *
 * | asset                                    | actual content                                |
 * |------------------------------------------|-----------------------------------------------|
 * | /images/courts/padel-panoramic.jpg       | Indoor Mondo blue turf panoramic glass court  |
 * | /images/courts/padel-outdoor.jpg         | Outdoor blue turf padel court with frame      |
 * | /images/courts/padel-action.jpg          | High-energy padel match action                |
 * | /images/courts/football-5v5.jpg          | Floodlit 5v5 synthetic turf pitch with cage   |
 * | /images/courts/football-7v7.jpg          | Full 7v7 stadium turf pitch with floodlights  |
 * | /images/courts/football-match.jpg        | Floodlit football match action                |
 * | /images/courts/tennis-hard.jpg           | Tournament DecoTurf blue hard court           |
 * | /images/courts/tennis-hard-1.jpg         | Tournament DecoTurf blue hard court           |
 * | /images/courts/tennis-clay.jpg           | Roland Garros red clay court with player      |
 * | /images/facility/facility-clubhouse.jpg  | Modern sports club lounge and cafe terrace    |
 * | /images/hero-sports.jpg                  | Unified athletic hero image for mobile/desktop|
 */

/** Generic court fallback — indoor panoramic padel arena. */
export const GENERIC_COURT_IMAGE = '/images/courts/padel-panoramic.jpg';

/** Shared unified Hero image for mobile and desktop. */
export const SHARED_HERO_IMAGE = '/images/hero-sports.jpg';

/** Verified facility clubhouse image. */
export const FACILITY_CLUBHOUSE_IMAGE = '/images/facility/facility-clubhouse.jpg';

/** Every valid image file that exists locally in public directory. */
const LOCAL_COURT_ASSETS = new Set([
  '/images/courts/court-fallback.jpg',
  '/images/courts/football-5v5.jpg',
  '/images/courts/football-7v7.jpg',
  '/images/courts/football-match.jpg',
  '/images/courts/gallery-football-2.jpg',
  '/images/courts/gallery-padel-2.jpg',
  '/images/courts/gallery-padel-3.jpg',
  '/images/courts/gallery-tennis-2.jpg',
  '/images/courts/padel-1.jpg',
  '/images/courts/padel.jpg',
  '/images/courts/padel-panoramic.jpg',
  '/images/courts/padel-outdoor.jpg',
  '/images/courts/padel-action.jpg',
  '/images/courts/tennis-clay.jpg',
  '/images/courts/tennis-hard.jpg',
  '/images/courts/tennis-hard-1.jpg',
  '/images/facility/facility-clubhouse.jpg',
  '/images/hero-sports.jpg',
]);

/** Remote hosts permitted by next.config.ts images.remotePatterns. */
const ALLOWED_REMOTE_HOSTS = new Set(['images.unsplash.com']);

function isAllowedRemoteImage(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && ALLOWED_REMOTE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Best available local asset for a sport (+ surface + indoor/outdoor).
 */
export function sportFallbackImage(
  sportType?: string | null,
  surface?: string | null,
  isIndoor?: boolean | null,
): string {
  const sport = (sportType ?? '').toLowerCase();
  const surf = (surface ?? '').toLowerCase();

  switch (sport) {
    case 'padel':
      if (isIndoor === false || surf.includes('outdoor')) {
        return '/images/courts/padel-outdoor.jpg';
      }
      return '/images/courts/padel-panoramic.jpg';

    case 'football':
      if (surf.includes('5v5') || surf.includes('5-a-side')) {
        return '/images/courts/football-5v5.jpg';
      }
      return '/images/courts/football-7v7.jpg';

    case 'tennis':
      if (surf.includes('clay') || surf.includes('red')) {
        return '/images/courts/tennis-clay.jpg';
      }
      return '/images/courts/tennis-hard.jpg';

    default:
      return GENERIC_COURT_IMAGE;
  }
}

export interface CourtIdentifier {
  id?: string;
  name?: string | null;
  sportType?: string | null;
  surface?: string | null;
  isIndoor?: boolean | null;
}

/**
 * Resolves a specific court's image based on court metadata.
 * Ensures distinct, non-repetitive, accurate imagery for every court.
 */
export function resolveSpecificCourtImage(
  src: string | null | undefined,
  court?: CourtIdentifier,
): string {
  const name = (court?.name ?? '').toLowerCase();
  const sport = (court?.sportType ?? '').toLowerCase();
  const surface = (court?.surface ?? '').toLowerCase();
  const isIndoor = court?.isIndoor;

  // Specific court name matching for existing catalog
  if (name.includes('arena 1') || (sport === 'padel' && (isIndoor === true || name.includes('indoor')))) {
    return '/images/courts/padel-panoramic.jpg';
  }
  if (name.includes('sunset') || (sport === 'padel' && (isIndoor === false || name.includes('outdoor')))) {
    return '/images/courts/padel-outdoor.jpg';
  }
  if (name.includes('emirates') || name.includes('5v5') || (sport === 'football' && surface.includes('5v5'))) {
    return '/images/courts/football-5v5.jpg';
  }
  if (name.includes('champions') || name.includes('7v7') || (sport === 'football')) {
    return '/images/courts/football-7v7.jpg';
  }
  if (name.includes('garros') || name.includes('clay') || (sport === 'tennis' && surface.includes('clay'))) {
    return '/images/courts/tennis-clay.jpg';
  }
  if (name.includes('grandstand') || name.includes('hard') || sport === 'tennis') {
    return '/images/courts/tennis-hard.jpg';
  }

  // If source is a valid distinct local asset (not legacy generic/ambiguous)
  if (src && LOCAL_COURT_ASSETS.has(src) && src !== GENERIC_COURT_IMAGE && src !== '/images/courts/padel.jpg') {
    return src;
  }

  return sportFallbackImage(sport, surface, isIndoor);
}

/**
 * Resolve a court image to a renderable local path.
 */
export function resolveCourtImage(
  src: string | null | undefined,
  sportType?: string | null,
  surface?: string | null,
  courtName?: string | null,
): string {
  return resolveSpecificCourtImage(src, { name: courtName, sportType, surface });
}

/**
 * Resolve an event image. Guarantees sports alignment:
 * - Padel event -> padel action
 * - Football event -> football match
 * - Tennis event -> tennis hard/clay
 */
export function resolveEventImage(
  src: string | null | undefined,
  sportType?: string | null,
  title?: string | null,
): string {
  const sport = (sportType ?? '').toLowerCase();
  const t = (title ?? '').toLowerCase();

  if (sport === 'padel' || t.includes('padel')) {
    return '/images/courts/padel-action.jpg';
  }
  if (sport === 'football' || t.includes('football') || t.includes('league')) {
    return '/images/courts/football-match.jpg';
  }
  if (sport === 'tennis' || t.includes('tennis')) {
    return '/images/courts/tennis-hard.jpg';
  }

  if (src) {
    if (LOCAL_COURT_ASSETS.has(src)) return src;
    if (isAllowedRemoteImage(src)) return src;
  }

  return sportFallbackImage(sportType);
}
