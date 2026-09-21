import { Court } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { mapDbCourtToCourt } from '@/lib/mappers';
import { DbCourt } from '@/types/database.types';

/** Minimal court info needed to populate a Booking's display fields. */
export interface CourtInfo {
  name: string;
  image: string;
  sportType: Court['sportType'];
}

/** Fallback court image used when a court has no image_url in the database. */
export const FALLBACK_COURT_IMAGE = '/images/courts/court-fallback.jpg';

/**
 * Normalize a court image source to a stable local path.
 * Local /images/ paths pass through; missing or remote (e.g. external)
 * sources fall back to the local fallback asset so next/image never 400s.
 */
function normalizeCourtImage(src: string | null | undefined): string {
  return src && src.startsWith('/images/') ? src : FALLBACK_COURT_IMAGE;
}

/**
 * Async fetch all courts from Supabase public.courts table.
 * Filters out deleted courts (deleted_at IS NULL).
 */
export async function getCourtsFromSupabase(sportType?: string): Promise<Court[]> {
  try {
    const supabase = createClient();
    let query = supabase
      .from('courts')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (sportType) {
      query = query.ilike('sport_type', sportType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch courts: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    return (data as DbCourt[]).map((c) => {
      const court = mapDbCourtToCourt(c);
      return { ...court, image: normalizeCourtImage(court.image) };
    });
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
    return { ...court, image: normalizeCourtImage(court.image) };
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
    image: normalizeCourtImage(court.image),
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
      .select('id, name, image_url, sport_type')
      .in('id', uniqueIds)
      .is('deleted_at', null);

    if (!error && data) {
      for (const row of data as { id: string; name: string; image_url: string; sport_type: string }[]) {
        map.set(row.id, {
          name: row.name,
          image: normalizeCourtImage(row.image_url),
          sportType: (row.sport_type as Court['sportType']) ?? 'Padel',
        });
      }
    }
  } catch {
    // If query fails, the map will be missing IDs — callers must handle.
  }

  return map;
}
