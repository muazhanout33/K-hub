'use client';

import { useMemo } from 'react';
import { TimeSlot } from '@/types';
import { useBookingStore } from './useBookingStore';
import { calculateBookingPrice } from '@/lib/pricing';
import { toast } from 'sonner';
import { to12Hour } from '@/lib/utils';

interface TimeSlotsGridProps {
  slots: TimeSlot[];
  /** Optional date label shown in the header */
  dateLabel?: string;
}

export function TimeSlotsGrid({ slots, dateLabel }: TimeSlotsGridProps) {
  const selectedSlots = useBookingStore((s) => s.selectedSlots);
  const toggleSlot = useBookingStore((s) => s.toggleSlot);
  const selectedCourt = useBookingStore((s) => s.selectedCourt);

  const sortedSlots = useMemo(
    () => [...selectedSlots].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [selectedSlots]
  );

  const handleSlotClick = (slot: TimeSlot) => {
    if (slot.status === 'Booked') {
      toast.error('This slot has already been booked by another member.');
      return;
    }
    if (slot.status === 'Reserved') {
      toast.error('This time slot is temporarily locked by another user.');
      return;
    }
    if (slot.status === 'Past') {
      toast.error('This time slot has already passed.');
      return;
    }
    if (slot.status === 'Blocked') {
      toast.error('This time slot is currently blocked.');
      return;
    }

    toggleSlot(slot);
  };

  const isSelected = (slot: TimeSlot) => selectedSlots.some((s) => s.id === slot.id);

  const bookingHours = sortedSlots.length;
  const durationMinutes = bookingHours * 60;
  const bookingTotal = selectedCourt ? calculateBookingPrice(selectedCourt.pricePerHour, durationMinutes) : 0;

  const headerText = dateLabel || 'Available Slots';

  return (
    <div className="space-y-6">
      {sortedSlots.length > 0 && (
        <div className="bg-green-50 rounded-2xl p-4 border border-green-200/80">
          <p className="text-xs font-bold text-green-800 uppercase tracking-wider">Selected Booking</p>
          <p className="text-lg font-black text-green-900 mt-1">{bookingHours} Hour{bookingHours > 1 ? 's' : ''}</p>
          <p className="text-sm font-semibold text-green-700">
            {to12Hour(sortedSlots[0].startTime)} → {to12Hour(sortedSlots[sortedSlots.length - 1].endTime)}
          </p>
          <div className="border-t border-green-200/60 mt-3 pt-3">
            <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Total</p>
            <p className="text-xl font-black text-green-900">EGP {bookingTotal}</p>
          </div>
        </div>
      )}

      <h3 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">{headerText}</h3>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-gray-600">
        <span className="flex items-center gap-2 leading-none">
          <span className="w-3 h-3 rounded-full bg-green-100 border-2 border-green-600 inline-block" /> Available
       </span>
        <span className="flex items-center gap-2 leading-none">
          <span className="w-3 h-3 rounded-full bg-green-700 inline-block" /> Selected
       </span>
        <span className="flex items-center gap-2 leading-none">
          <span className="w-3 h-3 rounded-full bg-amber-100 border border-amber-300 inline-block" /> Reserved (Locked)
       </span>
        <span className="flex items-center gap-2 leading-none">
          <span className="w-3 h-3 rounded-full bg-red-100 border border-red-300 inline-block" /> Booked
       </span>
        <span className="flex items-center gap-2 leading-none">
          <span className="w-3 h-3 rounded-full bg-gray-100 border border-gray-300 inline-block" /> Past / Blocked
       </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {slots.map((slot) => {
          const selected = isSelected(slot);
          const isBooked = slot.status === 'Booked';
          const isReserved = slot.status === 'Reserved';
          const isPast = slot.status === 'Past';
          const isBlocked = slot.status === 'Blocked';

          let btnStyle = 'slot-available';
          if (selected) btnStyle = 'slot-selected';
          else if (isBooked) btnStyle = 'slot-booked';
          else if (isReserved) btnStyle = 'slot-reserved';
          else if (isPast || isBlocked) btnStyle = 'slot-booked';

          return (
            <button
              key={slot.id}
              onClick={() => handleSlotClick(slot)}
              disabled={isBooked || isReserved || isPast || isBlocked}
              className={`w-full min-w-0 px-3 py-3 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-center font-mono transition-all ${btnStyle}`}
            >
              <span className="text-xs font-bold leading-tight">
                {to12Hour(slot.startTime)} – {to12Hour(slot.endTime)}
             </span>
              <span className="text-[11px] font-sans font-bold mt-0.5">
                EGP {slot.price}
              </span>
              {(isPast || isBlocked) && (
                <span className="text-[9px] font-sans opacity-70 mt-0.5">
                  {isPast ? 'Past' : 'Blocked'}
                </span>
              )}
           </button>
          );
        })}
      </div>
   </div>
  );
}
