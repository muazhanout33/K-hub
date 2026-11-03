import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Trophy, ShieldCheck, Zap, Heart } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us | WEGO Sports',
};

export default function AboutPage() {
  return (
    <div>
      {/* Hero — centered heading with proper section-head spacing */}
      <section className="bg-white dark:bg-[#171F1A] border-b border-gray-200/80 dark:border-[#344239] py-8 sm:py-14 lg:py-20 text-center">
        <SiteContainer>
          <div className="page-hero-inner page-hero-inner--center">
            <div className="flex justify-center">
              <Badge icon={<Trophy className="icon-inline text-green-600" />} size="sm">
                About WEGO
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-gray-900 dark:text-[#F5F7F5] tracking-tight leading-[1.05]">
              Redefining Local Sports Management
            </h1>
            {/* Explicit gap between heading and body via section-head — body copy with relaxed line-height */}
            <p className="text-base text-muted leading-relaxed max-w-2xl mx-auto">
              WEGO was founded to eliminate double bookings, phone-call delays, and chaotic paper schedules. We deliver a world-class digital booking experience for players, coaches, and sports facilities.
            </p>
          </div>
        </SiteContainer>
      </section>

      {/* Stats — unified .stats-bar container with .stats-bar-item separators */}
      <SiteContainer as="section" className="py-10 sm:py-16 lg:py-20">
        <div className="stats-bar">
          {[
            { label: 'Turf Standard', val: 'WPT & FIFA' },
            { label: 'Slot Hold Guarantee', val: '10 Mins' },
            { label: 'Daily Operations', val: '6AM – 2AM' },
            { label: 'Booking Model', val: 'Real-Time' },
          ].map((stat, i) => (
            <div key={i} className="stats-bar-item">
              {/* .stat-number: font-size 2rem/2.25rem, font-weight 900, color var(--primary) */}
              <span className="stat-number">{stat.val}</span>
              <span className="text-xs font-bold text-muted mt-2 uppercase tracking-wider block">{stat.label}</span>
            </div>
          ))}
        </div>
      </SiteContainer>

      {/* Core Pillars */}
      <SiteContainer as="section" className="pb-16 lg:pb-20">
        <div className="section-head text-center items-center max-w-xl mx-auto mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#F5F7F5] tracking-tight">Our Core Pillars</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch w-full">
          {/* Pillar 1 */}
          <div className="surface-card p-5 sm:p-8 flex flex-col justify-start">
            {/* .icon-badge-circle: 48px circular badge with primary-light bg and primary color */}
            <div className="icon-badge-circle mb-4 sm:mb-5">
              <Zap className="icon-feature" />
            </div>
            <h3 className="font-extrabold text-base sm:text-lg text-gray-900 dark:text-[#F5F7F5]">10-Minute Lock Guarantee</h3>
            <p className="text-sm text-muted mt-3 leading-relaxed">
              When you choose a slot, it is exclusively reserved for 10 minutes. Duplicate bookings are mathematically impossible.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="surface-card p-5 sm:p-8 flex flex-col justify-start">
            <div className="icon-badge-circle mb-4 sm:mb-5">
              <ShieldCheck className="icon-feature" />
            </div>
            <h3 className="font-extrabold text-base sm:text-lg text-gray-900 dark:text-[#F5F7F5]">Tournament-Grade Standards</h3>
            <p className="text-sm text-muted mt-3 leading-relaxed">
              Every court features official Mondo Supercourt XN turf, FIFA certified synthetic grass, Hawk-Eye camera playback, and high-lux LED illumination.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="surface-card p-5 sm:p-8 flex flex-col justify-start">
            <div className="icon-badge-circle mb-4 sm:mb-5">
              <Heart className="icon-feature" />
            </div>
            <h3 className="font-extrabold text-base sm:text-lg text-gray-900 dark:text-[#F5F7F5]">Community &amp; Sportsmanship</h3>
            <p className="text-sm text-muted mt-3 leading-relaxed">
              We host weekly leagues, monthly open championships, and community coaching programs for players of all skill levels.
            </p>
          </div>
        </div>
      </SiteContainer>
    </div>
  );
}
