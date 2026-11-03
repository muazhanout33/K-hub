'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, CalendarCheck } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useReservationTimer } from '@/features/booking/useReservationTimer';
import { WegoLogo } from '@/components/ui/Logo';

export function MobileHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const { isActive, formattedTime } = useReservationTimer();

  return (
    <>
      <header className="lg:hidden sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="WEGO Home">
          <WegoLogo size="sm" showTagline={false} />
        </Link>

        {isActive && (
          <Link href="/book" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold font-mono animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            {formattedTime}
          </Link>
        )}

        <div className="flex items-center gap-2">
          <Link
            href="/book"
            className="p-2 rounded-xl bg-green-600 text-white text-xs font-bold flex items-center gap-1 shadow-sm"
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Book</span>
          </Link>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Backdrop & Drawer */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative w-80 max-w-[85vw] bg-white h-full shadow-2xl z-10 overflow-y-auto">
            <div className="p-4 flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-xl text-gray-500 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <Sidebar className="w-full min-h-0 border-none shadow-none" />
          </div>
        </div>
      )}
    </>
  );
}
