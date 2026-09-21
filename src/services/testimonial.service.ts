import { Testimonial } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { mapDbTestimonialToTestimonial } from '@/lib/mappers';
import { DbTestimonial } from '@/types/database.types';

export async function getTestimonials(): Promise<Testimonial[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('testimonials')
      .select('*');

    if (error || !data) return [];

    return (data as DbTestimonial[]).map(mapDbTestimonialToTestimonial);
  } catch {
    return [];
  }
}
