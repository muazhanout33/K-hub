/**
 * Sport-aware image resolution for courts and events.
 *
 * The filenames in /public/images/courts do NOT reliably describe their
 * contents — every asset below was opened and verified visually:
 *
 * | asset                  | actual content                          |
 * |------------------------|-----------------------------------------|
 * | padel.jpg              | padel racket flat-lay on blue turf      |
 * | padel-1.jpg            | orange clay tennis court aerial         |
 * | court-fallback.jpg     | same orange clay tennis court aerial    |
 * | football-5v5.jpg       | same orange clay tennis court aerial    |
 * | football-7v7.jpg       | orange football boots on turf           |
 * | gallery-football-2.jpg | identical to football-7v7.jpg           |
 * | gallery-padel-2.jpg    | football match (players, blue vs orange)|
 * | gallery-padel-3.jpg    | kids' football team huddle              |
 * | gallery-tennis-2.jpg   | gym dumbbell rack                       |
 * | tennis-clay.jpg        | blue hard court lifestyle shot          |
 * | tennis-hard-1.jpg      | green hard court, player in action      |
 *
 * This module is the single origin for mapping a sport (+ surface) to a
 * local asset that exists and actually depicts that sport. Unusable
 * sources — empty strings, the legacy generic fallback path, unknown
 * local paths such as /images/courts/placeholder.jpg, remote hosts that
 * next/image would reject — resolve to a sport-appropriate asset instead
 * of a broken <img> or the same clay aerial on every court.
 *
 * KNOWN ASSET GAPS (no suitable image exists in the repository):
 * - No padel court photo (padel.jpg is a product shot, not a court).
 * - No football pitch photo (football assets are match/boots/huddle).
 * - No dedicated club/facility photo (gallery-tennis-2.jpg is a gym).
 */

/** Generic court aerial — also the legacy FALLBACK_COURT_IMAGE value. */
export const GENERIC_COURT_IMAGE = '/images/courts/court-fallback.jpg';

/** Every image file that actually exists in /public/images/courts/. */
const LOCAL_COURT_ASSETS = new Set([
  '/images/courts/court-fallback.jpg',
  '/images/courts/football-5v5.jpg',
  '/images/courts/football-7v7.jpg',
  '/images/courts/gallery-football-2.jpg',
  '/images/courts/gallery-padel-2.jpg',
  '/images/courts/gallery-padel-3.jpg',
  '/images/courts/gallery-tennis-2.jpg',
  '/images/courts/padel-1.jpg',
  '/images/courts/padel.jpg',
  '/images/courts/tennis-clay.jpg',
  '/images/courts/tennis-hard-1.jpg',
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
 * Best available local asset for a sport (+ surface).
 * Used whenever the stored image source is missing or unusable.
 */
export function sportFallbackImage(
  sportType?: string | null,
  surface?: string | null,
): string {
  switch ((sportType ?? '').toLowerCase()) {
    case 'padel':
      // No padel court photo exists in the repo; the racket flat-lay is
      // the only padel-specific asset.
      return '/images/courts/padel.jpg';
    case 'football':
      // Boots on turf — football content. (The better football match photo,
      // gallery-padel-2.jpg, is reserved for the homepage hero.)
      return '/images/courts/football-7v7.jpg';
    case 'tennis':
      return (surface ?? '').toLowerCase().includes('clay')
        ? GENERIC_COURT_IMAGE // orange clay aerial — accurate for clay courts
        : '/images/courts/tennis-hard-1.jpg'; // green hard court action
    default:
      return GENERIC_COURT_IMAGE;
  }
}

/**
 * Resolve a court image to a renderable local path.
 * Passes through only local assets that exist in the repository; every
 * other source (empty, generic fallback, unknown/missing local path,
 * remote host) resolves to the sport-appropriate asset.
 */
export function resolveCourtImage(
  src: string | null | undefined,
  sportType?: string | null,
  surface?: string | null,
): string {
  if (src && src !== GENERIC_COURT_IMAGE && LOCAL_COURT_ASSETS.has(src)) {
    return src;
  }
  return sportFallbackImage(sportType, surface);
}

/**
 * Resolve an event image. Never returns an empty string, so <Image src>
 * is always valid (empty src previously caused runtime console errors).
 * Allowed remote images (Unsplash) pass through; everything else
 * resolves to the sport-appropriate local asset.
 */
export function resolveEventImage(
  src: string | null | undefined,
  sportType?: string | null,
): string {
  if (src) {
    if (LOCAL_COURT_ASSETS.has(src)) return src;
    if (isAllowedRemoteImage(src)) return src;
  }
  return sportFallbackImage(sportType);
}
