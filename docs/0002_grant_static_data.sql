-- Fix: Grant service_role full access to static data tables.
-- Run this in the Supabase SQL Editor if seed script fails with "permission denied".

-- Events
GRANT ALL ON public.events TO service_role;

-- FAQs
GRANT ALL ON public.faqs TO service_role;

-- Testimonials
GRANT ALL ON public.testimonials TO service_role;

-- Also ensure authenticated users can read (RLS handles this, but GRANTs are the first layer)
GRANT SELECT ON public.events TO authenticated;
GRANT SELECT ON public.faqs TO authenticated;
GRANT SELECT ON public.testimonials TO authenticated;
