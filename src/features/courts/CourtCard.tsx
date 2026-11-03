'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Users, CalendarCheck } from 'lucide-react';
import { Court } from '@/types';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { Button } from '@/components/ui/button';

interface CourtCardProps {
  court: Court;
}

export function CourtCard({ court }: CourtCardProps) {
  const selectCourt = useBookingStore((state) => state.selectCourt);

  const getStatusBadge = (status: Court['status']) => {
    switch (status) {
      case 'Available':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold bg-white/95 dark:bg-[#101512]/90 text-green-700 dark:text-[#4ADE80] border border-gray-200/80 dark:border-[#344239] shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600 dark:bg-[#4ADE80] shrink-0" />
            Available
          </span>
        );
      case 'Starts Soon':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold bg-white/95 dark:bg-[#101512]/90 text-amber-700 dark:text-amber-400 border border-gray-200/80 dark:border-[#344239] shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            Starts Soon
          </span>
        );
      case 'Booked':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold bg-white/95 dark:bg-[#101512]/90 text-red-700 dark:text-red-400 border border-gray-200/80 dark:border-[#344239] shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            Booked
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold bg-white/95 dark:bg-[#101512]/90 text-muted border border-gray-200/80 dark:border-[#344239] shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
            Maintenance
          </span>
        );
    }
  };

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="surface-card p-5 hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 flex flex-col h-full group overflow-hidden"
    >
      {/* Grow area: image + title + price */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="relative aspect-[3/2] w-full rounded-[var(--radius-md)] overflow-hidden mb-4 bg-gray-100 dark:bg-[#171F1A]">
          <Image
            src={court.image}
            alt={court.name}
            fill
            sizes="(max-width: 640px) 75vw, (max-width: 1024px) 45vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute top-3 left-3 pointer-events-none">
            {getStatusBadge(court.status)}
          </div>
          <div className="absolute top-3 right-3 pointer-events-none">
            <span className="px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-extrabold bg-black/60 backdrop-blur-xs text-white border border-white/10 shadow-xs">
              {court.sportType}
            </span>
          </div>
        </div>

        {/* Court title + venue type */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-extrabold text-lg text-gray-900 dark:text-[#F5F7F5] line-clamp-1 group-hover:text-green-600 dark:group-hover:text-[#4ADE80] transition-colors">
            {court.name}
          </h3>
          <span className="text-[11px] font-semibold text-muted px-2 py-0.5 rounded bg-gray-100 dark:bg-[#171F1A] border border-[var(--border)] shrink-0">
            {court.isIndoor ? 'Indoor' : 'Outdoor'}
          </span>
        </div>

        {/* Price + capacity */}
        <div className="mt-3 flex items-center justify-between">
          <div className="price-display">
            <span className="price-display-amount text-xl">EGP {court.pricePerHour}</span>
            <span className="price-display-suffix">/hr</span>
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-muted">
            <Users className="icon-inline shrink-0" />
            <span>{court.capacity} Players</span>
          </div>
        </div>
      </div>

      {/* Book Now pinned to card bottom */}
      <Button
        render={<Link href="/book" onClick={() => selectCourt(court)} />}
        nativeButton={false}
        variant="primary"
        size="sm"
        className="mt-4 w-full"
      >
        <CalendarCheck className="icon-btn" />
        <span>Book Now</span>
      </Button>
    </motion.div>
  );
}
