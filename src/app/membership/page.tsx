'use client';

import { motion } from 'framer-motion';
import { getMembershipPlans } from '@/services/membership.service';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Crown, CheckCircle2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { createNotificationAction } from '@/app/actions/notification.actions';

export default function MembershipPage() {
  const user = useAuthStore((s) => s.user);

  const handleJoin = (planName: string) => {
    toast.success(`Welcome to K-HUB ${planName}! Registration confirmation sent.`);
    if (user) {
      createNotificationAction({
        userId: user.id,
        type: 'new_subscription',
        title: 'Welcome to the Club!',
        message: `You've joined K-HUB ${planName}. Enjoy exclusive benefits and discounts on all bookings.`,
      });
    }
  };

  return (
    <div>
      {/* Page hero — centered header + subtitle */}
      <section className="bg-white border-b border-gray-200/80 py-8 sm:py-14 text-center">
        <SiteContainer>
          <div className="page-hero-inner page-hero-inner--center">
            <div className="flex justify-center">
              <Badge icon={<Crown className="icon-inline text-green-600" />} size="sm">
                Club Memberships
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tight leading-[1.05]">Elevate Your Playing Experience</h1>
            <p className="text-sm sm:text-base text-muted max-w-2xl mx-auto leading-relaxed">
              Get up to 25% discount on all court bookings, 30 days priority reservation windows, free equipment rental, and VIP lounge access.
            </p>
          </div>
        </SiteContainer>
      </section>

      {/* Pricing block — soft tint via .pricing-section class */}
      <section className="pricing-section">
        <SiteContainer>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-6 items-stretch">
            {getMembershipPlans().map((plan) => (
              <motion.div
                key={plan.id}
                whileHover={{ y: -6 }}
                className={`rounded-[var(--radius-xl)] flex flex-col transition-all duration-300 min-h-[560px] ${
                  plan.popular
                    ? 'bg-gray-900 text-white shadow-2xl ring-4 ring-green-600/30 relative lg:-mt-4 lg:mb-4'
                    : 'bg-white text-gray-900 border border-gray-200 shadow-md relative'
                }`}
              >
                <div className="flex flex-col h-full p-5 sm:p-8">
                  {/* "Most Popular" badge — sits cleanly at top offset */}
                  {plan.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="px-4 py-1.5 rounded-full bg-green-600 text-white text-[11px] font-extrabold uppercase tracking-wider shadow-lg shadow-green-600/40 whitespace-nowrap">
                        Most Popular Tier
                      </span>
                    </div>
                  )}
                  <div className="mt-2">
                    <h3 className="text-2xl font-black">{plan.name}</h3>
                    <p className={`text-xs mt-1 ${plan.popular ? 'text-gray-400' : 'text-muted'}`}>
                      {plan.tagline}
                    </p>
                  </div>

                  {/* Price — baseline-aligned /month suffix via price-display tokens */}
                  <div className="price-display mt-6 mb-6">
                    <span className="price-display-amount text-4xl">
                      {plan.priceMonthly === 0 ? 'Free' : `EGP ${plan.priceMonthly}`}
                    </span>
                    {plan.priceMonthly > 0 && (
                      <span className={`price-display-suffix ${plan.popular ? '!text-gray-400' : ''}`}>/ month</span>
                    )}
                  </div>

                  <ul className="space-y-3 border-t pt-6 text-xs font-medium border-gray-200/20 flex-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <CheckCircle2 className={`w-[16px] h-[16px] shrink-0 mt-[3px] ${plan.popular ? 'text-green-400' : 'text-green-600'}`} />
                        <span className="leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100/10">
                  <Button
                    onClick={() => handleJoin(plan.name)}
                    variant={plan.popular ? 'primary' : 'secondary'}
                    size="lg"
                    className="w-full h-12 rounded-full font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Join {plan.name}</span>
                    <ChevronRight className="icon-btn" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </SiteContainer>
      </section>
    </div>
  );
}
