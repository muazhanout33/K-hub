'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  Crown,
  MapPin,
  PartyPopper,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { getCourtsFromSupabase } from '@/services/court.service';
import { getEvents } from '@/services/event.service';
import { CourtCard } from '@/features/courts/CourtCard';
import { LiveAvailabilitySection } from '@/features/availability/LiveAvailabilitySection';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Button } from '@/components/ui/button';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { SHARED_HERO_IMAGE, FACILITY_CLUBHOUSE_IMAGE } from '@/lib/sport-images';
import { MOCK_COURTS, MOCK_EVENTS } from '@/lib/mock-data';
import { Court, EventItem } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const selectCourt = useBookingStore((s) => s.selectCourt);
  // Initialize with verified mock data so the page renders immediately without layout shift
  const [courts, setCourts] = useState<Court[]>(() =>
    MOCK_COURTS.filter((c) => !c.name.startsWith('TEST_')),
  );
  const [events, setEvents] = useState<EventItem[]>(MOCK_EVENTS);
  const [eventsLoading, setEventsLoading] = useState(false);

  const fetchCourts = useCallback(async () => {
    try {
      const data = await getCourtsFromSupabase();
      if (data && data.length > 0) {
        // Exclude test courts from customer-facing display
        const publicCourts = data.filter((c) => !c.name.startsWith('TEST_'));
        setCourts(publicCourts);
      }
    } catch {
      // Silently keep baseline verified courts
    }
  }, []);

  useEffect(() => {
    fetchCourts();
    getEvents()
      .then((data) => {
        if (data && data.length > 0) setEvents(data);
      })
      .catch(() => {})
      .finally(() => setEventsLoading(false));
  }, [fetchCourts]);

  const goBook = (court?: Court) => {
    if (court) selectCourt(court);
    router.push('/book');
  };

  // Top courts for compact curated display (max 4)
  const topCourts = courts.slice(0, 4);
  const featuredCourt = topCourts[0] ?? courts[0];
  const compactCourts = topCourts.slice(1);

  return (
    <div className="space-y-10 sm:space-y-14">
      {/* ─────────────────────────────────────────────
          SECTION 1: HERO
          Requirement 4: Mobile & Desktop share the exact same underlying image asset (SHARED_HERO_IMAGE).
      ───────────────────────────────────────────── */}

      {/* Mobile hero (lg:hidden) */}
      <section className="lg:hidden relative h-[460px] min-h-[440px] max-h-[520px] w-full overflow-hidden">
        <Image
          src={SHARED_HERO_IMAGE}
          alt="WEGO Sports Arena"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/25" />

        <div className="absolute inset-x-0 bottom-0 p-6 pb-7">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-xs border border-white/15 text-[11px] font-bold text-green-300">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
            The Best Sports Experience
          </div>

          <h1 className="mt-3 text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-[1.08]">
            Book Your Game <span className="text-[#4ADE80]">in Seconds</span>
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-white/80 leading-relaxed max-w-xs">
            Real-time courts, instant holds, and a smooth checkout — right from your phone.
          </p>

          <div className="mt-4 flex flex-col items-stretch gap-2">
            <Button
              onClick={() => goBook(featuredCourt)}
              variant="primary"
              size="pill"
              className="w-full min-h-[44px]"
            >
              <span>Book Now</span>
              <ArrowRight className="w-[18px] h-[18px]" />
            </Button>
            <Button
              render={<Link href="/courts" />}
              nativeButton={false}
              variant="secondary"
              size="pill"
              className="w-full min-h-[44px]"
            >
              <span>Explore Courts</span>
              <ArrowRight className="w-[18px] h-[18px] text-gray-500" />
            </Button>
          </div>

          <div className="mt-4 pt-3.5 border-t border-white/15 grid grid-cols-3 gap-2 items-start">
            {[
              { icon: Zap, title: 'Instant Hold', sub: '10-Min Guarantee' },
              { icon: ShieldCheck, title: 'Secure Payment', sub: 'Encrypted Checkout' },
              { icon: Crown, title: 'Pro Standards', sub: 'WPT & FIFA Turf' },
            ].map((f) => (
              <div key={f.title} className="flex flex-col gap-1">
                <f.icon className="w-4 h-4 text-[#4ADE80]" />
                <div>
                  <p className="text-[11px] font-bold text-white leading-tight">{f.title}</p>
                  <p className="text-[10px] text-white/60 leading-tight mt-0.5">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Desktop hero (12-column layout sharing exact same SHARED_HERO_IMAGE) */}
      <div className="hidden lg:block">
        <SiteContainer as="section" className="pt-6 pb-2">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 items-center">
            {/* Left Column (7 Cols on LG) */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="lg:col-span-7 space-y-5"
            >
              {/* Top Pill Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#DCFCE7] text-[#15803D] dark:bg-[rgba(22,163,74,0.18)] dark:text-[#4ADE80] text-[12px] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                <span>The Best Sports Experience</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl xl:text-5xl font-black text-[#0F172A] dark:text-[#F5F7F5] tracking-tight leading-[1.05]">
                Book Your Game <span className="text-[#16A34A] dark:text-[#4ADE80]">in Seconds</span>
              </h1>

              {/* Subtitle Description */}
              <p className="text-muted text-base leading-relaxed max-w-xl font-normal">
                Find available courts, book your favorite time, and enjoy the game with your team.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => goBook(featuredCourt)}
                  variant="primary"
                  size="pill"
                  className="min-h-[44px]"
                >
                  <span>Book Now</span>
                  <ArrowRight className="w-[18px] h-[18px]" />
                </Button>
                <Button
                  render={<Link href="/courts" />}
                  nativeButton={false}
                  variant="secondary"
                  size="pill"
                  className="min-h-[44px]"
                >
                  <span>Explore Courts</span>
                  <ArrowRight className="w-[18px] h-[18px] text-gray-500" />
                </Button>
              </div>

              {/* Feature Highlights */}
              <div className="pt-5 mt-3 border-t border-gray-100 dark:border-[#344239] grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-gray-100 dark:bg-[#1D2821] flex items-center justify-center text-gray-700 dark:text-[#F5F7F5] shrink-0">
                    <Zap className="icon-btn" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#0F172A] dark:text-[#F5F7F5] leading-tight">Instant Hold</p>
                    <p className="text-[11px] text-muted leading-tight mt-0.5">10-Min Guarantee</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-gray-100 dark:bg-[#1D2821] flex items-center justify-center text-gray-700 dark:text-[#F5F7F5] shrink-0">
                    <ShieldCheck className="icon-btn" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#0F172A] dark:text-[#F5F7F5] leading-tight">Secure Payment</p>
                    <p className="text-[11px] text-muted leading-tight mt-0.5">Encrypted Checkout</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-gray-100 dark:bg-[#1D2821] flex items-center justify-center text-gray-700 dark:text-[#F5F7F5] shrink-0">
                    <Crown className="icon-btn" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#0F172A] dark:text-[#F5F7F5] leading-tight">Pro Standards</p>
                    <p className="text-[11px] text-muted leading-tight mt-0.5">WPT &amp; FIFA Turf</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right Column — Shared Hero Showcase Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="lg:col-span-5 relative"
            >
              <div className="relative aspect-[4/3] w-full rounded-[var(--radius-2xl)] overflow-hidden shadow-lg border border-[var(--border)] bg-gray-100 dark:bg-[#1D2821]">
                <Image
                  src={SHARED_HERO_IMAGE}
                  alt="WEGO Sports Arena"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent pointer-events-none" />
                <div className="absolute bottom-4 left-4 right-4 text-white pointer-events-none">
                  <span className="inline-block px-2.5 py-0.5 rounded-[var(--radius-xs)] bg-black/60 backdrop-blur-xs text-[10px] font-extrabold uppercase tracking-wider text-green-400 mb-1 border border-white/10">
                    Featured Arena
                  </span>
                  <h3 className="text-lg font-black text-white leading-tight">
                    {featuredCourt?.name || 'Pro Padel Center Arena 1'}
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5">
                    {featuredCourt?.sportType || 'Padel'} · {featuredCourt?.surface || 'Mondo Supercourt XN'} · Panoramic Glass
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </SiteContainer>
      </div>

      {/* ─────────────────────────────────────────────
          SECTION 2: OUR COURTS (Compact, Curated Selection)
          Mobile: 1 Featured Card + 3 Compact List Items.
          Desktop: Preserved 4-Card Grid.
      ───────────────────────────────────────────── */}
      <SiteContainer as="section">
        <div className="flex items-center justify-between mb-4 sm:mb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] dark:text-[#F5F7F5] tracking-tight">
              Our Courts
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-0.5">
              Tournament-ready padel, football, and tennis venues
            </p>
          </div>
          <Link
            href="/courts"
            className="px-3 sm:px-4 py-2 min-h-[44px] rounded-[var(--radius-xs)] border border-gray-200 dark:border-[#344239] text-xs font-bold text-gray-700 dark:text-[#F5F7F5] hover:bg-gray-50 dark:hover:bg-[#1D2821] flex items-center gap-1 transition-colors shrink-0"
          >
            <span>View All ({courts.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile: 1 featured card + 3 compact items */}
        <div className="lg:hidden space-y-4">
          {featuredCourt && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.3 }}
              className="relative rounded-[var(--radius-2xl)] overflow-hidden border border-[var(--border)] shadow-sm bg-gray-100 dark:bg-[#1D2821]"
            >
              <div className="relative aspect-[16/10] w-full">
                <Image
                  src={featuredCourt.image}
                  alt={featuredCourt.name}
                  fill
                  sizes="(max-width: 1024px) 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              </div>
              <div className="absolute bottom-0 inset-x-0 p-4">
                <span className="inline-block px-2.5 py-0.5 rounded-[var(--radius-xs)] bg-black/60 backdrop-blur-xs text-[10px] font-extrabold uppercase tracking-wider text-green-300 border border-white/10 mb-1.5">
                  Featured
                </span>
                <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                  {featuredCourt.name}
                </h3>
                <p className="text-xs text-white/75 mt-0.5">
                  {featuredCourt.sportType}
                  {featuredCourt.surface ? ` · ${featuredCourt.surface}` : ''}
                  {featuredCourt.pricePerHour ? ` · EGP ${featuredCourt.pricePerHour}/hr` : ''}
                </p>
                <Button
                  render={
                    <Link
                      href="/book"
                      onClick={() => selectCourt(featuredCourt)}
                      className="w-full mt-3 min-h-[44px]"
                    />
                  }
                  nativeButton={false}
                  variant="primary"
                  size="sm"
                  className="w-full mt-3 min-h-[44px]"
                >
                  <span>Reserve Court</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Compact list of next 3 courts — zero horizontal margin bleeding */}
          {compactCourts.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-[#344239] rounded-[var(--radius-xl)] border border-[var(--border)] bg-white dark:bg-[#151D18] overflow-hidden">
              {compactCourts.map((court) => (
                <li key={court.id}>
                  <Link
                    href="/book"
                    onClick={() => selectCourt(court)}
                    className="group flex items-center gap-3.5 p-3 hover:bg-gray-50 dark:hover:bg-[#1D2821] transition-colors"
                  >
                    <div className="relative w-16 h-16 rounded-[var(--radius-md)] overflow-hidden border border-gray-200 dark:border-[#344239] shrink-0 bg-gray-100 dark:bg-[#1D2821]">
                      <Image
                        src={court.image}
                        alt={court.name}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-[#F5F7F5] truncate">
                        {court.name}
                      </p>
                      <p className="text-xs text-muted mt-0.5 truncate">
                        {court.sportType}
                        {court.capacity ? ` · ${court.capacity} players` : ''}
                      </p>
                      <p className="text-xs font-extrabold text-green-700 dark:text-[#4ADE80] mt-0.5">
                        EGP {court.pricePerHour}/hr
                      </p>
                    </div>
                    <span
                      className="w-9 h-9 rounded-[var(--radius-sm)] border border-gray-200 dark:border-[#344239] flex items-center justify-center text-gray-400 group-hover:border-[var(--primary)] group-hover:text-green-700 dark:group-hover:text-[#4ADE80] transition-colors shrink-0"
                      aria-hidden="true"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Desktop: preserved 4-column grid */}
        <div className="hidden lg:grid lg:grid-cols-4 gap-5">
          {topCourts.map((court) => (
            <CourtCard key={court.id} court={court} />
          ))}
        </div>
      </SiteContainer>

      {/* ─────────────────────────────────────────────
          SECTION 3: LIVE AVAILABILITY
      ───────────────────────────────────────────── */}
      <SiteContainer>
        <LiveAvailabilitySection />
      </SiteContainer>

      {/* ─────────────────────────────────────────────
          SECTION 4: EVENTS & TOURNAMENTS
      ───────────────────────────────────────────── */}
      <SiteContainer as="section">
        {!eventsLoading && events.length === 0 ? (
          <div className="surface-card p-6 sm:p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 dark:bg-[#1D2821] flex items-center justify-center mb-3">
              <PartyPopper className="w-6 h-6 text-green-600 dark:text-[#4ADE80]" />
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-[#F5F7F5] tracking-tight">
              Seasonal Tournaments Launching Soon
            </h2>
            <p className="text-sm text-muted mt-1.5 max-w-md mx-auto leading-relaxed">
              We&apos;re preparing the next season of tournaments. Contact the club for inquiries or check back soon.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                render={<Link href="/contact" />}
                nativeButton={false}
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto min-h-[44px]"
              >
                <span>Ask About Tournaments</span>
              </Button>
              <Button
                render={<Link href="/events" />}
                nativeButton={false}
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto min-h-[44px]"
              >
                <span>View Events Page</span>
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          !eventsLoading && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] dark:text-[#F5F7F5] tracking-tight">
                    Tournaments &amp; Events
                  </h2>
                  <p className="text-xs sm:text-sm text-muted mt-0.5">
                    Competitive leagues, weekend tournaments, and open clinics
                  </p>
                </div>
                {events.length > 1 && (
                  <Link
                    href="/events"
                    className="px-3 py-2 min-h-[44px] rounded-[var(--radius-xs)] border border-gray-200 dark:border-[#344239] text-xs font-bold text-gray-700 dark:text-[#F5F7F5] hover:bg-gray-50 dark:hover:bg-[#1D2821] flex items-center gap-1 transition-colors shrink-0"
                  >
                    <span>All Events</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>

              {/* Featured event */}
              {events[0] && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0 rounded-[var(--radius-2xl)] overflow-hidden border border-[var(--border)]">
                  <div className="relative aspect-[16/9] md:aspect-auto md:min-h-[260px] bg-gray-100 dark:bg-[#1D2821]">
                    <Image
                      src={events[0].image}
                      alt={events[0].title}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="p-5 sm:p-7 bg-white dark:bg-[#1D2821] flex flex-col justify-center">
                    <span className="w-fit inline-flex items-center gap-2 px-3 py-1 rounded-[var(--radius-pill)] bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/60 dark:border-green-800 dark:text-green-400 text-[11px] font-bold uppercase tracking-wider mb-2.5">
                      Upcoming
                    </span>
                    <h3 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-[#F5F7F5] tracking-tight leading-snug">
                      {events[0].title}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted mt-1.5 leading-relaxed line-clamp-2">
                      {events[0].description}
                    </p>
                    <div className="mt-3 space-y-1 text-xs sm:text-sm font-semibold text-gray-700 dark:text-[#A1ADA4]">
                      <p>{formatEventDate(events[0].date)} · {events[0].time}</p>
                      {events[0].maxParticipants > 0 && (
                        <p className="inline-flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          {events[0].currentParticipants}/{events[0].maxParticipants} players registered
                        </p>
                      )}
                    </div>
                    <Button
                      render={<Link href="/events" />}
                      nativeButton={false}
                      variant="primary"
                      size="sm"
                      className="mt-4 w-full sm:w-auto min-h-[44px]"
                    >
                      <span>View Details</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Remaining events — compact list */}
              {events.length > 1 && (
                <ul className="mt-3.5 divide-y divide-gray-100 dark:divide-[#344239] rounded-[var(--radius-xl)] border border-[var(--border)] bg-white dark:bg-[#151D18] overflow-hidden">
                  {events.slice(1, 4).map((event) => (
                    <li key={event.id}>
                      <Link
                        href="/events"
                        className="group flex items-center gap-3.5 p-3 hover:bg-gray-50 dark:hover:bg-[#1D2821] transition-colors"
                      >
                        <div className="relative w-14 h-14 rounded-[var(--radius-md)] overflow-hidden border border-gray-200 dark:border-[#344239] shrink-0 bg-gray-100 dark:bg-[#1D2821]">
                          <Image
                            src={event.image}
                            alt={event.title}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-[#F5F7F5] truncate">
                            {event.title}
                          </p>
                          <p className="text-xs text-muted mt-0.5 truncate">
                            {formatEventDate(event.date)}
                            {event.maxParticipants > 0 && ` · ${event.currentParticipants}/${event.maxParticipants} registered`}
                          </p>
                        </div>
                        <ArrowUpRight className="w-4 h-4 shrink-0 text-gray-400 group-hover:text-green-600 dark:group-hover:text-[#4ADE80] transition-colors" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        )}
      </SiteContainer>

      {/* ─────────────────────────────────────────────
          SECTION 5: MEMBERSHIP PREVIEW
      ───────────────────────────────────────────── */}
      <SiteContainer as="section">
        <div className="rounded-[var(--radius-2xl)] border border-green-200 dark:border-green-800/60 bg-green-50 dark:bg-green-950/30 p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-green-600 dark:bg-[#16A34A] flex items-center justify-center text-white dark:text-[#101512] shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-[#F5F7F5] tracking-tight">
              Club Memberships Launching Soon
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-0.5 leading-relaxed">
              The WEGO membership program is on the way. Register your interest to be notified when it opens.
            </p>
          </div>
          <Button
            render={<Link href="/membership" />}
            nativeButton={false}
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto shrink-0 min-h-[44px]"
          >
            <span>Learn More</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </SiteContainer>

      {/* ─────────────────────────────────────────────
          SECTION 6: FACILITY SHOWCASE
          Verified modern sports clubhouse lounge replacing the old gym dumbbell photo.
      ───────────────────────────────────────────── */}
      <SiteContainer as="section">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10 items-stretch">
          <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[300px] rounded-[var(--radius-2xl)] overflow-hidden border border-[var(--border)] bg-gray-100 dark:bg-[#1D2821]">
            <Image
              src={FACILITY_CLUBHOUSE_IMAGE}
              alt="Modern sports clubhouse and player lounge at WEGO Sports Club"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[var(--radius-pill)] bg-gray-100 dark:bg-[#1D2821] text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-[#A1ADA4] w-fit">
              <MapPin className="w-3.5 h-3.5" />
              Shebin El-Kom, Monufia
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-[#F5F7F5] tracking-tight mt-2.5">
              A Club Built to Tournament Standards
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-2 leading-relaxed max-w-lg">
              Padel, football, and tennis venues engineered for competition — with the player experience handled off the court, from arrival to cool-down in our player clubhouse lounge.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              {[
                'Mondo Supercourt XN Turf',
                'FIFA Certified Turf',
                'High-Lux LED Floodlights',
                'Player Lounge',
                'Pro Shop',
                'Locker Rooms',
              ].map((amenity) => (
                <span
                  key={amenity}
                  className="px-2.5 py-1 rounded-[var(--radius-pill)] border border-gray-200 dark:border-[#344239] bg-white dark:bg-[#171F1A] text-[11px] font-bold text-gray-700 dark:text-[#A1ADA4]"
                >
                  {amenity}
                </span>
              ))}
            </div>
            <div className="mt-4">
              <Button
                render={<Link href="/about" />}
                nativeButton={false}
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto min-h-[44px]"
              >
                <span>More About WEGO</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </SiteContainer>
    </div>
  );
}

/** Formats YYYY-MM-DD for display using UTC to remain timezone-stable. */
function formatEventDate(date: string): string {
  try {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return date;
  }
}
