'use client';

import Link from 'next/link';
import { useSponsorshipStore } from '@/features/sponsorship/useSponsorshipStore';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Sparkles, HandshakeIcon, Building2, Target, ChevronRight, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SponsorsPage() {
  const requests = useSponsorshipStore((s) => s.requests);
  const activeSponsors = requests.filter(
    (r) => r.status === 'Approved' && r.isActive === true
  );

  return (
    <div>
      {/* Page hero */}
      <section className="bg-white border-b border-gray-200/80 py-8 sm:py-12 text-center">
        <SiteContainer>
          <div className="page-hero-inner page-hero-inner--center">
            <div className="flex justify-center">
              <Badge icon={<Sparkles className="icon-inline text-green-600" />} size="sm">
                Club Partners & Sponsors
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tight leading-[1.05]">
              Our Sponsors
            </h1>
            <p className="text-sm sm:text-base text-muted max-w-2xl mx-auto leading-relaxed">
              K-HUB partners with companies that share our passion for sport, excellence, and
              community. Sponsorships support our facilities, events, and member experience.
            </p>
          </div>
        </SiteContainer>
      </section>

      {activeSponsors.length > 0 ? (
        /* ── Active sponsors grid ── */
        <SiteContainer as="section" className="py-10 sm:py-16 pb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch w-full">
            {activeSponsors.map((sponsor) => (
              <div key={sponsor.id} className="sponsor-card">
                <div>
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <div className="sponsor-logo-badge">
                      <Building2 className="w-7 h-7 text-gray-400" />
                    </div>
                    <Badge variant="subtle" size="xs">{sponsor.targetType}</Badge>
                  </div>
                  <h3 className="font-black text-lg text-gray-900">{sponsor.companyName}</h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Contact: {sponsor.contactName}
                  </p>

                  {sponsor.approvedBenefits.length > 0 && (
                    <div className="offer-badge mt-4 p-3 rounded-[var(--radius-md)] text-xs space-y-1">
                      <div className="font-extrabold mb-1">Approved Benefits</div>
                      <ul className="space-y-0.5">
                        {sponsor.approvedBenefits.map((b, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <ChevronRight className="icon-inline flex-shrink-0" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* CTA to apply */}
          <div className="mt-12 text-center">
            <p className="text-sm text-muted mb-4">Want to join our sponsor family?</p>
            <Link href="/sponsors/apply">
              <Button variant="primary" size="lg" className="gap-2">
                <HandshakeIcon className="icon-btn" />
                Become a Sponsor
              </Button>
            </Link>
          </div>
        </SiteContainer>
      ) : (
        /* ── Empty state (correct default for Phase 6) ── */
        <SiteContainer as="section" className="py-10 sm:py-20">
          <div className="max-w-2xl mx-auto text-center space-y-8">
            {/* Icon cluster */}
            <div className="flex items-center justify-center gap-4">
              <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-green-50 border border-green-100 flex items-center justify-center shadow-sm">
                <HandshakeIcon className="w-7 h-7 sm:w-10 sm:h-10 text-green-600" />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900">
                No Active Sponsors Yet
              </h2>
              <p className="text-muted leading-relaxed max-w-lg mx-auto">
                We&apos;re building partnerships with companies that share our values. If your
                brand believes in sport, community, and excellence — we&apos;d love to hear from you.
              </p>
            </div>

            {/* Benefits preview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              {[
                {
                  icon: <Target className="w-5 h-5 text-green-600" />,
                  title: 'High Visibility',
                  desc: 'Reach active sports enthusiasts who visit K-HUB regularly.',
                },
                {
                  icon: <Building2 className="w-5 h-5 text-green-600" />,
                  title: 'Flexible Targets',
                  desc: 'Sponsor the whole club, a specific court, or a facility area.',
                },
                {
                  icon: <Sparkles className="w-5 h-5 text-green-600" />,
                  title: 'Custom Packages',
                  desc: 'One-time, monthly, or seasonal — we work around your budget.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="surface-card p-5 rounded-[var(--radius-lg)] space-y-2"
                >
                  <div className="icon-badge-circle w-10 h-10 rounded-xl">
                    {item.icon}
                  </div>
                  <h3 className="font-bold text-sm text-gray-900">{item.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link href="/sponsors/apply">
                <Button variant="primary" size="lg" className="gap-2 w-full sm:w-auto">
                  <HandshakeIcon className="icon-btn" />
                  Become a Sponsor
                  <ArrowRight className="icon-btn" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                  Contact Us First
                </Button>
              </Link>
            </div>
          </div>
        </SiteContainer>
      )}
    </div>
  );
}
