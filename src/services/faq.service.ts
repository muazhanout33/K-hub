import { FAQItem } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { mapDbFaqToFaq } from '@/lib/mappers';
import { DbFAQ } from '@/types/database.types';

export async function getFaqs(): Promise<FAQItem[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('faqs')
      .select('*')
      .order('display_order', { ascending: true });

    if (error || !data) return [];

    return (data as DbFAQ[]).map(mapDbFaqToFaq);
  } catch {
    return [];
  }
}
