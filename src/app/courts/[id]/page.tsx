'use client';

import { useState, useMemo, useEffect, use, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getCourtByIdFromSupabase, FALLBACK_COURT_IMAGE } from '@/services/court.service';
import { generateTimeSlots } from '@/services/booking.service';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { TimeSlotsGrid } from '@/features/booking/TimeSlotsGrid';
import { BookingCountdown } from '@/features/booking/BookingCountdown';
import DaySelector from '@/features/booking/DaySelector';
import { formatDisplayDate, getToday } from '@/lib/dates';
import { Court } from '@/types';

import { SiteContainer } from '@/components/layout/SiteContainer';
import { Button } from '@/components/ui/button';
import {
  Star,
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
  const bookings = useBookingStore((state) => state.bookings);

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
    () => (court ? generateTimeSlots(court, selectedDate, court.pricePerHour, bookings) : []),
    [court, selectedDate, bookings]
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
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-green-600 transition-colors"
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
              <div className="relative aspect-[3/2] w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-gray-200 shadow-lg bg-gray-100">
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
                <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-white/90 backdrop-blur-md text-xs font-extrabold text-gray-900 shadow-xs">
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
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 text-amber-800 text-xs font-bold">
                  <Star className="w-[14px] h-[14px] fill-amber-400 text-amber-400" />
                  <span>{court.rating}</span>
                  <span className="text-gray-500">({court.reviewCount} reviews)</span>
                </div>
                <span className="text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-lg border border-green-200">
                  WPT Certified Turf
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight leading-tight">{court.name}</h1>
              <p className="text-sm text-gray-600 mt-3 leading-relaxed max-w-2xl">{court.description}</p>
            </div>

            {/* Features */}
            <div className="bg-white rounded-3xl p-4 sm:p-6 border border-gray-200/80 shadow-xs">
              <h3 className="font-extrabold text-base text-gray-900 mb-3 sm:mb-4">Court Features & Amenities</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {court.features.map((feat, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-semibold text-gray-700 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <CheckCircle2 className="w-[16px] h-[16px] text-green-600 shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rules */}
            <div className="bg-white rounded-3xl p-4 sm:p-6 border border-gray-200/80 shadow-xs">
              <h3 className="font-extrabold text-base text-gray-900 mb-2 sm:mb-3">Court Policies & Guidelines</h3>
              <ul className="space-y-2 text-xs text-gray-600 font-medium">
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
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xl sticky top-24 overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div>
                  <span className="text-xs font-bold text-gray-500 block uppercase tracking-wider">Rate</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-black text-gray-900">EGP {court.pricePerHour}</span>
                    <span className="text-xs text-gray-600 font-semibold">/ hour</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-gray-500 block uppercase tracking-wider">Capacity</span>
                  <span className="text-sm font-extrabold text-gray-900 mt-1 block">{court.capacity} Players</span>
                </div>
              </div>

              {/* Day Selector */}
              <div className="py-4 border-b border-gray-100 space-y-2">
                <label className="block text-xs font-extrabold text-gray-700 uppercase tracking-wider">
                  Select Date
                </label>
                <DaySelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
              </div>

              {/* Action Button */}
              <div className="pt-4">
                <Button
                  render={<Link href="/book" onClick={() => selectCourt(court)} />}
                  nativeButton={false}
                  variant="primary"
                  size="lg"
                  className="w-full"
                >
                  <CalendarCheck className="w-[20px] h-[20px]" />
                  <span>Start Booking This Court</span>
                </Button>
                <p className="text-[11px] text-gray-500 text-center mt-2">
                  🔒 10-minute temporary lock active upon slot selection
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Time slots picker section */}
        <div className="mt-8 sm:mt-12 bg-white rounded-3xl p-4 sm:p-8 border border-gray-200/80 shadow-md overflow-hidden">
          <BookingCountdown />
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-4 sm:mb-6 mt-4">Select Available Time Slot for {formatDisplayDate(selectedDate)}</h2>
          <TimeSlotsGrid slots={timeSlots} dateLabel={`Available ${formatDisplayDate(selectedDate)}`} />
        </div>
      </SiteContainer>
    </div>
  );
}
