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
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold status-available bg-white/95 backdrop-blur-md border border-white/60 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-ping shrink-0" />
            Available
          </span>
        );
      case 'Starts Soon':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold status-starts-soon bg-white/95 backdrop-blur-md border border-white/60 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
            Starts Soon
          </span>
        );
      case 'Booked':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold status-booked bg-white/95 backdrop-blur-md border border-white/60 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            Booked
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold bg-white/95 backdrop-blur-md text-muted border border-white/60 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
            Maintenance
          </span>
        );
    }
  };

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      /* surface-card uses --radius-xl (24px) — consistent card radius */
      className="surface-card p-5 hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 flex flex-col h-full group overflow-hidden"
    >
      {/* Grow area: image + title + price */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="relative aspect-[3/2] w-full rounded-[var(--radius-md)] overflow-hidden mb-4 bg-gray-100">
          <Image
            src={court.image}
            alt={court.name}
            fill
            sizes="(max-width: 640px) 75vw, (max-width: 1024px) 45vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5 pointer-events-none max-w-[calc(100%-1.5rem)]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-3 py-1 rounded-[var(--radius-pill)] text-[11px] font-extrabold bg-white/90 backdrop-blur-md text-gray-900 shadow-xs border border-white/50">
                {court.sportType}
              </span>
              <span className="px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold bg-gray-900/85 backdrop-blur-md text-white shadow-xs border border-white/10">
                {court.isIndoor ? 'Indoor' : 'Outdoor'}
              </span>
            </div>
            <div>{getStatusBadge(court.status)}</div>
          </div>
        </div>

        {/* Court title — uniform font-extrabold text-lg */}
        <h3 className="font-extrabold text-lg text-gray-900 line-clamp-1 group-hover:text-green-600 transition-colors">
          {court.name}
        </h3>

        {/* Price + capacity — items-center for optical baseline alignment */}
        <div className="mt-3 flex items-center justify-between">
          <div className="price-display">
            <span className="price-display-amount text-xl">EGP {court.pricePerHour}</span>
            <span className="price-display-suffix">/hr</span>
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-muted">
            {/* icon-inline: 16px — optically centered with adjacent text */}
            <Users className="icon-inline shrink-0" />
            <span>{court.capacity} Players</span>
          </div>
        </div>
      </div>

      {/* Book Now pinned to card bottom via flex-col h-full */}
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
