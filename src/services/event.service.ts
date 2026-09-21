import { EventItem } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { mapDbEventToEvent } from '@/lib/mappers';
import { DbEvent } from '@/types/database.types';

export async function getEvents(): Promise<EventItem[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true });

    if (error || !data) return [];

    return (data as DbEvent[]).map(mapDbEventToEvent);
  } catch {
    return [];
  }
}
