'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { getBookingStatusAction } from '@/app/actions/booking.actions';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  CalendarCheck,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { FALLBACK_COURT_IMAGE } from '@/services/court.service';
import type { Booking } from '@/types';
import { toast } from 'sonner';

type RecoverState = 'idle' | 'loading' | 'failed';

export default function BookingConfirmationPage() {
  const router = useRouter();
  const bookings = useBookingStore((s) => s.bookings);
  const bookingHydrated = useBookingStore((s) => s._hasHydrated);
  const resetBookingFlow = useBookingStore((s) => s.resetBookingFlow);
  const pendingConfirmation = usePaymentStore((s) => s.pendingConfirmation);
  const lastBookingId = usePaymentStore((s) => s.lastBookingId);
  const paymentHydrated = usePaymentStore((s) => s._hasHydrated);

  // Durable booking id: survives a refresh that clears the local store.
  const durableBookingId = pendingConfirmation?.bookingId ?? lastBookingId ?? null;

  // Prefer the booking this page is actually about, then the newest one.
  const latestBooking: Booking | null = (durableBookingId
    ? bookings.find((b) => b.id === durableBookingId)
    : null) ?? (bookings.length > 0 ? bookings[0] : null);

  const [recoverState, setRecoverState] = useState<RecoverState>('idle');
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const recoverAttemptedFor = useRef<string | null>(null);

  const hydrating = !bookingHydrated || !paymentHydrated;

  // Recover the booking from the server when the local store is empty
  // (refresh / redirect / other device) but we still know its id.
  useEffect(() => {
    if (hydrating) return;
    if (latestBooking) return;
    if (!durableBookingId) return;
    if (recoverAttemptedFor.current === durableBookingId) return;

    recoverAttemptedFor.current = durableBookingId;
    let cancelled = false;
    setRecoverState('loading');
    setRecoverError(null);

    void (async () => {
      const result = await getBookingStatusAction(durableBookingId);
      if (cancelled) return;
      if (result.success && result.booking) {
        const recovered = result.booking;
        useBookingStore.setState((state) => ({
          bookings: [recovered, ...state.bookings.filter((b) => b.id !== recovered.id)],
        }));
        setRecoverState('idle');
      } else {
        setRecoverError(result.error || 'Unable to load your booking.');
        setRecoverState('failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrating, latestBooking, durableBookingId]);

  // Redirect only when there is NOTHING to recover — never when a
  // durable id exists (that was the "No booking in progress" bug).
  useEffect(() => {
    if (hydrating) return;
    if (bookings.length > 0 || durableBookingId || recoverState !== 'idle') return;
    router.push('/book');
  }, [hydrating, bookings.length, durableBookingId, recoverState, router]);

  if (hydrating || (!latestBooking && recoverState === 'loading')) {
    return (
      <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC] dark:bg-[#101512]">
        <SiteContainer className="py-16 sm:py-20 text-center">
          <p className="text-gray-500 dark:text-[#8A9A8E] text-sm">Loading booking details...</p>
        </SiteContainer>
      </div>
    );
  }

  if (!latestBooking) {
    // Recovery failed but we KNOW a booking exists — tell the truth and
    // offer a retry instead of bouncing the user to an empty /book page.
    if (recoverState === 'failed' || durableBookingId) {
      return (
        <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC] dark:bg-[#101512]">
          <SiteContainer className="py-16 sm:py-20 text-center space-y-4">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="text-sm text-gray-600 dark:text-[#8A9A8E]">
              {recoverError || 'Your booking could not be loaded right now.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                onClick={() => {
                  recoverAttemptedFor.current = null;
                  setRecoverState('idle');
                  setRecoverError(null);
                  // Re-trigger the recovery effect.
                  useBookingStore.setState((s) => ({ bookings: [...s.bookings] }));
                }}
                variant="primary"
                size="md"
                className="px-6"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              <Button render={<Link href="/bookings" />} nativeButton={false} variant="outline" size="md" className="px-6">
                View My Reservations
              </Button>
            </div>
          </SiteContainer>
        </div>
      );
    }
    return (
      <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC] dark:bg-[#101512]">
        <SiteContainer className="py-16 sm:py-20 text-center">
          <p className="text-gray-500 dark:text-[#8A9A8E] text-sm">Loading booking details...</p>
        </SiteContainer>
      </div>
    );
  }

  const isConfirmed = latestBooking.status === 'Confirmed';
  const isReserved = latestBooking.status === 'Reserved';

  const handleNewBooking = () => {
    resetBookingFlow();
    router.push('/book');
  };

  return (
    <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC] dark:bg-[#101512]">
      <section className="bg-white dark:bg-[#171F1A] border-b border-gray-200/80 dark:border-[#344239] py-6 sm:py-10">
        <SiteContainer>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
            <div className="section-head mb-0">
              <Badge
                icon={
                  isConfirmed ? (
                    <CheckCircle2 className="icon-inline text-green-600" />
                  ) : (
                    <Clock className="icon-inline text-amber-600" />
                  )
                }
                size="sm"
              >
                {isConfirmed ? 'Booking Confirmed' : `Booking ${latestBooking.status}`}
              </Badge>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 dark:text-[#F5F7F5] tracking-tight leading-[1.05]">
                {isConfirmed ? 'Booking Confirmed!' : `Booking ${latestBooking.status}`}
              </h1>
              <p className="text-sm text-muted max-w-xl leading-relaxed">
                {isConfirmed
                  ? 'Your court has been successfully booked. See you on the court!'
                  : isReserved
                    ? 'Your reservation is still pending payment confirmation.'
                    : 'This booking is no longer active.'}
              </p>
            </div>
          </div>
        </SiteContainer>
      </section>

      <SiteContainer className="pb-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Success animation */}
          <div className="bg-white dark:bg-[#1D2821] rounded-[24px] border border-[#E2E8F0] dark:border-[#344239] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-5 sm:p-8 text-center space-y-4">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${
                isConfirmed
                  ? 'bg-green-100 dark:bg-green-950/60'
                  : 'bg-amber-100 dark:bg-amber-950/60'
              }`}
            >
              {isConfirmed ? (
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-[#4ADE80]" />
              ) : (
                <Clock className="w-10 h-10 text-amber-600 dark:text-[#FBBF24]" />
              )}
            </div>
            <h2 className="font-extrabold text-xl text-[#0F172A] dark:text-[#F5F7F5]">
              Thank You, {latestBooking.userName}!
            </h2>
            <p className="text-sm text-gray-500 dark:text-[#8A9A8E]">
              {isConfirmed ? (
                <>
                  Your booking has been confirmed and a confirmation email has been sent to{' '}
                  <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{latestBooking.userEmail}</span>
                </>
              ) : (
                <>
                  We have your reservation{' '}
                  <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{latestBooking.bookingNumber}</span>{' '}
                  ({latestBooking.status}). You can review it any time from your reservations.
                </>
              )}
            </p>
          </div>

          {/* Non-confirmed: truthful status panel with a path forward */}
          {!isConfirmed && (
            <div
              className={`rounded-[24px] p-6 space-y-4 border ${
                isReserved
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/40'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/40'
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className={`w-5 h-5 shrink-0 mt-0.5 ${isReserved ? 'text-blue-600' : 'text-red-600'}`}
                />
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-[#0F172A] dark:text-[#F5F7F5]">
                    {isReserved ? 'Payment not completed' : `Booking ${latestBooking.status}`}
                  </h3>
                  <p className={`text-sm ${isReserved ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-400'}`}>
                    {isReserved
                      ? 'Your slot is reserved but payment has not been confirmed yet. Complete the payment to confirm this booking.'
                      : 'This booking is no longer active. Please start a new booking to reserve a court.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                {isReserved && (
                  <Button
                    render={<Link href="/book/payment" />}
                    nativeButton={false}
                    variant="primary"
                    size="md"
                    className="w-full sm:w-auto px-6"
                  >
                    Complete Payment
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  onClick={handleNewBooking}
                  variant={isReserved ? 'outline' : 'primary'}
                  size="md"
                  className="w-full sm:w-auto px-6"
                >
                  <CalendarCheck className="w-4 h-4" />
                  Book Another Court
                </Button>
              </div>
            </div>
          )}

          {/* Booking details */}
          <div className="bg-white dark:bg-[#1D2821] rounded-[24px] border border-[#E2E8F0] dark:border-[#344239] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[#0F172A] dark:text-[#F5F7F5] uppercase tracking-wider">Booking Details</h3>
              <span className="font-mono text-xs font-bold text-gray-400 dark:text-[#8A9A8E]">{latestBooking.bookingNumber}</span>
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
                <h4 className="font-bold text-sm text-[#0F172A] dark:text-[#F5F7F5]">{latestBooking.courtName}</h4>
                <p className="text-[11px] text-gray-500 dark:text-[#8A9A8E] mt-0.5">{latestBooking.sportType}</p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Date</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{latestBooking.date}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Time</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">
                  {latestBooking.startTime} – {latestBooking.endTime}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Duration</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{latestBooking.durationMinutes} mins</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Status</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 w-fit ${
                    isConfirmed ? 'badge-available' : 'badge-unavailable'
                  }`}
                >
                  {isConfirmed ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {latestBooking.status}
                </span>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-[#344239] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 dark:text-[#8A9A8E] uppercase tracking-wider">
                  {isConfirmed ? 'Total Paid' : 'Total'}
                </span>
                <span className="text-2xl font-black text-[#0F172A] dark:text-[#F5F7F5]">EGP {latestBooking.totalPrice}</span>
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
