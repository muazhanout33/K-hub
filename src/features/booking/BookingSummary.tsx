'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { useBookingStore } from './useBookingStore';
import { calculateBookingPrice, formatPrice } from '@/lib/pricing';
import { Sun, Users, Clock, CalendarDays } from 'lucide-react';
import { BookingCountdown } from './BookingCountdown';

import { to12Hour } from '@/lib/utils';

export function BookingSummary() {
  const selectedCourt = useBookingStore((s) => s.selectedCourt);
  const selectedDate = useBookingStore((s) => s.selectedDate);
  const selectedSlots = useBookingStore((s) => s.selectedSlots);

  const sortedSlots = useMemo(
    () => [...selectedSlots].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [selectedSlots]
  );

  if (!selectedCourt || sortedSlots.length === 0) return null;

  const durationMinutes = sortedSlots.length * 60;
  const totalPrice = calculateBookingPrice(selectedCourt.pricePerHour, durationMinutes);

  return (
    <div className="space-y-4">
      <BookingCountdown />

      <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-5 space-y-4">
        <h3 className="font-extrabold text-sm text-[#0F172A] uppercase tracking-wider">Booking Summary</h3>

        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">
            <Image
              src={selectedCourt.image}
              alt={selectedCourt.name}
              fill
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-sm text-[#0F172A] truncate">{selectedCourt.name}</h4>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-600 font-medium flex-wrap">
              <span className="flex items-center gap-1">
                <Sun className="w-3 h-3 text-amber-500" />
                {selectedCourt.isIndoor ? 'Indoor' : 'Outdoor'}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-gray-500" />
                {selectedCourt.capacity} Players
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Date
            </span>
            <span className="font-bold text-[#0F172A]">{selectedDate}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Time
            </span>
            <span className="font-bold text-[#0F172A]">
              {to12Hour(sortedSlots[0].startTime)} – {to12Hour(sortedSlots[sortedSlots.length - 1].endTime)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Duration</span>
            <span className="font-bold text-[#0F172A]">{durationMinutes} mins</span>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total</span>
            <span className="text-2xl font-black text-[#0F172A]">EGP {formatPrice(totalPrice)}</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5 text-right">
            EGP {selectedCourt.pricePerHour}/hr × {sortedSlots.length}h
          </p>
        </div>
      </div>
    </div>
  );
}
