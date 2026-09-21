'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { getCourtsFromSupabase } from '@/services/court.service';
import { generateTimeSlots } from '@/services/booking.service';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { useAllBookingsForDate } from '@/hooks/useAllBookingsForDate';
import { getToday, formatDisplayDate } from '@/lib/dates';
import DaySelector from '@/features/booking/DaySelector';
import { Button } from '@/components/ui/button';
import { FilterChips } from '@/components/ui/FilterChips';
import { Court } from '@/types';

const TIMELINE_HOURS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];

export function LiveAvailabilitySection() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedSport, setSelectedSport] = useState<string>('All');
  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const selectCourt = useBookingStore((state) => state.selectCourt);
  const { bookings } = useAllBookingsForDate(selectedDate);

  useEffect(() => {
    getCourtsFromSupabase().then((data) => setCourts(data));
  }, []);

  const filteredCourts = courts.filter((c) =>
    selectedSport === 'All' ? true : c.sportType === selectedSport
  );

  const courtSlots = useMemo(() => {
    const map: Record<string, ReturnType<typeof generateTimeSlots>> = {};
    for (const court of filteredCourts) {
      map[court.id] = generateTimeSlots(court, selectedDate, court.pricePerHour, bookings);
    }
    return map;
  }, [filteredCourts, selectedDate, bookings]);

  return (
    <section className="surface-card p-6 sm:p-8 w-full">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div className="section-head mb-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[var(--radius-pill)] bg-green-50 border border-green-200 text-green-700 text-xs font-bold uppercase tracking-wider w-fit">
            <span className="w-2 h-2 rounded-full bg-green-600 animate-ping" />
            Live Real-Time Schedule
          </div>
          <h2 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Available {formatDisplayDate(selectedDate)}</h2>
          <p className="text-sm text-muted">
            Real-time court status. Green indicates free time slots ready for instant 10-minute lock.
          </p>
        </div>

        <FilterChips
          options={['All', 'Padel', 'Football', 'Tennis']}
          value={selectedSport}
          onChange={setSelectedSport}
          className="self-start md:self-auto shrink-0"
        />
      </div>

      {/* Day Selector */}
      <div className="mb-6">
        <DaySelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      </div>

      {/* Legend — dots vertically centered with labels */}
      <div className="flex flex-wrap items-center gap-6 mb-6 text-xs font-semibold text-muted pb-4 border-b border-gray-100">
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500 ring-2 ring-green-200 shrink-0" />
          Available (Free)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-500 ring-2 ring-orange-200 shrink-0" />
          Starts Soon (&lt; 30m)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 ring-2 ring-red-200 shrink-0" />
          Booked / Reserved
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-gray-400 ring-2 ring-gray-200 shrink-0" />
          Past / Blocked
        </span>
      </div>

      {/* Timeline Rows */}
      <div className="space-y-4">
        {filteredCourts.map((court) => {
          const slots = courtSlots[court.id] || [];
          const slotMap = Object.fromEntries(slots.map((s) => [s.startTime, s.status]));

          return (
            <div
              key={court.id}
              className="p-5 rounded-[var(--radius-lg)] bg-gray-50/70 border border-gray-200/60 hover:bg-gray-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="md:w-56 lg:w-64 shrink-0">
                <span className="font-bold text-gray-900 text-sm block">{court.name}</span>
                <p className="text-xs text-muted mt-0.5">
                  {court.sportType} · EGP {court.pricePerHour}/hr
                </p>
              </div>

              <div className="flex-1 min-w-0 overflow-x-auto py-1">
                <div className="flex items-center gap-2 min-w-[580px]">
                  {TIMELINE_HOURS.map((time) => {
                    const status = slotMap[time] || 'Available';
                    const isBooked = status === 'Booked';
                    const isReserved = status === 'Reserved';
                    const isPast = status === 'Past';
                    const isBlocked = status === 'Blocked';
                    const isUnavailable = isBooked || isReserved || isPast || isBlocked;

                    return (
                      <div
                        key={time}
                        className={`min-w-[76px] flex-1 py-2.5 px-2 rounded-[var(--radius-sm)] border flex flex-col items-center justify-center gap-1 transition-all ${
                          isUnavailable
                            ? 'bg-red-50/80 border-red-200 text-red-700'
                            : 'bg-white border-green-200 text-gray-900 hover:border-green-600 hover:shadow-xs cursor-pointer'
                        }`}
                      >
                        <span className="text-[13px] font-bold tracking-tight leading-none">{time}</span>
                        <span
                          className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-[var(--radius-xs)] leading-none ${
                            isUnavailable
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {isBooked ? 'Booked' : isReserved ? 'Reserved' : isPast ? 'Past' : isBlocked ? 'Blocked' : 'Free'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button
                render={<Link href="/book" onClick={() => selectCourt(court)} />}
                nativeButton={false}
                variant="primary"
                size="sm"
                className="shrink-0 min-w-[96px] max-w-full"
              >
                <CalendarCheck />
                <span>Reserve</span>
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
