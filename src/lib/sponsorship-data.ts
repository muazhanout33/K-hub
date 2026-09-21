/**
 * Sponsorship Feature Constants
 *
 * These constants are owned by the Sponsorship feature.
 * They are NOT a FacilityArea domain/service/store — they are a simple,
 * easily-editable list for target validation at request-creation time.
 * Do NOT build CRUD, a service, or a store around these.
 */

/** Single constant representing club-wide sponsorship. */
export const CLUB_TARGET_ID = 'khub-club';

/**
 * Fixed list of facility areas available as sponsorship targets.
 * Edit this list freely — it is not authoritative data about the club,
 * only a set of named locations that companies can choose to sponsor.
 */
export const FACILITY_AREAS: string[] = [
  'Reception',
  'Lounge Area',
  'Entrance',
  'Parking',
  'Outdoor Courts Area',
];

/**
 * Human-readable labels for sponsorship pricing types.
 * Used in form dropdowns and display cards.
 */
export const PRICING_TYPE_LABELS: Record<string, string> = {
  OneTime: 'One-Time',
  PerMonth: 'Per Month',
  PerSeason: 'Per Season',
};

/**
 * Suggested placement options for the sponsorship request form.
 * Stored as-is on the request for future Owner Dashboard use.
 */
export const PLACEMENT_OPTIONS: string[] = [
  'Website',
  'On-site Signage',
  'Court Branding',
  'Reception',
  'Outdoor Area',
  'Social Media',
  'Event Banners',
];
