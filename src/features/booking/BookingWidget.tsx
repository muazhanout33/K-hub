'use client';

import { useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Users, Sun } from 'lucide-react';
import { useBookingStore } from './useBookingStore';
import { calculateBookingPrice } from '@/lib/pricing';
import { BookingSteps } from './BookingSteps';
import DaySelector from './DaySelector';
import { generateTimeSlots } from '@/services/booking.service';
import { formatDisplayDate, MAX_BOOKING_HOURS } from '@/lib/dates';
import { to12Hour } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { createClient } from '@/lib/supabase/client';

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

  useEffect(() => {
    if (maxHoursReachedTick > 0) {
      toast.error(`Maximum booking duration is ${MAX_BOOKING_HOURS} hours. Please deselect a slot first.`);
    }
  }, [maxHoursReachedTick]);

  // Supabase Realtime subscription for live court availability
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
          // Toast subtle alert when availability changes live
          toast.info('Court availability updated live.', { duration: 2000 });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedCourt]);

  const rawSlots = useMemo(() => {
    if (!selectedCourt) return [];
    return generateTimeSlots(selectedCourt, selectedDate, selectedCourt.pricePerHour, bookings);
  }, [selectedCourt, selectedDate, bookings]);

  const displaySlots = useMemo(
    () => rawSlots.map((s) => ({ timeRange: `${to12Hour(s.startTime)} – ${to12Hour(s.endTime)}`, status: s.status })),
    [rawSlots]
  );

  const handleSlotToggle = (idx: number) => {
    const slot = rawSlots[idx];
    toggleSlot(slot);
  };

  const handleContinue = () => {
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

    startTemporaryReservation();
    setBookingStep(3);
    router.push('/book/details');
  };

  const isSelected = (idx: number) => selectedSlots.some((s) => s.id === rawSlots[idx]?.id);

  if (!selectedCourt) {
    return (
      <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-2xl mx-auto text-center">
        <h2 className="font-extrabold text-2xl text-[#0F172A]">Book Your Court</h2>
        <p className="text-gray-500 text-sm">No court selected. Choose a court to continue.</p>
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
    <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-2xl mx-auto">

      <h2 className="font-extrabold text-2xl text-[#0F172A]">Book Your Court</h2>

      <BookingSteps />

      <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
            <h3 className="font-bold text-sm text-[#0F172A] line-clamp-1">{selectedCourt.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-600 font-medium flex-wrap">
              <span className="flex items-center gap-1">
                <Sun className="w-3 h-3 text-amber-500" />
                {selectedCourt.isIndoor ? 'Indoor' : 'Outdoor'}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-gray-500" />
                {selectedCourt.capacity} Players
              </span>
              <span className="font-bold text-[#0F172A]">EGP {selectedCourt.pricePerHour}/hr</span>
            </div>
          </div>
       </div>

        <Button
          onClick={() => toast.info('Selecting alternative court...')}
          variant="outline"
          size="sm"
          className="shrink-0 self-start sm:self-auto"
        >
          Change Court
       </Button>
     </div>

      {/* Day Selector */}
      <div>
        <label className="block text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-2">
          Select Date
        </label>
        <DaySelector selectedDate={selectedDate} onSelectDate={selectDate} />
      </div>

      <div>
        <h3 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-4">
          Available {formatDisplayDate(selectedDate)} {selectedSlots.length > 0 && <span className="text-green-600">({selectedSlots.length} selected)</span>}
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 w-full">
          {displaySlots.map((slot, idx) => {
            const selected = isSelected(idx);
            const isBooked = slot.status === 'Booked';
            const isPast = slot.status === 'Past';
            const isBlocked = slot.status === 'Blocked';

            let btnStyle = 'slot-available';
            if (selected) btnStyle = 'slot-selected';
            else if (isBooked) btnStyle = 'slot-booked';
            else if (isPast || isBlocked) btnStyle = 'slot-booked';

            return (
              <button
                key={slot.timeRange}
                onClick={() => handleSlotToggle(idx)}
                disabled={isBooked || isPast || isBlocked}
                className={`w-full py-3 rounded-xl text-[12px] font-bold transition-all text-center ${btnStyle}`}
              >
                {slot.timeRange}
                {isPast && <span className="block text-[9px] mt-0.5 opacity-70">Past</span>}
                {isBlocked && <span className="block text-[9px] mt-0.5 opacity-70">Blocked</span>}
             </button>
           );
         })}
        </div>
      </div>

      <div className="pt-2 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-gray-600">
          <span className="flex items-center gap-1.5 leading-none">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A] inline-block" /> Available
         </span>
          <span className="flex items-center gap-1.5 leading-none">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Starting Soon
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
            <div className="bg-green-50 rounded-2xl p-4 border border-green-200/80 w-full">
              <p className="text-xs font-bold text-green-800 uppercase tracking-wider">Selected Booking</p>
              <p className="text-lg font-black text-green-900 mt-1">{selectedSlots.length} Hour{selectedSlots.length > 1 ? 's' : ''}</p>
              <p className="text-sm font-semibold text-green-700">
                {to12Hour(firstSlot.startTime)} → {to12Hour(lastSlot.endTime)}
              </p>
              <div className="border-t border-green-200/60 mt-3 pt-3">
                <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Total</p>
                <p className="text-xl font-black text-green-900">EGP {total}</p>
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
