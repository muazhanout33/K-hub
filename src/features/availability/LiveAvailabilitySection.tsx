'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, CalendarCheck, ChevronDown } from 'lucide-react';
import { getCourtsFromSupabase } from '@/services/court.service';
import { generateTimeSlots } from '@/services/booking.service';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { useAllBookingsForDate } from '@/hooks/useAllBookingsForDate';
import {
  getToday,
  formatDisplayDate,
  generateCalendarDays,
  type CalendarDay,
} from '@/lib/dates';
import { to12Hour } from '@/lib/utils';
import DaySelector from '@/features/booking/DaySelector';
import { Button } from '@/components/ui/button';
import { FilterChips } from '@/components/ui/FilterChips';
import { Court, TimeSlot } from '@/types';

/** Quick-access strip length. The full calendar (DaySelector) still exposes
 *  every generated day through the toggle below — nothing is truncated. */
const QUICK_STRIP_DAYS = 14;

export function LiveAvailabilitySection() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loadingCourts, setLoadingCourts] = useState(true);
  const [selectedSport, setSelectedSport] = useState<string>('All');
  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [expandedCourtIds, setExpandedCourtIds] = useState<Set<string>>(new Set());

  const selectCourt = useBookingStore((state) => state.selectCourt);
  const toggleSlot = useBookingStore((state) => state.toggleSlot);
  const selectedSlots = useBookingStore((state) => state.selectedSlots);
  const { bookings } = useAllBookingsForDate(selectedDate);
  const router = useRouter();

  useEffect(() => {
    getCourtsFromSupabase()
      .then((data) => setCourts(data))
      .catch(() => {
        // Keep the empty state — never fabricate courts.
      })
      .finally(() => setLoadingCourts(false));
  }, []);

  // ── Dates ──
  // Flat list of every calendar day (today → end of next month, Cairo TZ).
  const allDays = useMemo(() => generateCalendarDays().flatMap((m) => m.days), []);
  const quickDays = allDays.slice(0, QUICK_STRIP_DAYS);
  const selectedDay = allDays.find((d) => d.date === selectedDate);

  // ── Courts + real availability ──
  const filteredCourts = useMemo(
    () =>
      courts
        .filter((c) => (selectedSport === 'All' ? true : c.sportType === selectedSport))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [courts, selectedSport],
  );

  const courtSlots = useMemo(() => {
    const map: Record<string, ReturnType<typeof generateTimeSlots>> = {};
    for (const court of filteredCourts) {
      map[court.id] = generateTimeSlots(court, selectedDate, court.pricePerHour, bookings);
    }
    return map;
  }, [filteredCourts, selectedDate, bookings]);

  const freeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const court of filteredCourts) {
      const slots = courtSlots[court.id] || [];
      counts[court.id] = slots.filter((s) => s.status === 'Available').length;
    }
    return counts;
  }, [courtSlots, filteredCourts]);

  const toggleCourtExpanded = (courtId: string) => {
    setExpandedCourtIds((prev) => {
      const next = new Set(prev);
      if (next.has(courtId)) next.delete(courtId);
      else next.add(courtId);
      return next;
    });
  };

  /**
   * Selecting a free slot uses the EXISTING booking store flow:
   * `toggleSlot` starts/extends the standard 10-minute reservation hold and
   * the /book flow takes over exactly as it does today. No second hold system.
   */
  const handleSlotSelect = (court: Court, slot: TimeSlot) => {
    selectCourt(court);
    toggleSlot(slot);
    router.push('/book');
  };

  return (
    <section className="surface-card p-5 sm:p-8 w-full">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="section-head mb-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[var(--radius-pill)] bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/60 dark:border-green-800 dark:text-green-400 text-xs font-bold uppercase tracking-wider w-fit">
            <span className="w-2 h-2 rounded-full bg-green-600 dark:bg-[#4ADE80] animate-pulse" />
            Live Real-Time Schedule
          </div>
          <h2 className="text-xl sm:text-3xl font-extrabold text-gray-900 dark:text-[#F5F7F5] tracking-tight">
            Available {formatDisplayDate(selectedDate)}
          </h2>
          <p className="text-sm text-muted">
            Pick a date, expand a court, and tap a free slot to lock it for 10 minutes.
          </p>
        </div>

        <FilterChips
          options={['All', 'Padel', 'Football', 'Tennis']}
          value={selectedSport}
          onChange={setSelectedSport}
          className="self-start md:self-auto shrink-0 max-w-full"
        />
      </div>

      {/* ── Date-first selector ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-[#8A9A8E] inline-flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            Pick a date
          </p>
          <p className="text-[11px] font-semibold text-gray-500 dark:text-[#8A9A8E]">
            {selectedDay ? selectedDay.dayFullName : ''}
          </p>
        </div>

        {/* Quick strip — today + next 13 days. Intentional horizontal scroll. */}
        <div
          className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
          role="group"
          aria-label="Quick date selection, next 14 days"
        >
          {quickDays.map((d: CalendarDay) => {
            const isSelected = d.date === selectedDate;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelectedDate(d.date)}
                aria-pressed={isSelected}
                className={`flex flex-col items-center justify-center min-w-[54px] sm:min-w-[64px] py-2.5 px-2 rounded-xl border-2 shrink-0 transition-colors ${
                  isSelected
                    ? 'border-[var(--primary)] bg-[var(--primary)] text-white dark:text-[#101512] shadow-md'
                    : 'border-gray-200 dark:border-[#344239] bg-white dark:bg-[#171F1A] hover:border-[var(--primary)] text-gray-700 dark:text-[#F5F7F5]'
                }`}
              >
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide ${
                    isSelected ? 'text-white/80 dark:text-[#101512]/70' : 'text-gray-500 dark:text-[#8A9A8E]'
                  }`}
                >
                  {d.isToday ? 'Today' : d.dayName}
                </span>
                <span className="text-base font-bold leading-snug">{d.dayNumber}</span>
                <span
                  className={`text-[9px] ${
                    isSelected ? 'text-white/80 dark:text-[#101512]/70' : 'text-gray-400 dark:text-[#8A9A8E]'
                  }`}
                >
                  {d.monthName}
                </span>
              </button>
            );
          })}
        </div>

        {/* Full calendar toggle — the DaySelector keeps the complete 60-day period. */}
        <button
          type="button"
          onClick={() => setShowFullCalendar((v) => !v)}
          aria-expanded={showFullCalendar}
          aria-controls="availability-full-calendar"
          className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-[#4ADE80] hover:text-green-800 dark:hover:text-green-300 py-2 min-h-[44px] transition-colors"
        >
          <CalendarDays className="w-4 h-4" />
          <span>{showFullCalendar ? 'Hide full calendar' : 'Browse all dates'}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${showFullCalendar ? 'rotate-180' : ''}`}
          />
        </button>

        {showFullCalendar && (
          <div id="availability-full-calendar" className="mt-1 mb-4">
            <DaySelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-5 text-xs font-semibold text-muted pb-4 border-b border-gray-100 dark:border-[#26332A]">
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500 ring-2 ring-green-200 dark:ring-green-900 shrink-0" />
          Free
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-500 ring-2 ring-orange-200 dark:ring-orange-900 shrink-0" />
          Starts Soon (&lt; 30m)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 ring-2 ring-red-200 dark:ring-red-900 shrink-0" />
          Booked / Reserved
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-gray-400 ring-2 ring-gray-200 dark:ring-[#344239] shrink-0" />
          Past / Blocked
        </span>
      </div>

      {/* ── Loading state ── */}
      {loadingCourts && (
        <div className="space-y-3" aria-live="polite">
          <p className="text-sm text-muted px-1">Loading live schedule…</p>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[76px] rounded-[var(--radius-lg)] bg-gray-100 dark:bg-[#1D2821] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* ── Empty states ── */}
      {!loadingCourts && courts.length === 0 && (
        <p className="text-sm text-muted">Court scheduling data is unavailable right now. Please check back shortly.</p>
      )}
      {!loadingCourts && courts.length > 0 && filteredCourts.length === 0 && (
        <p className="text-sm text-muted">No {selectedSport.toLowerCase()} courts available. Try another sport.</p>
      )}

      {/* ── Expandable court cards ── */}
      {!loadingCourts && filteredCourts.length > 0 && (
        <div className="space-y-3">
          {filteredCourts.map((court) => {
            const slots = courtSlots[court.id] || [];
            const freeCount = freeCounts[court.id] ?? 0;
            const isExpanded = expandedCourtIds.has(court.id);
            const allUnavailable = slots.length > 0 && freeCount === 0;

            return (
              <div
                key={court.id}
                className="rounded-[var(--radius-lg)] border border-gray-200/70 dark:border-[#344239]/70 bg-gray-50/70 dark:bg-[#1D2821]/70 overflow-hidden transition-colors hover:border-gray-300 dark:hover:border-[#4B5E52]"
              >
                {/* Card header — button collapses/expands the slot grid */}
                <button
                  type="button"
                  onClick={() => toggleCourtExpanded(court.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`court-slots-${court.id}`}
                  className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-gray-100/70 dark:hover:bg-[#26332A]/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          allUnavailable
                            ? 'bg-gray-400'
                            : freeCount > 0
                              ? 'bg-green-500'
                              : ''
                        }`}
                        aria-hidden="true"
                      />
                      <span className="font-bold text-gray-900 dark:text-[#F5F7F5] text-sm truncate">
                        {court.name}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-1 truncate">
                      {court.sportType}
                      {court.isIndoor !== undefined && (court.isIndoor ? ' · Indoor' : ' · Outdoor')}
                      {' · '}EGP {court.pricePerHour}/hr
                    </p>
                  </div>

                  <span
                    className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-extrabold ${
                      freeCount > 0
                        ? 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-[#171F1A] dark:text-[#A1ADA4]'
                    }`}
                  >
                    {allUnavailable ? 'Fully Booked' : `${freeCount} Free`}
                  </span>

                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Expanded slot grid */}
                {isExpanded && (
                  <div
                    id={`court-slots-${court.id}`}
                    className="px-4 sm:px-5 pb-4 pt-1 border-t border-gray-200/70 dark:border-[#344239]/70"
                  >
                    {slots.length === 0 ? (
                      <p className="text-sm text-muted py-4">
                        No bookable slots for this court on {formatDisplayDate(selectedDate)}.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-3">
                        {slots.map((slot) => {
                          const isSelected = selectedSlots.some((s) => s.id === slot.id);
                          const isBooked = slot.status === 'Booked';
                          const isReserved = slot.status === 'Reserved';
                          const isPast = slot.status === 'Past';
                          const isBlocked = slot.status === 'Blocked';
                          const isUnavailable = isBooked || isReserved || isPast || isBlocked;

                          let style = 'slot-available';
                          if (isSelected) style = 'slot-selected';
                          else if (isBooked) style = 'slot-booked';
                          else if (isReserved) style = 'slot-reserved';
                          else if (isPast || isBlocked)
                            style =
                              'bg-gray-50 text-gray-400 border-2 border-gray-200 dark:bg-[#171F1A] dark:text-[#8A9A8E] dark:border-[#344239] cursor-not-allowed';

                          return (
                            <button
                              key={slot.id}
                              type="button"
                              disabled={isUnavailable}
                              onClick={() => handleSlotSelect(court, slot)}
                              aria-disabled={isUnavailable}
                              aria-label={
                                isBooked
                                  ? `Booked ${to12Hour(slot.startTime)}`
                                  : isReserved
                                    ? `Reserved ${to12Hour(slot.startTime)}`
                                    : isPast
                                      ? `Passed ${to12Hour(slot.startTime)}`
                                      : isBlocked
                                        ? `Blocked ${to12Hour(slot.startTime)}`
                                        : `Book ${to12Hour(slot.startTime)} to ${to12Hour(slot.endTime)}`
                              }
                              className={`min-w-0 min-h-[64px] px-1.5 py-2 rounded-[var(--radius-sm)] flex flex-col items-center justify-center gap-0.5 text-center transition-all ${style}`}
                            >
                              <span className="text-[11px] sm:text-xs font-bold leading-tight truncate max-w-full">
                                {to12Hour(slot.startTime)}–{to12Hour(slot.endTime)}
                              </span>
                              <span className="text-[10px] font-sans font-bold opacity-80">
                                EGP {slot.price}
                              </span>
                              {isUnavailable && (
                                <span className="text-[9px] font-sans font-extrabold uppercase tracking-wider opacity-80">
                                  {isBooked ? 'Booked' : isReserved ? 'Reserved' : isPast ? 'Past' : 'Blocked'}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Reserve keeps the full existing booking flow available too */}
                    <Button
                      render={
                        <Link
                          href="/book"
                          onClick={() => selectCourt(court)}
                          className="w-full sm:w-auto"
                        />
                      }
                      nativeButton={false}
                      variant={allUnavailable ? 'secondary' : 'primary'}
                      size="sm"
                      className="mt-4 w-full sm:w-auto"
                    >
                      <CalendarCheck />
                      <span>Reserve Court</span>
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
