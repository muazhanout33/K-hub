'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
import type { Payment } from '@/types';

const MAX_CONFIRMATION_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

/**
 * Ensure the booking's payment reaches `Paid`, without ever charging twice.
 *
 * Resolution order:
 *  1. Existing `Paid` payment          → reuse it (skip processing entirely)
 *  2. Existing `Pending` payment       → process that same payment
 *  3. No usable payment                → create one with a STABLE idempotency
 *                                        key (`pay-<bookingId>`) and process it
 *
 * The in-memory mock provider resets on refresh, so a stale `Pending`
 * record that the provider no longer knows about is replaced by a fresh
 * attempt keyed off the confirmation attempt counter. `createPayment`
 * still refuses to create a second `Paid` payment for a booking, so a
 * paid slot can never be double-charged.
 */
function ensurePaidPayment(bookingId: string, amount: number): Payment | null {
  const store = usePaymentStore.getState();
  const existing =
    store.getPaymentByBookingId(bookingId) ??
    (store.pendingConfirmation?.paymentId
      ? store.getPayment(store.pendingConfirmation.paymentId)
      : undefined);

  if (existing?.status === 'Paid') return existing;

  if (existing?.status === 'Pending') {
    const processed = store.processPayment(existing.paymentId, 'success');
    if (processed.payment) return processed.payment;
    // Provider lost the Pending record (refresh) — fall through and
    // start a fresh attempt below.
  }

  const attempt = store.pendingConfirmation?.attempts ?? 0;
  const key = existing ? `pay-${bookingId}-a${attempt}` : `pay-${bookingId}`;
  const created = store.createPayment(bookingId, amount, key);
  const payment = created.payment;
  if (!payment) return null;

  // Duplicate-key / already-paid responses still return the payment.
  if (payment.status === 'Paid') return payment;
  if (payment.status === 'Pending') {
    const processed = store.processPayment(payment.paymentId, 'success');
    if (processed.payment) return processed.payment;
  }
  return null;
}

export default function BookingPaymentPage() {
  const router = useRouter();
  const selectedCourt = useBookingStore((s) => s.selectedCourt);
  const selectedSlots = useBookingStore((s) => s.selectedSlots);
  const selectedDate = useBookingStore((s) => s.selectedDate);
  const userName = useBookingStore((s) => s.userName);
  const userEmail = useBookingStore((s) => s.userEmail);
  const bookings = useBookingStore((s) => s.bookings);
  const setBookingStep = useBookingStore((s) => s.setBookingStep);
  const resetBookingFlow = useBookingStore((s) => s.resetBookingFlow);
  const confirmBooking = useBookingStore((s) => s.confirmBooking);
  const confirmBookingAfterPayment = useBookingStore((s) => s.confirmBookingAfterPayment);
  const clearSelectedSlots = useBookingStore((s) => s.clearSelectedSlots);
  const pendingConfirmation = usePaymentStore((s) => s.pendingConfirmation);
  const paymentHydrated = usePaymentStore((s) => s._hasHydrated);
  const bookingHydrated = useBookingStore((s) => s._hasHydrated);

  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  // Durable booking context: survives a refresh/redirect even when the
  // local selection is gone (the pending confirmation is persisted).
  const pendingBooking = pendingConfirmation
    ? bookings.find((b) => b.id === pendingConfirmation.bookingId)
    : undefined;
  const hasSelection = !!selectedCourt && selectedSlots.length > 0;
  const hasPendingConfirmation = !!pendingConfirmation?.bookingId;

  const durationMinutes = hasSelection
    ? selectedSlots.length * 60
    : (pendingBooking?.durationMinutes ?? 0);
  const totalPrice = hasSelection
    ? calculateBookingPrice(selectedCourt?.pricePerHour ?? 0, selectedSlots.length * 60)
    : (pendingBooking?.totalPrice ?? 0);

  const handleConfirm = useCallback(async () => {
    setIsProcessing(true);
    setConfirmationError(null);

    // Step 1: obtain the booking (create once, reuse on every retry).
    let bookingId: string;
    if (hasSelection) {
      // confirmBooking() itself reuses a pending confirmation's booking
      // instead of creating a duplicate reservation.
      const bookingResult = await confirmBooking();
      if (!bookingResult.success || !bookingResult.booking) {
        const msg = bookingResult.error || 'Failed to create booking. Please try again.';
        setConfirmationError(msg);
        toast.error(msg);
        setIsProcessing(false);
        return;
      }
      bookingId = bookingResult.booking.id;
    } else if (hasPendingConfirmation) {
      // Recovery path: no local selection, but a durable confirmation op
      // exists — continue it instead of showing "No booking in progress".
      bookingId = pendingConfirmation!.bookingId;
    } else {
      setConfirmationError('No booking in progress. Please select a court and time first.');
      setIsProcessing(false);
      return;
    }

    // Register/refresh the durable op for this booking.
    usePaymentStore.getState().beginConfirmation?.(bookingId);

    // Step 2: amount in the smallest currency unit (piastres) for the
    // Payment domain. Fall back to the recovered booking's total.
    const amountBooking =
      useBookingStore.getState().bookings.find((b) => b.id === bookingId) ??
      pendingBooking;
    const amountEgp = amountBooking?.totalPrice ?? totalPrice;
    const paymentAmount = Math.round(amountEgp * 100);
    if (!Number.isInteger(paymentAmount) || paymentAmount <= 0) {
      const msg = 'Booking amount could not be determined. Please go back and review your booking.';
      setConfirmationError(msg);
      toast.error(msg);
      setIsProcessing(false);
      return;
    }

    // Step 3: create/reuse payment and process it (never twice).
    const payment = ensurePaidPayment(bookingId, paymentAmount);
    if (!payment) {
      const msg = 'Payment could not be completed. Please try again — you will not be charged twice.';
      setConfirmationError(msg);
      toast.error(msg);
      setIsProcessing(false);
      return;
    }
    usePaymentStore.getState().beginConfirmation?.(bookingId, payment.paymentId);

    // Step 4: confirm booking after payment — with retry and server-state
    // verification. Each retry is idempotent:
    // - booking already Confirmed → treated as success
    // - booking still Reserved    → promotion is safe to retry
    // Never auto-refund. Never create duplicate bookings or payments.
    const succeed = () => {
      usePaymentStore.getState().clearConfirmation();
      clearSelectedSlots();
      toast.success('Booking confirmed!');
      router.push('/book/confirmation');
    };

    usePaymentStore.getState().recordConfirmationAttempt?.();
    let confirmResult = await confirmBookingAfterPayment(bookingId);

    for (let retry = 0; retry < MAX_CONFIRMATION_RETRIES && !confirmResult.success; retry++) {
      // The error text already distinguishes "already confirmed" (success)
      // from real failures inside confirmBookingAfterPayment — this is a
      // belt-and-braces check for older call paths.
      if (/already confirmed/i.test(confirmResult.error ?? '')) {
        confirmResult = { success: true };
        break;
      }
      toast.info(`Retrying confirmation (attempt ${retry + 1}/${MAX_CONFIRMATION_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      usePaymentStore.getState().recordConfirmationAttempt?.();
      confirmResult = await confirmBookingAfterPayment(bookingId);
    }

    if (confirmResult.success) {
      succeed();
      return;
    }

    // All retries exhausted — persist the failure so a refresh can still
    // recover it, and report the truthful state.
    const finalPayment = usePaymentStore.getState().getPaymentByBookingId(bookingId);
    const errorMessage =
      finalPayment?.status === 'Paid'
        ? 'Your payment was received but booking confirmation failed. Retry the confirmation below — you will not be charged again.'
        : 'Booking confirmation failed. Your booking may still be pending. Please try again or contact support.';

    usePaymentStore.getState().markConfirmationFailed?.(errorMessage);
    setConfirmationError(errorMessage);
    toast.error(errorMessage);
    setIsProcessing(false);
  }, [
    hasSelection,
    hasPendingConfirmation,
    pendingConfirmation,
    pendingBooking,
    totalPrice,
    confirmBooking,
    confirmBookingAfterPayment,
    clearSelectedSlots,
    router,
  ]);

  // Auto-recovery: if a durable pending confirmation exists on mount
  // (e.g. the user was redirected back from payment, or refreshed the
  // page mid-confirmation), resume it exactly once — confirm-only, no
  // second payment, no duplicate booking.
  const autoRecoveryRan = useRef(false);
  useEffect(() => {
    if (autoRecoveryRan.current) return;
    if (!paymentHydrated || !bookingHydrated) return;
    const pending = usePaymentStore.getState().pendingConfirmation;
    if (!pending?.bookingId) return;
    // Deferred to a macrotask so the effect body itself never triggers a
    // synchronous setState cascade, and so an unmount (or StrictMode
    // remount) before the timer fires simply cancels this run instead of
    // confirming against a torn-down page.
    const timer = setTimeout(() => {
      autoRecoveryRan.current = true;
      void handleConfirm();
    }, 0);
    return () => clearTimeout(timer);
  }, [handleConfirm, paymentHydrated, bookingHydrated]);

  // ── Guards (hydration-aware so a refresh never flashes the empty state) ──
  if (!bookingHydrated || !paymentHydrated) {
    return (
      <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC] dark:bg-[#101512]">
        <SiteContainer className="py-16 sm:py-20 text-center">
          <div className="text-gray-400 dark:text-[#8A9A8E] text-sm">Loading booking details...</div>
        </SiteContainer>
      </div>
    );
  }

  if (!hasSelection && !hasPendingConfirmation) {
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

  // Only bounce to details when there is nothing durable to recover.
  if ((!userName || !userEmail) && !hasPendingConfirmation) {
    router.push('/book/details');
    return null;
  }

  const displayCourtName = selectedCourt?.name ?? pendingBooking?.courtName ?? 'Court';
  const displayDate = selectedDate ?? pendingBooking?.date ?? '';
  const displayPlayer = userName || pendingBooking?.userName || 'Guest';

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

          {hasPendingConfirmation && (
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40 rounded-[24px] p-4 flex items-start gap-2">
              <RefreshCw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                {pendingConfirmation?.phase === 'failed'
                  ? 'Your booking is saved. Retry the confirmation below — you will not be charged again.'
                  : 'Finishing your booking — resuming where you left off. You will not be charged twice.'}
              </p>
            </div>
          )}

          <div className="bg-white dark:bg-[#1D2821] rounded-[24px] border border-[#E2E8F0] dark:border-[#344239] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-6 space-y-5">
            <h3 className="font-extrabold text-sm text-[#0F172A] dark:text-[#F5F7F5] uppercase tracking-wider">Order Summary</h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Court</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{displayCourtName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Date</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{displayDate}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Duration</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{durationMinutes} mins</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-[#8A9A8E]">Player</span>
                <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">{displayPlayer}</span>
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
                onClick={() => handleConfirm()}
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
                    {pendingConfirmation?.phase === 'failed'
                      ? 'Retry Confirmation'
                      : `Confirm & Pay EGP ${formatPrice(totalPrice)}`}
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
                  onClick={() => handleConfirm()}
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
