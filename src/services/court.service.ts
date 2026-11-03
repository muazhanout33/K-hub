import { Court } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { mapDbCourtToCourt } from '@/lib/mappers';
import { resolveSpecificCourtImage, GENERIC_COURT_IMAGE } from '@/lib/sport-images';
import { DbCourt } from '@/types/database.types';

/** Minimal court info needed to populate a Booking's display fields. */
export interface CourtInfo {
  name: string;
  image: string;
  sportType: Court['sportType'];
}

/** Last-resort court image when no sport is known. */
export const FALLBACK_COURT_IMAGE = GENERIC_COURT_IMAGE;

/**
 * Normalize a court image source to a renderable local path.
 * Guarantees that every court has an accurate, distinct, high-quality image.
 */
function normalizeCourtImage(
  src: string | null | undefined,
  courtOrSport?: Court | { id?: string; name?: string | null; sportType?: string | null; surface?: string | null; isIndoor?: boolean | null } | string | null,
  surface?: string | null,
): string {
  if (typeof courtOrSport === 'object' && courtOrSport !== null) {
    return resolveSpecificCourtImage(src, courtOrSport);
  }
  return resolveSpecificCourtImage(src, {
    sportType: typeof courtOrSport === 'string' ? courtOrSport : undefined,
    surface,
  });
}

/**
 * Async fetch all courts from Supabase public.courts table.
 * Filters out deleted courts (deleted_at IS NULL).
 */
export async function getCourtsFromSupabase(sportType?: string): Promise<Court[]> {
  try {
    const supabase = createClient();
    // sport_type is a Postgres enum, and enums have no ILIKE operator
    // (`operator does not exist: sport_type_enum ~~* unknown`), so filtering in
    // the query made /api/courts?sport=X return 500. Fetch every non-deleted
    // court and filter in JS instead, keeping the previous bare-value ILIKE
    // semantics: whole-value, case-insensitive match (invalid input therefore
    // matches nothing and returns an empty list rather than erroring).
    const query = supabase
      .from('courts')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch courts: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    const needle = sportType ? sportType.toLowerCase() : null;

    return (data as DbCourt[])
      .map((c) => {
        const court = mapDbCourtToCourt(c);
        return {
          ...court,
          image: normalizeCourtImage(court.image, court),
        };
      })
      .filter((court) => !needle || court.sportType.toLowerCase() === needle);
  } catch (err) {
    throw err;
  }
}

/**
 * Async fetch a single court by ID from Supabase.
 */
export async function getCourtByIdFromSupabase(id: string): Promise<Court | undefined> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('courts')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch court ${id}: ${error.message}`);
    }

    if (!data) {
      return undefined;
    }

    const court = mapDbCourtToCourt(data as DbCourt);
    return {
      ...court,
      image: normalizeCourtImage(court.image, court),
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Fetch minimal court info (name, image, sportType) for a single court.
 * Throws if the court is not found or the query fails.
 */
export async function getCourtInfoForBooking(courtId: string): Promise<CourtInfo> {
  const court = await getCourtByIdFromSupabase(courtId);
  if (!court) {
    throw new Error(`Court ${courtId} not found`);
  }
  return {
    name: court.name,
    image: normalizeCourtImage(court.image, court.sportType, court.surface),
    sportType: court.sportType,
  };
}

/**
 * Batch-fetch court info for an array of court IDs.
 * Returns a Map<courtId, CourtInfo> for O(1) lookups.
 * Deduplicates court IDs to avoid redundant queries.
 */
export async function getCourtInfoMap(courtIds: string[]): Promise<Map<string, CourtInfo>> {
  const uniqueIds = [...new Set(courtIds.filter(Boolean))];
  const map = new Map<string, CourtInfo>();

  if (uniqueIds.length === 0) return map;

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('courts')
      .select('id, name, image_url, sport_type, surface')
      .in('id', uniqueIds)
      .is('deleted_at', null);

    if (!error && data) {
      for (const row of data as {
        id: string;
        name: string;
        image_url: string;
        sport_type: string;
        surface: string;
      }[]) {
        map.set(row.id, {
          name: row.name,
          image: normalizeCourtImage(row.image_url, row.sport_type, row.surface),
          sportType: (row.sport_type as Court['sportType']) ?? 'Padel',
        });
      }
    }
  } catch {
    // If query fails, the map will be missing IDs — callers must handle.
  }

  return map;
}
