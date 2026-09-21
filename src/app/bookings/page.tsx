'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { CalendarCheck, Clock, CheckCircle2, XCircle, AlertCircle, Trophy, LogIn, History } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSupabaseBookings } from '@/hooks/useSupabaseBookings';
import { Booking } from '@/types';
import { FALLBACK_COURT_IMAGE } from '@/services/court.service';

// ── Tab type ──
type TabKey = 'upcoming' | 'past';

// ── Helpers (duplicated from store for page-level use) ──
function bookingEndDateTime(b: Booking): Date {
  const [y, m, d] = b.date.split('-').map(Number);
  const [h, min] = b.endTime.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

function isBookingPast(b: Booking): boolean {
  return bookingEndDateTime(b) < new Date();
}

export default function MyBookingsPage() {
  const { user, isRedirecting } = useAuthGuard();
  const cancelBooking = useBookingStore((s) => s.cancelBooking);
  const isCancelling = useBookingStore((s) => s.isCancelling);
  const { bookings: supabaseBookings, refetch: refetchSupabaseBookings } = useSupabaseBookings(user?.id);

  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');

  // Merge store bookings + Supabase bookings
  const storeBookings = useBookingStore((s) => s.bookings);
  const allBookings = useMemo(() => {
    if (!user) return [];
    const map = new Map<string, Booking>();
    // Supabase bookings take priority
    for (const b of supabaseBookings) {
      map.set(b.id, b);
    }
    // Add any local store bookings not yet in Supabase list
    for (const b of storeBookings) {
      if (b.userId === user.id || user.role === 'Admin') {
        if (!map.has(b.id)) {
          map.set(b.id, b);
        }
      }
    }
    return Array.from(map.values());
  }, [user, supabaseBookings, storeBookings]);

  // Split into upcoming / past
  const { upcoming, past } = useMemo(() => {
    const up: Booking[] = [];
    const pa: Booking[] = [];
    for (const b of allBookings) {
      if (isBookingPast(b)) {
        pa.push(b);
      } else {
        up.push(b);
      }
    }
    return { upcoming: up, past: pa };
  }, [allBookings]);

  const displayBookings = activeTab === 'upcoming' ? upcoming : past;

  const handleCancel = async (id: string, bookingNum: string) => {
    if (!confirm(`Are you sure you want to cancel booking ${bookingNum}?`)) return;

    const result = await cancelBooking(id);

    if (result.success) {
      // Force refetch from Supabase to get the latest status
      refetchSupabaseBookings();

      // booking_cancelled notification created server-side in cancelBookingAction

      if (result.refund?.refunded) {
        toast.success(`Booking ${bookingNum} cancelled. Refund of EGP ${result.booking?.totalPrice} has been processed.`);
        // Create payment_refunded notification via Server Action
        const { createPaymentRefundedNotification } = await import('@/app/actions/notification.actions');
        await createPaymentRefundedNotification({
          userId: user!.id,
          bookingId: id,
          bookingNumber: bookingNum,
          amount: result.booking?.totalPrice ?? 0,
        });
      } else if (result.refund && !result.refund.refunded) {
        toast.success(`Booking ${bookingNum} has been cancelled per club policy.`);
        toast.error(`Refund could not be processed: ${result.refund.error}. Please contact support.`);
      } else {
        toast.success(`Booking ${bookingNum} has been cancelled per club policy.`);
      }
    } else if (result.error === 'CANCELLATION_TOO_LATE') {
      toast.error('Bookings cannot be cancelled less than 2 hours before the scheduled time.');
    } else {
      toast.error(result.error || 'Failed to cancel booking.');
    }
  };

  // Show login prompt for unauthenticated users
  if (!user && !isRedirecting) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="bg-white rounded-[var(--radius-xl)] p-12 text-center border border-gray-200 max-w-md mx-auto shadow-sm">
          <LogIn className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="font-extrabold text-gray-900 text-lg">Sign In Required</h3>
          <p className="text-xs text-muted mt-1">Please sign in to view your bookings.</p>
          <Button
            render={<Link href="/auth/login" />}
            nativeButton={false}
            variant="primary"
            size="pill"
            className="mt-6"
          >
            <LogIn className="icon-btn" />
            <span>Sign In</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-10">
      {/* Header */}
      <section className="bg-white border-b border-gray-200/80 py-6 sm:py-10">
        <SiteContainer>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
            <div className="section-head mb-0">
              <Badge variant="brand" size="sm">Player Dashboard</Badge>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">My Reservations</h1>
              <p className="text-sm sm:text-base text-muted leading-relaxed max-w-2xl">
                Manage your upcoming court bookings, view session history, and check reservation status.
              </p>
            </div>

            <Button
              render={<Link href="/book" />}
              nativeButton={false}
              variant="primary"
              size="lg"
              className="h-11 px-6 rounded-full font-bold shadow-md shadow-green-600/20 shrink-0 self-start md:self-auto"
            >
              <CalendarCheck className="icon-btn" />
              <span>Book New Court</span>
            </Button>
          </div>
        </SiteContainer>
      </section>

      {/* Tabs + Bookings List */}
      <SiteContainer as="section" className="pb-12">
        {/* Tab Bar */}
        {allBookings.length > 0 && (
          <div className="flex gap-1 mb-8 bg-gray-100 rounded-[var(--radius-pill)] p-1 w-fit">
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-5 py-2.5 rounded-[var(--radius-pill)] text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'upcoming'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Upcoming
              <span className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black ${
                activeTab === 'upcoming' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {upcoming.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`px-5 py-2.5 rounded-[var(--radius-pill)] text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'past'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Past
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black ${
                activeTab === 'past' ? 'bg-gray-200 text-gray-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {past.length}
              </span>
            </button>
          </div>
        )}

        {/* Bookings */}
        {allBookings.length > 0 ? (
          displayBookings.length > 0 ? (
            <div className="space-y-6">
              {displayBookings.map((booking) => {
                const isReserved = booking.status === 'Reserved';
                const isConfirmed = booking.status === 'Confirmed';
                const isExpired = booking.status === 'Expired';

                return (
                  <div
                    key={booking.id}
                    className="bg-white rounded-[var(--radius-xl)] p-6 border border-gray-200/80 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-5"
                  >
                    {/* Left Thumbnail & Details */}
                    <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                      <div className="relative w-24 h-24 rounded-[var(--radius-md)] overflow-hidden shrink-0 shadow-xs aspect-square">
                        <Image
                          src={
                            typeof booking.courtImage === 'string' && booking.courtImage.trim().length > 0
                              ? booking.courtImage
                              : FALLBACK_COURT_IMAGE
                          }
                          alt={booking.courtName}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-gray-400">{booking.bookingNumber}</span>
                          {isReserved ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold status-reserved flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Reserved
                            </span>
                          ) : isConfirmed ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold badge-available flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Confirmed
                            </span>
                          ) : isExpired ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-700 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Expired
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-500 flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> Cancelled
                            </span>
                          )}
                        </div>
                        <h3 className="font-extrabold text-base lg:text-lg text-gray-900 truncate">{booking.courtName}</h3>
                        <p className="text-xs text-muted font-medium flex items-center gap-1.5">
                          <Clock className="icon-inline text-gray-400 shrink-0" />
                          {booking.date} · {booking.startTime} - {booking.endTime} ({booking.durationMinutes} Mins)
                        </p>
                        <p className="text-xs font-semibold text-gray-700">
                          Player: {booking.userName} ({booking.userPhone})
                        </p>
                      </div>
                    </div>

                    {/* Right Price & Actions */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 pt-4 sm:pt-0 border-t sm:border-t-0 border-gray-100 shrink-0">
                      <div className="text-left sm:text-right">
                        <span className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider block mb-0.5">Total Amount</span>
                        <span className="text-2xl font-black text-gray-900">EGP {booking.totalPrice}</span>
                      </div>

                      {(isConfirmed || isReserved) && (
                        <Button
                          onClick={() => handleCancel(booking.id, booking.bookingNumber)}
                          disabled={isCancelling}
                          variant="destructive"
                          size="sm"
                          className={`h-10 px-4 rounded-[var(--radius-md)] font-bold text-xs border border-red-200/80 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 transition-colors flex items-center gap-1.5 ${isCancelling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <XCircle className="icon-inline" />
                          <span>{isCancelling ? 'Cancelling…' : 'Cancel Booking'}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-[var(--radius-xl)] p-6 sm:p-12 text-center border border-gray-200 max-w-md mx-auto my-6">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                {activeTab === 'upcoming' ? (
                  <CalendarCheck className="w-5 h-5 text-gray-400" />
                ) : (
                  <History className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <h3 className="font-extrabold text-gray-900 text-base">
                No {activeTab === 'upcoming' ? 'Upcoming' : 'Past'} Bookings
              </h3>
              <p className="text-xs text-muted mt-1">
                {activeTab === 'upcoming'
                  ? "You don't have any upcoming reservations."
                  : "You don't have any past reservations yet."}
              </p>
            </div>
          )
        ) : (
          <div className="bg-white rounded-[var(--radius-xl)] p-6 sm:p-12 text-center border border-gray-200 max-w-md mx-auto my-8 sm:my-12">
            <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-extrabold text-gray-900 text-lg">No Reservations Yet</h3>
            <p className="text-xs text-muted mt-1">You haven&apos;t booked any courts. Explore available slots now</p>
            <Button
              render={<Link href="/book" />}
              nativeButton={false}
              variant="primary"
              size="pill"
              className="mt-6"
            >
              <CalendarCheck className="icon-btn" />
              <span>Book Your First Court</span>
            </Button>
          </div>
        )}
      </SiteContainer>
    </div>
  );
}
