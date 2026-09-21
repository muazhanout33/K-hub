'use client';

import { useReservationTimer } from './useReservationTimer';
import { Clock, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';

export function BookingCountdown() {
  const { isActive, formattedTime, hasExtendedReservation, extendReservation } = useReservationTimer();

  if (!isActive) return null;

  const handleExtend = () => {
    const success = extendReservation();
    if (success) {
      toast.success('Reservation extended by 5 minutes!');
    } else {
      toast.error('Extension limit reached (1 extension allowed per reservation).');
    }
  };

  return (
    <div className="bg-amber-500 text-white rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 border border-amber-400 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center font-bold text-lg shadow-inner">
          <Clock className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm uppercase tracking-wide text-amber-100">
              Temporary Lock Active
            </span>
            <span className="px-2 py-0.5 rounded-md bg-amber-600 text-[10px] font-bold">10-Min Guarantee</span>
          </div>
          <p className="text-xs text-amber-100 mt-0.5">
            This court slot is exclusively locked for you. Complete details to confirm.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Timer display */}
        <div className="text-center font-mono text-2xl font-black bg-amber-600/90 px-4 py-1.5 rounded-xl border border-amber-400 shadow-xs">
          {formattedTime}
        </div>

        {/* Extension button */}
        {!hasExtendedReservation ? (
          <button
            onClick={handleExtend}
            className="px-3.5 py-2 rounded-xl bg-white text-amber-900 hover:bg-amber-100 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <PlusCircle className="w-4 h-4 text-amber-600" />
            <span>+5 Min</span>
          </button>
        ) : (
          <span className="text-[11px] text-amber-200 font-medium px-2 py-1 rounded-lg bg-amber-600/60">
            Extended (+5m)
          </span>
        )}
      </div>
    </div>
  );
}
