'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, CalendarCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { FALLBACK_COURT_IMAGE } from '@/services/court.service';

export default function BookingConfirmationPage() {
  const router = useRouter();
  const bookings = useBookingStore((s) => s.bookings);
  const bookingHydrated = useBookingStore((s) => s._hasHydrated);
  const resetBookingFlow = useBookingStore((s) => s.resetBookingFlow);
  const latestBooking = bookings.length > 0 ? bookings[0] : null;

  useEffect(() => {
    if (bookingHydrated && bookings.length === 0) {
      router.push('/book');
    }
  }, [bookingHydrated, bookings, router]);

  if (!latestBooking) {
    return (
      <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC]">
        <SiteContainer className="py-16 sm:py-20 text-center">
          <p className="text-gray-500 text-sm">Loading booking details...</p>
        </SiteContainer>
      </div>
    );
  }

  const handleNewBooking = () => {
    resetBookingFlow();
    router.push('/book');
  };

  return (
    <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC]">
      <section className="bg-white border-b border-gray-200/80 py-6 sm:py-10">
        <SiteContainer>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
            <div className="section-head mb-0">
              <Badge icon={<CheckCircle2 className="icon-inline text-green-600" />} size="sm">
                Booking Confirmed
              </Badge>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 tracking-tight leading-[1.05]">Booking Confirmed!</h1>
              <p className="text-sm text-muted max-w-xl leading-relaxed">
                Your court has been successfully booked. See you on the court!
              </p>
            </div>
          </div>
        </SiteContainer>
      </section>

      <SiteContainer className="pb-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Success animation */}
          <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-5 sm:p-8 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="font-extrabold text-xl text-[#0F172A]">Thank You, {latestBooking.userName}!</h2>
            <p className="text-sm text-gray-500">
              Your booking has been confirmed and a confirmation email has been sent to{' '}
              <span className="font-bold text-[#0F172A]">{latestBooking.userEmail}</span>
            </p>
          </div>

          {/* Booking details */}
          <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[#0F172A] uppercase tracking-wider">Booking Details</h3>
              <span className="font-mono text-xs font-bold text-gray-400">{latestBooking.bookingNumber}</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
                <Image
                  src={
                    typeof latestBooking.courtImage === 'string' && latestBooking.courtImage.trim().length > 0
                      ? latestBooking.courtImage
                      : FALLBACK_COURT_IMAGE
                  }
                  alt={latestBooking.courtName}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-sm text-[#0F172A]">{latestBooking.courtName}</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">{latestBooking.sportType}</p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Date</span>
                <span className="font-bold text-[#0F172A]">{latestBooking.date}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Time</span>
                <span className="font-bold text-[#0F172A]">
                  {latestBooking.startTime} – {latestBooking.endTime}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="font-bold text-[#0F172A]">{latestBooking.durationMinutes} mins</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Status</span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold badge-available flex items-center gap-1 w-fit">
                  <CheckCircle2 className="w-3 h-3" /> Confirmed
                </span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Paid</span>
                <span className="text-2xl font-black text-[#0F172A]">EGP {latestBooking.totalPrice}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Button
              onClick={handleNewBooking}
              variant="outline"
              size="md"
              className="w-full sm:w-auto px-8"
            >
              <CalendarCheck className="w-4 h-4" />
              Book Another Court
            </Button>
            <Button
              render={<Link href="/bookings" />}
              nativeButton={false}
              variant="primary"
              size="md"
              className="w-full sm:w-auto px-8"
            >
              View My Reservations
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SiteContainer>
    </div>
  );
}
