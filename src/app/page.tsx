'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Crown,
  Calendar,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { getCourtsFromSupabase } from '@/services/court.service';
import { CourtCard } from '@/features/courts/CourtCard';
import { LiveAvailabilitySection } from '@/features/availability/LiveAvailabilitySection';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Button } from '@/components/ui/button';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { Court } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const selectCourt = useBookingStore((s) => s.selectCourt);
  const [courts, setCourts] = useState<Court[]>([]);

  const fetchCourts = useCallback(async () => {
    try {
      const data = await getCourtsFromSupabase();
      setCourts(data);
    } catch {
      // Silently fail — homepage shows static content regardless
    }
  }, []);

  useEffect(() => {
    fetchCourts();
  }, [fetchCourts]);

  const handleBookNow = () => {
    if (courts.length > 0) {
      selectCourt(courts[0]);
    }
    router.push('/book');
  };
  return (
    <div className="space-y-12 sm:space-y-16">
      {/* ─────────────────────────────────────────────
          SECTION 1: HERO SECTION (Reference Exact Match)
      ───────────────────────────────────────────── */}
      <SiteContainer as="section" className="pt-6 sm:pt-10 pb-4 sm:pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 items-center">
          
          {/* Left Column (7 Cols on LG) */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-7 space-y-6"
          >
            {/* Top Pill Badge */}
            <div className="inline-flex items-center gap-2 px-4 sm:px-6 py-1.5 sm:py-2 rounded-full bg-[#DCFCE7] text-[#15803D] text-[11px] sm:text-[12px] font-bold">
              <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
              <span>The Best Sports Experience</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-[28px] sm:text-5xl xl:text-[56px] font-black text-[#0F172A] tracking-tight leading-[1.1] sm:leading-[1.04]">
              Book Your Game <span className="text-[#16A34A]">in Seconds</span>
            </h1>

            {/* Subtitle Description */}
            <p className="text-muted text-[15px] sm:text-lg leading-relaxed max-w-xl font-normal">
              Find available courts, book your favorite time, and enjoy the game with your team.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleBookNow}
                variant="primary"
                size="pill"
              >
                <span>Book Now</span>
                <ArrowRight className="w-[18px] h-[18px]" />
             </Button>
              <Button
                render={<Link href="/courts" />}
                nativeButton={false}
                variant="secondary"
                size="pill"
              >
                <span>Explore Courts</span>
                <ArrowRight className="w-[18px] h-[18px] text-gray-500" />
             </Button>
           </div>

            {/* Feature Highlights */}
            <div className="pt-4 sm:pt-6 mt-2 sm:mt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {/* Feature 1 */}
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
                  <Zap className="icon-btn" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-[#0F172A] leading-tight">Easy Booking</p>
                  <p className="text-[11px] text-muted leading-tight mt-0.5">Anytime</p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
                  <ShieldCheck className="icon-btn" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-[#0F172A] leading-tight">Secure Payment</p>
                  <p className="text-[11px] text-muted leading-tight mt-0.5">100% Safe</p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
                  <Crown className="icon-btn" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-[#0F172A] leading-tight">Best Facilities</p>
                  <p className="text-[11px] text-muted leading-tight mt-0.5">Premium Quality</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column — Large Premium Court Image + Overlay Badge (5 Cols on LG) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-5 relative"
          >
            {/* Court Image Container */}
            <div className="relative aspect-[3/2] w-full rounded-[var(--radius-2xl)] overflow-hidden shadow-[0_12px_36px_rgba(15,23,42,0.12)] border border-[#E2E8F0]">
              {courts.length > 0 && (
                <Image
                  src={courts[0].image}
                  alt="K-HUB Outdoor Court"
                  fill
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover"
                />
              )}
              {/* Primary Left-to-Right Fade Overlay using design token background color */}
              <div
                className="absolute inset-y-0 left-0 w-3/4 sm:w-2/3 pointer-events-none z-10 bg-gradient-to-r from-[var(--background)] via-[var(--background)]/60 to-transparent"
                aria-hidden="true"
              />
              {/* Secondary Top-to-Bottom Fade Overlay using design token background color */}
              <div
                className="absolute top-0 inset-x-0 h-2/5 pointer-events-none z-10 bg-gradient-to-b from-[var(--background)] via-[var(--background)]/35 to-transparent"
                aria-hidden="true"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none z-10" />
            </div>

            {/* Floating Information Badge */}
            <div className="absolute bottom-4 sm:bottom-5 right-4 sm:right-5 z-20 max-w-[calc(100%-2rem)] sm:max-w-[calc(100%-2.5rem)]">
              <div className="bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 ring-1 ring-black/[0.04] p-3 sm:p-5 rounded-[var(--radius-xl)] shadow-[0_18px_40px_-8px_rgba(15,23,42,0.22)] flex items-center gap-3 sm:gap-4 min-w-0 sm:min-w-[260px]">
                <div className="flex-1 min-w-0">
                  <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full bg-[#15803D] text-white text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider mb-1 sm:mb-1.5 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    Next Available
              </span>
                  <h4 className="font-extrabold text-[13px] sm:text-[15px] text-[#0F172A] leading-tight">Padel Court 1</h4>
                  <p className="text-[11px] sm:text-[12px] text-[#475569] font-semibold mt-0.5">Today, 6:00 PM</p>
            </div>
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-[var(--radius-sm)] bg-[#16A34A] text-white flex items-center justify-center shrink-0 shadow-md shadow-green-600/30">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
        </div>
         </motion.div>

       </div>
     </SiteContainer>

      {/* ─────────────────────────────────────────────
          SECTION 2: FEATURED COURTS (4 Column Grid)
      ───────────────────────────────────────────── */}
      <SiteContainer as="section">
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">Our Courts</h2>
         </div>
          <Link href="/courts" className="px-3 sm:px-4 py-2 min-h-[44px] rounded-[var(--radius-xs)] border border-gray-200 text-[11px] sm:text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-1 transition-colors shrink-0">
            <span>View All</span>
         </Link>
       </div>

        <div className="-mx-6 px-6 lg:mx-0 lg:px-0">
          <div className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
            {courts.slice(0, 4).map((court) => (
              <div key={court.id} className="min-w-[260px] max-w-[320px] shrink-0 snap-start lg:min-w-0 lg:max-w-none lg:shrink lg:w-auto lg:snap-align-none">
                <CourtCard court={court} />
              </div>
            ))}
          </div>
        </div>
     </SiteContainer>

      {/* ─────────────────────────────────────────────
          SECTION 3: LIVE AVAILABILITY
      ───────────────────────────────────────────── */}
      <SiteContainer>
        <LiveAvailabilitySection />
      </SiteContainer>
    </div>
  );
}
