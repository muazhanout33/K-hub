'use client';

import { useState, useMemo, useEffect, use, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getCourtByIdFromSupabase, FALLBACK_COURT_IMAGE } from '@/services/court.service';
import { generateTimeSlots } from '@/services/booking.service';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { TimeSlotsGrid } from '@/features/booking/TimeSlotsGrid';
import { BookingCountdown } from '@/features/booking/BookingCountdown';
import DaySelector from '@/features/booking/DaySelector';
import { formatDisplayDate, getToday } from '@/lib/dates';
import { Court, Booking } from '@/types';
import { useAllBookingsForDate } from '@/hooks/useAllBookingsForDate';

import { SiteContainer } from '@/components/layout/SiteContainer';
import { Button } from '@/components/ui/button';
import {
  CalendarCheck,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export default function CourtDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [court, setCourt] = useState<Court | null>(null);
  const [activeImage, setActiveImage] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectCourt = useBookingStore((state) => state.selectCourt);
  const selectDate = useBookingStore((state) => state.selectDate);
  const localBookings = useBookingStore((state) => state.bookings);
  const { bookings: publicBookings } = useAllBookingsForDate(selectedDate);

  const user = useAuthStore((s) => s.user);

  const effectiveBookings = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const b of publicBookings) {
      map.set(b.id, b);
    }
    for (const b of localBookings) {
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
  }, [publicBookings, localBookings, user?.id]);

  const fetchCourt = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedCourt = await getCourtByIdFromSupabase(resolvedParams.id);
      if (fetchedCourt) {
        setCourt(fetchedCourt);
        setActiveImage(fetchedCourt.image);
      } else {
        setError('Court not found.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load court details.');
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    fetchCourt();
  }, [fetchCourt]);

  const timeSlots = useMemo(
    () => (court ? generateTimeSlots(court, selectedDate, court.pricePerHour, effectiveBookings, user?.id) : []),
    [court, selectedDate, effectiveBookings, user?.id]
  );

  if (loading || !court) {
    return (
      <SiteContainer className="py-12 text-center">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 text-green-600 animate-spin" />
            <p className="text-gray-500 font-semibold">Loading court details...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 max-w-md mx-auto">
            <AlertTriangle className="w-10 h-10 text-red-500" />
            <p className="text-red-600 font-semibold">{error}</p>
            <Button onClick={fetchCourt} variant="primary" size="sm">
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </Button>
          </div>
        ) : null}
      </SiteContainer>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-10 pb-12">
      {/* Back Nav */}
      <SiteContainer className="pt-6">
        <Link
          href="/courts"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-[#A1ADA4] hover:text-green-600 dark:hover:text-[#4ADE80] transition-colors"
        >
          <ChevronLeft className="w-[16px] h-[16px]" />
          <span>Back to All Courts</span>
        </Link>
      </SiteContainer>

      {/* Main Details Grid */}
      <SiteContainer as="section">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Col 1 & 2: Gallery + Court Specifications */}
          <div className="lg:col-span-2 space-y-8">
            {/* Gallery */}
            <div className="space-y-4">
              <div className="relative aspect-[3/2] w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-gray-200 dark:border-[#344239] shadow-lg bg-gray-100 dark:bg-[#171F1A]">
                <Image
                  src={
                    typeof activeImage === 'string' && activeImage.trim().length > 0
                      ? activeImage
                      : FALLBACK_COURT_IMAGE
                  }
                  alt={court.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="object-cover"
                />
                <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-white/90 dark:bg-[#1D2821]/90 backdrop-blur-md text-xs font-extrabold text-gray-900 dark:text-[#F5F7F5] shadow-xs">
                  {court.sportType} · {court.isIndoor ? 'Indoor Arena' : 'Outdoor Pitch'}
                </span>
              </div>

              {/* Thumbnails */}
              {court.gallery.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {court.gallery.map((imgUrl, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImage(imgUrl)}
                      className={`relative w-24 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                        activeImage === imgUrl ? 'border-green-600 scale-105' : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <Image
                        src={
                          typeof imgUrl === 'string' && imgUrl.trim().length > 0
                            ? imgUrl
                            : FALLBACK_COURT_IMAGE
                        }
                        alt="Thumbnail"
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Info header */}
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs font-bold text-gray-800 dark:text-[#F5F7F5] bg-gray-100 dark:bg-[#1D2821] px-2.5 py-1 rounded-lg border border-gray-200 dark:border-[#344239]">
                  Surface: {court.surface}
                </span>
                <span className="text-xs font-bold text-gray-800 dark:text-[#F5F7F5] bg-gray-100 dark:bg-[#1D2821] px-2.5 py-1 rounded-lg border border-gray-200 dark:border-[#344239]">
                  Capacity: {court.capacity} Players
                </span>
                <span className="text-xs font-semibold text-green-700 dark:text-[#4ADE80] bg-green-50 dark:bg-green-950/30 px-2.5 py-1 rounded-lg border border-green-200 dark:border-green-800/40">
                  Regulation Specification
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-[#F5F7F5] tracking-tight leading-tight">{court.name}</h1>
              <p className="text-sm text-gray-600 dark:text-[#A1ADA4] mt-3 leading-relaxed max-w-2xl">{court.description}</p>
            </div>

            {/* Features */}
            <div className="bg-white dark:bg-[#1D2821] rounded-3xl p-4 sm:p-6 border border-gray-200/80 dark:border-[#344239] shadow-xs">
              <h3 className="font-extrabold text-base text-gray-900 dark:text-[#F5F7F5] mb-3 sm:mb-4">Court Features & Amenities</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {court.features.map((feat, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-[#F5F7F5] p-2.5 rounded-xl bg-gray-50 dark:bg-[#171F1A] border border-gray-100 dark:border-[#344239]">
                    <CheckCircle2 className="w-[16px] h-[16px] text-green-600 dark:text-[#4ADE80] shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rules */}
            <div className="bg-white dark:bg-[#1D2821] rounded-3xl p-4 sm:p-6 border border-gray-200/80 dark:border-[#344239] shadow-xs">
              <h3 className="font-extrabold text-base text-gray-900 dark:text-[#F5F7F5] mb-2 sm:mb-3">Court Policies & Guidelines</h3>
              <ul className="space-y-2 text-xs text-gray-600 dark:text-[#A1ADA4] font-medium">
                {court.rules.map((rule, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <AlertCircle className="w-[14px] h-[14px] text-amber-500 shrink-0" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Col 3: Live Booking Box */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#1D2821] rounded-3xl p-6 border border-gray-200/80 dark:border-[#344239] shadow-xl sticky top-24 overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-[#344239]">
                <div>
                  <span className="text-xs font-bold text-gray-500 dark:text-[#8A9A8E] block uppercase tracking-wider">Rate</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-black text-gray-900 dark:text-[#F5F7F5]">EGP {court.pricePerHour}</span>
                    <span className="text-xs text-gray-600 dark:text-[#A1ADA4] font-semibold">/ hour</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-gray-500 dark:text-[#8A9A8E] block uppercase tracking-wider">Capacity</span>
                  <span className="text-sm font-extrabold text-gray-900 dark:text-[#F5F7F5] mt-1 block">{court.capacity} Players</span>
                </div>
              </div>

              {/* Day Selector */}
              <div className="py-4 border-b border-gray-100 dark:border-[#344239] space-y-2">
                <label className="block text-xs font-extrabold text-gray-700 dark:text-[#A1ADA4] uppercase tracking-wider">
                  Select Date
                </label>
                <DaySelector
                  selectedDate={selectedDate}
                  onSelectDate={(newDate) => {
                    setSelectedDate(newDate);
                    selectDate(newDate);
                  }}
                />
              </div>

              {/* Action Button */}
              <div className="pt-4">
                <Button
                  render={
                    <Link
                      href="/book"
                      onClick={() => {
                        selectCourt(court);
                        selectDate(selectedDate);
                      }}
                    />
                  }
                  nativeButton={false}
                  variant="primary"
                  size="lg"
                  className="w-full"
                >
                  <CalendarCheck className="w-[20px] h-[20px]" />
                  <span>Start Booking This Court</span>
                </Button>
                <p className="text-[11px] text-gray-500 dark:text-[#8A9A8E] text-center mt-2">
                  🔒 10-minute temporary lock active upon slot selection
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Time slots picker section */}
        <div className="mt-8 sm:mt-12 bg-white dark:bg-[#1D2821] rounded-3xl p-4 sm:p-8 border border-gray-200/80 dark:border-[#344239] shadow-md overflow-hidden">
          <BookingCountdown />
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-[#F5F7F5] mb-4 sm:mb-6 mt-4">Select Available Time Slot for {formatDisplayDate(selectedDate)}</h2>
          <TimeSlotsGrid slots={timeSlots} dateLabel={`Available ${formatDisplayDate(selectedDate)}`} />
        </div>
      </SiteContainer>
    </div>
  );
}
