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
import { Court, EventItem } from '@/types';

/** Full-bleed athletic hero image for mobile — verified football match
 *  photo; distinct from every court's primary image. */
const MOBILE_HERO_IMAGE = '/images/courts/gallery-padel-2.jpg';

/** Facility showcase image — verified gym/fitness area photo (the only
 *  facility-interior asset in the repo; no club-house photo exists). */
const FACILITY_IMAGE = '/images/courts/gallery-tennis-2.jpg';

export default function HomePage() {
  const router = useRouter();
  const selectCourt = useBookingStore((s) => s.selectCourt);
  const [courts, setCourts] = useState<Court[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

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
    getEvents()
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [fetchCourts]);

  const goBook = (court?: Court) => {
    if (court) selectCourt(court);
    router.push('/book');
  };
  return (
    <div className="space-y-12 sm:space-y-16">
      {/* ─────────────────────────────────────────────
          SECTION 1: HERO
          Mobile: full-image athletic hero. Desktop: preserved 12-column layout.
      ───────────────────────────────────────────── */}

      {/* Mobile hero (lg:hidden) */}
      <section className="lg:hidden relative h-[480px] min-h-[460px] max-h-[560px] w-full overflow-hidden">
        <Image
          src={MOBILE_HERO_IMAGE}
          alt="Players competing in a football match"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/25" />

        <div className="absolute inset-x-0 bottom-0 p-6 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-xs border border-white/15 text-[11px] font-bold text-green-300">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
            The Best Sports Experience
          </div>

          <h1 className="mt-3 text-[30px] font-black text-white tracking-tight leading-[1.08]">
            Book Your Game <span className="text-[#4ADE80]">in Seconds</span>
          </h1>
          <p className="mt-2 text-sm text-white/80 leading-relaxed max-w-xs">
            Real-time courts, instant holds, and a smooth checkout — right from your phone.
          </p>

          <div className="mt-5 flex flex-col items-stretch gap-2.5">
            <Button
              onClick={() => goBook(courts.length > 0 ? courts[0] : undefined)}
              variant="primary"
              size="pill"
              className="w-full"
            >
              <span>Book Now</span>
              <ArrowRight className="w-[18px] h-[18px]" />
            </Button>
            <Button
              render={<Link href="/courts" />}
              nativeButton={false}
              variant="secondary"
              size="pill"
              className="w-full"
            >
              <span>Explore Courts</span>
              <ArrowRight className="w-[18px] h-[18px] text-gray-500" />
            </Button>
          </div>

          <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-3 gap-2 items-start">
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

      {/* Desktop hero (preserved 12-column layout) */}
      <div className="hidden lg:block">
        <SiteContainer as="section" className="pt-6 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 items-center">
            {/* Left Column (7 Cols on LG) */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="lg:col-span-7 space-y-6"
            >
              {/* Top Pill Badge */}
              <div className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 rounded-full bg-[#DCFCE7] text-[#15803D] dark:bg-[rgba(22,163,74,0.18)] dark:text-[#4ADE80] text-[12px] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                <span>The Best Sports Experience</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-5xl xl:text-[56px] font-black text-[#0F172A] dark:text-[#F5F7F5] tracking-tight leading-[1.04]">
                Book Your Game <span className="text-[#16A34A] dark:text-[#4ADE80]">in Seconds</span>
              </h1>

              {/* Subtitle Description */}
              <p className="text-muted text-lg leading-relaxed max-w-xl font-normal">
                Find available courts, book your favorite time, and enjoy the game with your team.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => goBook(courts.length > 0 ? courts[0] : undefined)}
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
              <div className="pt-6 mt-4 border-t border-gray-100 dark:border-[#344239] grid grid-cols-3 gap-4">
                {/* Feature 1 */}
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-gray-100 dark:bg-[#1D2821] flex items-center justify-center text-gray-700 dark:text-[#F5F7F5] shrink-0">
                    <Zap className="icon-btn" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#0F172A] dark:text-[#F5F7F5] leading-tight">Instant Hold</p>
                    <p className="text-[11px] text-muted leading-tight mt-0.5">10-Min Guarantee</p>
                  </div>
                </div>

                {/* Feature 2 */}
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-gray-100 dark:bg-[#1D2821] flex items-center justify-center text-gray-700 dark:text-[#F5F7F5] shrink-0">
                    <ShieldCheck className="icon-btn" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#0F172A] dark:text-[#F5F7F5] leading-tight">Secure Payment</p>
                    <p className="text-[11px] text-muted leading-tight mt-0.5">Encrypted Checkout</p>
                  </div>
                </div>

                {/* Feature 3 */}
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

            {/* Right Column — Premium Court Showcase */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="lg:col-span-5 relative"
            >
              <div className="relative aspect-[3/2] w-full rounded-[var(--radius-2xl)] overflow-hidden shadow-lg border border-[var(--border)] bg-gray-100 dark:bg-[#1D2821]">
                {courts.length > 0 && (
                  <Image
                    src={courts[0].image}
                    alt={courts[0].name || 'WEGO Court'}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    className="object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent pointer-events-none" />
                {courts.length > 0 && (
                  <div className="absolute bottom-4 left-4 right-4 text-white pointer-events-none">
                    <span className="inline-block px-2.5 py-0.5 rounded-[var(--radius-xs)] bg-black/60 backdrop-blur-xs text-[10px] font-extrabold uppercase tracking-wider text-green-400 mb-1 border border-white/10">
                      Featured Facility
                    </span>
                    <h3 className="text-lg font-black text-white leading-tight">
                      {courts[0].name}
                    </h3>
                    <p className="text-xs text-white/80 mt-0.5">
                      {courts[0].sportType} · {courts[0].surface} · {courts[0].isIndoor ? 'Indoor' : 'Outdoor'}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </SiteContainer>
      </div>

      {/* ─────────────────────────────────────────────
          SECTION 2: FEATURED COURTS
          Mobile: featured card + compact list. Desktop: preserved 4-column grid.
      ───────────────────────────────────────────── */}
      <SiteContainer as="section">
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-[#F5F7F5] tracking-tight">Our Courts</h2>
          </div>
          <Link href="/courts" className="px-3 sm:px-4 py-2 min-h-[44px] rounded-[var(--radius-xs)] border border-gray-200 dark:border-[#344239] text-[11px] sm:text-xs font-bold text-gray-700 dark:text-[#F5F7F5] hover:bg-gray-50 dark:hover:bg-[#1D2821] flex items-center gap-1 transition-colors shrink-0">
            <span>View All</span>
          </Link>
        </div>

        {/* Mobile: featured card + compact list */}
        <div className="lg:hidden space-y-6">
          {courts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.35 }}
              className="relative rounded-[var(--radius-2xl)] overflow-hidden border border-[var(--border)] shadow-md bg-gray-100 dark:bg-[#1D2821]"
            >
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src={courts[0].image}
                  alt={courts[0].name}
                  fill
                  sizes="(max-width: 1024px) 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </div>
              <div className="absolute bottom-0 inset-x-0 p-4">
                <span className="inline-block px-2.5 py-0.5 rounded-[var(--radius-xs)] bg-black/60 backdrop-blur-xs text-[10px] font-extrabold uppercase tracking-wider text-green-300 border border-white/10 mb-1.5">
                  Featured
                </span>
                <h3 className="text-lg font-black text-white leading-tight">{courts[0].name}</h3>
                <p className="text-xs text-white/75 mt-0.5">
                  {courts[0].sportType}
                  {courts[0].surface ? ` · ${courts[0].surface}` : ''}
                  {courts[0].pricePerHour ? ` · EGP ${courts[0].pricePerHour}/hr` : ''}
                </p>
                <Button
                  render={
                    <Link
                      href="/book"
                      onClick={() => selectCourt(courts[0])}
                      className="w-full mt-3"
                    />
                  }
                  nativeButton={false}
                  variant="primary"
                  size="sm"
                  className="w-full mt-3"
                >
                  <span>Reserve Court</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Compact list of remaining courts */}
          {courts.length > 1 && (
            <ul className="divide-y divide-gray-100 dark:divide-[#344239]">
              {courts.slice(1).map((court) => (
                <li key={court.id}>
                  <Link
                    href="/book"
                    onClick={() => selectCourt(court)}
                    className="group flex items-center gap-4 py-3.5 -mx-1.5 px-1.5 rounded-[var(--radius-lg)] hover:bg-gray-50 dark:hover:bg-[#1D2821] transition-colors"
                  >
                    <div className="relative w-20 h-20 rounded-[var(--radius-lg)] overflow-hidden border border-gray-200 dark:border-[#344239] shrink-0 bg-gray-100 dark:bg-[#1D2821]">
                      <Image
                        src={court.image}
                        alt={court.name}
                        fill
                        sizes="80px"
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
                    <span className="w-11 h-11 rounded-[var(--radius-sm)] border border-gray-200 dark:border-[#344239] flex items-center justify-center text-gray-500 dark:text-[#A1ADA4] group-hover:border-[var(--primary)] group-hover:text-green-700 dark:group-hover:text-[#4ADE80] transition-colors shrink-0" aria-hidden="true">
                      <ArrowUpRight className="w-4 h-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Desktop: preserved 4-column grid */}
        <div className="hidden lg:grid lg:grid-cols-4 gap-6">
          {courts.slice(0, 4).map((court) => (
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
          <div className="surface-card p-6 sm:p-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 dark:bg-[#1D2821] flex items-center justify-center mb-4">
              <PartyPopper className="w-6 h-6 text-green-600 dark:text-[#4ADE80]" />
            </div>
            <h2 className="text-lg sm:text-2xl font-extrabold text-gray-900 dark:text-[#F5F7F5] tracking-tight">
              Seasonal Tournaments Launching Soon
            </h2>
            <p className="text-sm text-muted mt-2 max-w-md mx-auto leading-relaxed">
              We&apos;re preparing the next season of tournaments. Contact the club for inquiries or check back soon.
            </p>
            <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                render={<Link href="/contact" />}
                nativeButton={false}
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto"
              >
                <span>Ask About Tournaments</span>
              </Button>
              <Button
                render={<Link href="/events" />}
                nativeButton={false}
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto"
              >
                <span>View Events Page</span>
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          !eventsLoading && (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-[#F5F7F5] tracking-tight">Tournaments &amp; Events</h2>
                </div>
                {events.length > 1 && (
                  <Link href="/events" className="px-3 py-2 min-h-[44px] rounded-[var(--radius-xs)] border border-gray-200 dark:border-[#344239] text-[11px] sm:text-xs font-bold text-gray-700 dark:text-[#F5F7F5] hover:bg-gray-50 dark:hover:bg-[#1D2821] flex items-center gap-1 transition-colors shrink-0">
                    <span>All Events</span>
                  </Link>
                )}
              </div>

              {/* Featured event */}
              {events[0] && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0 rounded-[var(--radius-2xl)] overflow-hidden border border-[var(--border)]">
                  <div className="relative aspect-[16/9] md:aspect-auto md:min-h-[280px] bg-gray-100 dark:bg-[#1D2821]">
                    <Image
                      src={events[0].image}
                      alt={events[0].title}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="p-5 sm:p-8 bg-white dark:bg-[#1D2821] flex flex-col justify-center">
                    <span className="w-fit inline-flex items-center gap-2 px-3 py-1 rounded-[var(--radius-pill)] bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/60 dark:border-green-800 dark:text-green-400 text-[11px] font-bold uppercase tracking-wider mb-3">
                      Upcoming
                    </span>
                    <h3 className="text-lg sm:text-2xl font-extrabold text-gray-900 dark:text-[#F5F7F5] tracking-tight leading-snug">
                      {events[0].title}
                    </h3>
                    <p className="text-sm text-muted mt-2 leading-relaxed line-clamp-2">
                      {events[0].description}
                    </p>
                    <div className="mt-4 space-y-1.5 text-sm font-semibold text-gray-700 dark:text-[#A1ADA4]">
                      <p>{formatEventDate(events[0].date)} · {events[0].time}</p>
                      {events[0].maxParticipants > 0 && (
                        <p className="inline-flex items-center gap-1.5">
                          <Users className="w-4 h-4 shrink-0" />
                          {events[0].currentParticipants}/{events[0].maxParticipants} players registered
                        </p>
                      )}
                    </div>
                    <Button
                      render={<Link href="/events" />}
                      nativeButton={false}
                      variant="primary"
                      size="sm"
                      className="mt-5 w-full sm:w-auto"
                    >
                      <span>View Details</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Remaining events — compact list */}
              {events.length > 1 && (
                <ul className="mt-4 divide-y divide-gray-100 dark:divide-[#344239]">
                  {events.slice(1, 4).map((event) => (
                    <li key={event.id}>
                      <Link
                        href="/events"
                        className="group flex items-center gap-4 py-3.5 -mx-1.5 px-1.5 rounded-[var(--radius-lg)] hover:bg-gray-50 dark:hover:bg-[#1D2821] transition-colors"
                      >
                        <div className="relative w-16 h-16 rounded-[var(--radius-lg)] overflow-hidden border border-gray-200 dark:border-[#344239] shrink-0 bg-gray-100 dark:bg-[#1D2821]">
                          <Image
                            src={event.image}
                            alt={event.title}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-[#F5F7F5] truncate">
                            {event.title}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
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
        <div className="rounded-[var(--radius-2xl)] border border-green-200 dark:border-green-800/60 bg-green-50 dark:bg-green-950/30 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-11 h-11 rounded-[var(--radius-sm)] bg-green-600 dark:bg-[#16A34A] flex items-center justify-center text-white dark:text-[#101512] shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-[#F5F7F5] tracking-tight">
              Club Memberships Launching Soon
            </h2>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              The WEGO membership program is on the way. Register your interest to be notified when it opens.
            </p>
          </div>
          <Button
            render={<Link href="/membership" />}
            nativeButton={false}
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto shrink-0"
          >
            <span>Learn More</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </SiteContainer>

      {/* ─────────────────────────────────────────────
          SECTION 6: FACILITY SHOWCASE
      ───────────────────────────────────────────── */}
      <SiteContainer as="section">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10 items-stretch">
          <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[320px] rounded-[var(--radius-2xl)] overflow-hidden border border-[var(--border)] bg-gray-100 dark:bg-[#1D2821]">
            <Image
              src={FACILITY_IMAGE}
              alt="Fitness area inside the WEGO Sports Club"
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
            <h2 className="text-xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#F5F7F5] tracking-tight mt-3">
              A Club Built to Tournament Standards
            </h2>
            <p className="text-sm text-muted mt-2 leading-relaxed max-w-lg">
              Padel, football, and tennis venues engineered for competition — with the player experience handled off the court, from arrival to cool-down.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
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
                  className="px-3 py-1.5 rounded-[var(--radius-pill)] border border-gray-200 dark:border-[#344239] bg-white dark:bg-[#171F1A] text-[11px] font-bold text-gray-700 dark:text-[#A1ADA4]"
                >
                  {amenity}
                </span>
              ))}
            </div>
            <div className="mt-5">
              <Button
                render={<Link href="/about" />}
                nativeButton={false}
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto"
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
