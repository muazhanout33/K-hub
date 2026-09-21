'use client';

import { BookingWidget } from '@/features/booking/BookingWidget';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { CalendarCheck } from 'lucide-react';

export default function BookingPage() {
  return (
    <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC]">
      <section className="bg-white border-b border-gray-200/80 py-6 sm:py-10">
        <SiteContainer>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
            <div className="section-head mb-0">
              <Badge icon={<CalendarCheck className="icon-inline text-green-600" />} size="sm">
                Court Schedule
              </Badge>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 tracking-tight leading-[1.05]">Book Your Court</h1>
              <p className="text-sm text-muted max-w-xl leading-relaxed">
                Pick a court, select your preferred time, and lock the slot for 10 minutes while you finalize the details.
              </p>
            </div>
          </div>
        </SiteContainer>
      </section>

      <SiteContainer className="pb-6">
        <BookingWidget />
      </SiteContainer>
    </div>
  );
}
