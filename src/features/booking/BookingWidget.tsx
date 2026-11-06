'use client';

import { useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Users, Sun, RefreshCw } from 'lucide-react';
import { useBookingStore } from './useBookingStore';
import { calculateBookingPrice } from '@/lib/pricing';
import { BookingSteps } from './BookingSteps';
import DaySelector from './DaySelector';
import { generateTimeSlots } from '@/services/booking.service';
import { formatDisplayDate, MAX_BOOKING_HOURS } from '@/lib/dates';
import { to12Hour } from '@/lib/utils';
import { isHoldActive } from '@/lib/availability';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { createClient } from '@/lib/supabase/client';
import { useAllBookingsForDate } from '@/hooks/useAllBookingsForDate';
import { Booking } from '@/types';

export function BookingWidget() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const selectedCourt = useBookingStore((s) => s.selectedCourt);
  const selectedDate = useBookingStore((s) => s.selectedDate);
  const bookings = useBookingStore((s) => s.bookings);
  const selectedSlots = useBookingStore((s) => s.selectedSlots);
  const toggleSlot = useBookingStore((s) => s.toggleSlot);
  const selectDate = useBookingStore((s) => s.selectDate);
  const setBookingStep = useBookingStore((s) => s.setBookingStep);
  const startTemporaryReservation = useBookingStore((s) => s.startTemporaryReservation);
  const maxHoursReachedTick = useBookingStore((s) => s.maxHoursReachedTick);
  const nonConsecutiveSlotTick = useBookingStore((s) => s.nonConsecutiveSlotTick);

  // Cross-user live availability from Supabase
  const { bookings: publicBookings, loading, error, refetch } = useAllBookingsForDate(selectedDate);

  const effectiveBookings = useMemo(() => {
    const map = new Map<string, Booking>();
    // 1. Authoritative public bookings from Supabase
    for (const b of publicBookings) {
      map.set(b.id, b);
    }
    // 2. Add or merge local store bookings
    for (const b of bookings) {
      const existing = map.get(b.id);
      if (existing) {
        if (b.userId && (!existing.userId || existing.userId === b.userId)) {
          map.set(b.id, { ...existing, userId: b.userId, isOwn: true });
        }
      } else {
        map.set(b.id, { ...b, isOwn: user?.id ? b.userId === user.id : false });
      }
    }
    return Array.from(map.values());
  }, [publicBookings, bookings, user?.id]);

  useEffect(() => {
    if (maxHoursReachedTick > 0) {
      toast.error(`Maximum booking duration is ${MAX_BOOKING_HOURS} hours. Please deselect a slot first.`);
    }
  }, [maxHoursReachedTick]);

  useEffect(() => {
    if (nonConsecutiveSlotTick > 0) {
      toast.error('Selected time slots must be consecutive hours. Please select an adjacent slot or deselect first.');
    }
  }, [nonConsecutiveSlotTick]);

  // Realtime subscription for live court availability (broadcast + DB events)
  useEffect(() => {
    if (!selectedCourt) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`court-availability-${selectedCourt.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `court_id=eq.${selectedCourt.id}`,
        },
        () => {
          void refetch();
          toast.info('Court availability updated live.', { duration: 2000 });
        }
      )
      .on('broadcast', { event: 'availability-change' }, (payload) => {
        const cId = payload?.payload?.courtId;
        if (!cId || cId === 'all' || cId === selectedCourt.id) {
          void refetch();
          toast.info('Court availability updated live.', { duration: 2000 });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedCourt, refetch]);

  // Deselect if another player books or reserves one of currently selected slots in real time
  useEffect(() => {
    if (selectedSlots.length === 0 || !selectedCourt) return;
    const bookedSlotIds = new Set<string>();
    for (const b of effectiveBookings) {
      // Ignore the current user's own bookings and holds — only another player's booking is a conflict
      if (b.isOwn || (user?.id && b.userId === user.id)) {
        continue;
      }

      if (
        b.courtId === selectedCourt.id &&
        b.date === selectedDate &&
        (b.status === 'Confirmed' || (b.status === 'Reserved' && isHoldActive(b)))
      ) {
        if (b.selectedSlotIds && b.selectedSlotIds.length > 0) {
          for (const sId of b.selectedSlotIds) {
            bookedSlotIds.add(sId);
          }
        } else if (b.startTime && b.endTime) {
          const [startH] = b.startTime.split(':').map(Number);
          const [endH] = b.endTime.split(':').map(Number);
          if (startH < endH) {
            for (let h = startH; h < endH; h++) {
              bookedSlotIds.add(`slot-${selectedCourt.id}-${selectedDate}-${String(h).padStart(2, '0')}:00`);
            }
          } else if (endH < startH) {
            for (let h = startH; h < 24; h++) {
              bookedSlotIds.add(`slot-${selectedCourt.id}-${selectedDate}-${String(h).padStart(2, '0')}:00`);
            }
            for (let h = 0; h < endH; h++) {
              bookedSlotIds.add(`slot-${selectedCourt.id}-${selectedDate}-${String(h).padStart(2, '0')}:00`);
            }
          }
        }
      }
    }

    const conflicting = selectedSlots.filter((s) => bookedSlotIds.has(s.id));
    if (conflicting.length > 0) {
      for (const slot of conflicting) {
        toggleSlot(slot);
      }
      toast.error('A slot you selected was just booked by another player.');
    }
  }, [effectiveBookings, selectedCourt, selectedDate, selectedSlots, toggleSlot, user?.id]);

  const rawSlots = useMemo(() => {
    if (!selectedCourt) return [];
    return generateTimeSlots(selectedCourt, selectedDate, selectedCourt.pricePerHour, effectiveBookings, user?.id);
  }, [selectedCourt, selectedDate, effectiveBookings, user?.id]);

  const displaySlots = useMemo(
    () => rawSlots.map((s) => ({
      timeRange: `${to12Hour(s.startTime)} – ${to12Hour(s.endTime)}`,
      status: s.status,
      isOwn: s.isOwn,
    })),
    [rawSlots]
  );

  const handleSlotToggle = (idx: number) => {
    const slot = rawSlots[idx];
    toggleSlot(slot);
  };

  const handleContinue = async () => {
    if (selectedSlots.length === 0) {
      toast.error('Please select at least one time slot before continuing.');
      return;
    }

    // Guests cannot book — must sign in first
    if (!user) {
      toast.info('Please sign in to book a court.');
      router.push('/auth/login');
      return;
    }

    // Pre-populate user details from auth profile if not already set
    const store = useBookingStore.getState();
    if (!store.userName && user.name) {
      store.setUserDetails({
        userName: user.name,
        userEmail: user.email,
        userPhone: user.phone || '',
      });
    }

    // Establish active temporary hold in Supabase so other users immediately see the slot as unavailable
    const holdResult = await store.confirmBooking();
    if (!holdResult.success) {
      toast.error(holdResult.error || 'This court slot has already been booked by another player.');
      // Clear conflicting slots from local store so user is not stuck with an invalid selection
      store.clearSelectedSlots();
      // Immediately refetch availability so the conflicting slot updates on screen
      await refetch();
      return;
    }

    startTemporaryReservation();
    setBookingStep(3);
    router.push('/book/details');
  };

  const isSelected = (idx: number) => selectedSlots.some((s) => s.id === rawSlots[idx]?.id);

  if (!selectedCourt) {
    return (
      <div className="bg-white dark:bg-[#1D2821] rounded-[24px] border border-[#E2E8F0] dark:border-[#344239] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-2xl mx-auto text-center">
        <h2 className="font-extrabold text-2xl text-[#0F172A] dark:text-[#F5F7F5]">Book Your Court</h2>
        <p className="text-gray-500 dark:text-[#8A9A8E] text-sm">No court selected. Choose a court to continue.</p>
        <Button
          render={<Link href="/courts" />}
          nativeButton={false}
          variant="primary"
          size="md"
        >
          Browse Courts
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1D2821] rounded-[24px] border border-[#E2E8F0] dark:border-[#344239] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-2xl mx-auto">

      <h2 className="font-extrabold text-2xl text-[#0F172A] dark:text-[#F5F7F5]">Book Your Court</h2>

      <BookingSteps />

      <div className="rounded-2xl border border-gray-100 dark:border-[#344239] bg-gray-50/70 dark:bg-[#171F1A] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">
            <Image
              src={selectedCourt.image}
              alt={selectedCourt.name}
              fill
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-[#0F172A] dark:text-[#F5F7F5] line-clamp-1">{selectedCourt.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-600 dark:text-[#A1ADA4] font-medium flex-wrap">
              <span className="flex items-center gap-1">
                <Sun className="w-3 h-3 text-amber-500" />
                {selectedCourt.isIndoor ? 'Indoor' : 'Outdoor'}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-gray-500 dark:text-[#8A9A8E]" />
                {selectedCourt.capacity} Players
              </span>
              <span className="font-bold text-[#0F172A] dark:text-[#F5F7F5]">EGP {selectedCourt.pricePerHour}/hr</span>
            </div>
          </div>
       </div>

        <Button
          render={<Link href="/courts" />}
          nativeButton={false}
          variant="outline"
          size="sm"
          className="shrink-0 self-start sm:self-auto"
        >
          Change Court
       </Button>
     </div>

      {/* Day Selector */}
      <div>
        <label className="block text-xs font-extrabold text-gray-700 dark:text-[#A1ADA4] uppercase tracking-wider mb-2">
          Select Date
        </label>
        <DaySelector selectedDate={selectedDate} onSelectDate={selectDate} />
      </div>

      <div>
        <h3 className="text-xs font-extrabold text-gray-700 dark:text-[#A1ADA4] uppercase tracking-wider mb-4">
          Available {formatDisplayDate(selectedDate)} {selectedSlots.length > 0 && <span className="text-green-600 dark:text-[#4ADE80]">({selectedSlots.length} selected)</span>}
        </h3>
        {loading && effectiveBookings.length === 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 w-full">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="w-full h-12 rounded-xl bg-gray-100 dark:bg-[#171F1A] animate-pulse" />
            ))}
          </div>
        ) : error && effectiveBookings.length === 0 ? (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-center space-y-2">
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
            <Button onClick={() => void refetch()} variant="outline" size="sm">
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 w-full">
            {displaySlots.map((slot, idx) => {
              const selected = isSelected(idx);
              const isBooked = slot.status === 'Booked';
              const isReserved = slot.status === 'Reserved';
              const isPast = slot.status === 'Past';
              const isBlocked = slot.status === 'Blocked';
              const isUnavailable = isBooked || isReserved || isPast || isBlocked;

              let btnStyle = 'slot-available';
              if (selected) btnStyle = 'slot-selected';
              else if (isBooked) btnStyle = 'slot-booked';
              else if (isReserved) btnStyle = 'slot-reserved';
              else if (isPast || isBlocked) btnStyle = 'slot-booked';

              return (
                <button
                  key={slot.timeRange}
                  onClick={() => handleSlotToggle(idx)}
                  disabled={isUnavailable}
                  aria-disabled={isUnavailable}
                  className={`w-full py-3 rounded-xl text-[12px] font-bold transition-all text-center ${btnStyle}`}
                >
                  {slot.timeRange}
                  {isReserved && (
                    <span className="block text-[9px] mt-0.5 opacity-90 uppercase font-extrabold text-amber-700 dark:text-amber-400">
                      {slot.isOwn ? 'Reserved by You' : 'Reserved'}
                    </span>
                  )}
                  {isBooked && (
                    <span className="block text-[9px] mt-0.5 opacity-90 uppercase font-extrabold text-red-700 dark:text-red-400">
                      {slot.isOwn ? 'Booked by You' : 'Booked'}
                    </span>
                  )}
                  {isPast && <span className="block text-[9px] mt-0.5 opacity-70">Past</span>}
                  {isBlocked && <span className="block text-[9px] mt-0.5 opacity-70">Blocked</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-2 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-gray-600 dark:text-[#A1ADA4]">
          <span className="flex items-center gap-1.5 leading-none">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A] inline-block" /> Available
          </span>
          <span className="flex items-center gap-1.5 leading-none">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Reserved (Locked)
          </span>
          <span className="flex items-center gap-1.5 leading-none">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] inline-block" /> Booked
          </span>
          <span className="flex items-center gap-1.5 leading-none">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" /> Past / Blocked
          </span>
        </div>

        {selectedSlots.length > 0 && (() => {
          const sorted = [...selectedSlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
          const firstSlot = sorted[0];
          const lastSlot = sorted[sorted.length - 1];
          const durationMinutes = selectedSlots.length * 60;
          const total = calculateBookingPrice(selectedCourt.pricePerHour, durationMinutes);

          return (
            <div className="bg-green-50 dark:bg-green-950/30 rounded-2xl p-4 border border-green-200/80 dark:border-green-800/40 w-full">
              <p className="text-xs font-bold text-green-800 dark:text-green-300 uppercase tracking-wider">Selected Booking</p>
              <p className="text-lg font-black text-green-900 dark:text-[#F5F7F5] mt-1">{selectedSlots.length} Hour{selectedSlots.length > 1 ? 's' : ''}</p>
              <p className="text-sm font-semibold text-green-700 dark:text-[#4ADE80]">
                {to12Hour(firstSlot.startTime)} → {to12Hour(lastSlot.endTime)}
              </p>
              <div className="border-t border-green-200/60 dark:border-green-800/40 mt-3 pt-3">
                <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">Total</p>
                <p className="text-xl font-black text-green-900 dark:text-[#F5F7F5]">EGP {total}</p>
              </div>
            </div>
          );
        })()}

        <Button
          onClick={handleContinue}
          variant="primary"
          size="md"
          className="w-full sm:w-auto px-8"
        >
          Continue
        </Button>
      </div>
   </div>
  );
}
