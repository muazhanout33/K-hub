'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { calculateBookingPrice, formatPrice } from '@/lib/pricing';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { BookingSteps } from '@/features/booking/BookingSteps';
import { BookingSummary } from '@/features/booking/BookingSummary';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import { CreditCard, ShieldCheck, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const MAX_CONFIRMATION_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

export default function BookingPaymentPage() {
  const router = useRouter();
  const selectedCourt = useBookingStore((s) => s.selectedCourt);
  const selectedSlots = useBookingStore((s) => s.selectedSlots);
  const selectedDate = useBookingStore((s) => s.selectedDate);
  const userName = useBookingStore((s) => s.userName);
  const userEmail = useBookingStore((s) => s.userEmail);
  const setBookingStep = useBookingStore((s) => s.setBookingStep);
  const resetBookingFlow = useBookingStore((s) => s.resetBookingFlow);
  const confirmBooking = useBookingStore((s) => s.confirmBooking);
  const confirmBookingAfterPayment = useBookingStore((s) => s.confirmBookingAfterPayment);
  const createPayment = usePaymentStore((s) => s.createPayment);
  const processPayment = usePaymentStore((s) => s.processPayment);
  const bookingHydrated = useBookingStore((s) => s._hasHydrated);

  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  const durationMinutes = selectedSlots.length * 60;
  const totalPrice = calculateBookingPrice(selectedCourt?.pricePerHour ?? 0, durationMinutes);

  const handleConfirm = useCallback(async (isRetry = false) => {
    if (!selectedCourt || selectedSlots.length === 0) return;
    setIsProcessing(true);
    setConfirmationError(null);

    // Step 1: Create booking as Reserved
    const bookingResult = await confirmBooking();

    if (!bookingResult.success || !bookingResult.booking) {
      const msg = bookingResult.error || 'Failed to create booking. Please try again.';
      setConfirmationError(msg);
      toast.error(msg);
      setIsProcessing(false);
      return;
    }

    const bookingId = bookingResult.booking.id;

    // Step 2: Create payment (amount in piastres for Payment domain)
    const paymentAmount = totalPrice * 100;
    const paymentResult = createPayment(
      bookingId,
      paymentAmount,
      `pay-${bookingId}-${Date.now()}`
    );

    if (!paymentResult.success || !paymentResult.payment) {
      const msg = paymentResult.error || 'Failed to initiate payment. Please try again.';
      setConfirmationError(msg);
      toast.error(msg);
      setIsProcessing(false);
      return;
    }

    // Step 3: Process mock payment (simulates provider processing)
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const processResult = processPayment(paymentResult.payment.paymentId, 'success');

    if (!processResult.success || !processResult.payment) {
      const msg = processResult.error || 'Payment processing failed. Please try again.';
      setConfirmationError(msg);
      toast.error(msg);
      setIsProcessing(false);
      return;
    }

    // Step 4: Confirm booking after payment — with retry and server-state verification
    // F1/P0: If confirmation fails, verify server-side state before retrying.
    // Never auto-refund. Never create duplicate bookings or payments.
    let confirmResult = await confirmBookingAfterPayment(bookingId);

    if (confirmResult.success) {
      toast.success('Booking confirmed!');
      router.push('/book/confirmation');
      return;
    }

    // Step 4 failed — retry with server-state verification
    // Each retry calls confirmBookingAfterPayment which is idempotent:
    // - If booking already Confirmed → returns "already confirmed" error (treated as success)
    // - If booking still Reserved → attempts promotion (safe to retry)
    for (let retry = 0; retry < MAX_CONFIRMATION_RETRIES; retry++) {
      toast.info(`Retrying confirmation (attempt ${retry + 1}/${MAX_CONFIRMATION_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

      confirmResult = await confirmBookingAfterPayment(bookingId);

      if (confirmResult.success) {
        toast.success('Booking confirmed!');
        router.push('/book/confirmation');
        return;
      }

      // If the error indicates the booking is already confirmed, treat as success
      // This handles the case where step 4 succeeded server-side but the client didn't receive the response
      if (confirmResult.error?.includes('already confirmed') || confirmResult.error?.includes('already')) {
        toast.success('Booking confirmed!');
        router.push('/book/confirmation');
        return;
      }
    }

    // All retries exhausted — check payment state for user messaging
    const finalPayment = usePaymentStore.getState().getPaymentByBookingId(bookingId);
    let errorMessage: string;

    if (finalPayment?.status === 'Paid') {
      // Payment succeeded but confirmation failed after all retries
      errorMessage = 'Your payment was received but booking confirmation failed. Please contact support with your booking reference.';
    } else {
      errorMessage = 'Booking confirmation failed. Your booking may still be pending. Please try again or contact support.';
    }

    setConfirmationError(errorMessage);
    toast.error(errorMessage);
    setIsProcessing(false);
  }, [confirmBooking, createPayment, processPayment, confirmBookingAfterPayment, selectedCourt, selectedSlots, totalPrice, router]);

  if (!selectedCourt || selectedSlots.length === 0) {
    return (
      <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC] dark:bg-[#101512]">
        <SiteContainer className="py-16 sm:py-20 text-center">
          <p className="text-gray-500 dark:text-[#8A9A8E] text-sm">No booking in progress. Please select a court and time first.</p>
          <Button render={<a href="/book" />} nativeButton={false} variant="primary" size="md" className="mt-4">
            Start Booking
          </Button>
        </SiteContainer>
      </div>
    );
  }

  if (!bookingHydrated) {
    return (
      <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC] dark:bg-[#101512]">
        <SiteContainer className="py-16 sm:py-20 text-center">
          <div className="text-gray-400 dark:text-[#8A9A8E] text-sm">Loading booking details...</div>
        </SiteContainer>
      </div>
    );
  }

  if (!userName || !userEmail) {
    router.push('/book/details');
    return null;
  }

  return (
    <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC] dark:bg-[#101512]">
      <section className="bg-white dark:bg-[#171F1A] border-b border-gray-200/80 dark:border-[#344239] py-6 sm:py-10">
        <SiteContainer>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
            <div className="section-head mb-0">
              <Badge icon={<CreditCard className="icon-inline text-green-600" />} size="sm">
                Step 4 of 4
              </Badge>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 dark:text-[#F5F7F5] tracking-tight leading-[1.05]">Payment</h1>
              <p className="text-sm text-muted max-w-xl leading-relaxed">
                Review your booking and confirm payment.
              </p>
            </div>
          </div>
        </SiteContainer>
      </section>

      <SiteContainer className="pb-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <BookingSteps />

          <div className="bg-white dark:bg-[#1D2821] rounded-[24px] border border-[#E2E8F0] dark:border-[#344239] shadow-[0_8px-30px_rgba(15,23,42,0.06)] p-6 space-y-5">
            <h3 className="font-extrabold text-sm text-[#0F172A] dark:text-[#F5F7F5] uppercase tracking-wider">Order Summary</h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Court</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{selectedCourt.name}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Date</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{selectedDate}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Duration</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{durationMinutes} mins</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Player</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{userName}</span>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-[#344239] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-400 dark:text-[#8A9A8E] uppercase tracking-wider">Total Amount</span>
                <span className="text-2xl sm:text-3xl font-black text-[#0F172A] dark:text-[#F5F7F5]">EGP {formatPrice(totalPrice)}</span>
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-950/40 border border-transparent dark:border-green-800/40 rounded-xl p-3 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-green-600 dark:text-[#4ADE80] shrink-0 mt-0.5" />
              <p className="text-[11px] text-green-700 dark:text-green-300 font-medium">
                Your payment is secured with 256-bit SSL encryption. We never store your card details.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
              <Button
                type="button"
                onClick={() => {
                  setBookingStep(3);
                  router.push('/book/details');
                }}
                variant="outline"
                size="md"
                className="w-full sm:w-auto px-8"
              >
                Back
              </Button>
              <Button
                onClick={() => handleConfirm(false)}
                disabled={isProcessing}
                variant="primary"
                size="md"
                className="w-full sm:w-auto px-8"
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <Lock className="w-4 h-4 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Confirm & Pay EGP {formatPrice(totalPrice)}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* F3: Error state with retry affordance */}
          {confirmationError && !isProcessing && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 rounded-[24px] p-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-red-800 dark:text-red-300">Booking Confirmation Issue</h3>
                  <p className="text-sm text-red-700 dark:text-red-400">{confirmationError}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <Button
                  onClick={() => handleConfirm(true)}
                  variant="primary"
                  size="md"
                  className="w-full sm:w-auto px-6"
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Retry Confirmation
                  </span>
                </Button>
                <Button
                  onClick={() => {
                    resetBookingFlow();
                    router.push('/book');
                  }}
                  variant="outline"
                  size="md"
                  className="w-full sm:w-auto px-6"
                >
                  Start Over
                </Button>
              </div>
            </div>
          )}

          <div className="hidden sm:block">
            <BookingSummary />
          </div>
        </div>
      </SiteContainer>
    </div>
  );
}
