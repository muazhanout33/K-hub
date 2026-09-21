'use client';

import { CheckCircle2 } from 'lucide-react';
import { useBookingStore, type BookingStep } from './useBookingStore';

const STEPS = [
  { id: 1 as BookingStep, label: 'Select Court' },
  { id: 2 as BookingStep, label: 'Select Time' },
  { id: 3 as BookingStep, label: 'Your Details' },
  { id: 4 as BookingStep, label: 'Payment' },
];

export function BookingSteps() {
  const currentStep = useBookingStore((s) => s.bookingStep);

  return (
    <div className="flex items-center justify-between pb-2 border-b border-gray-100 flex-wrap gap-x-3 gap-y-3 sm:gap-x-2 min-w-0">
      {STEPS.map((step) => {
        const isCompleted = step.id < currentStep;
        const isActive = step.id === currentStep;

        return (
          <div key={step.id} className="flex items-center gap-2 shrink-0 whitespace-nowrap">
            {isCompleted || isActive ? (
              <div className="w-5 h-5 rounded-full bg-[#16A34A] text-white flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-gray-300 text-gray-400 text-[10px] font-bold flex items-center justify-center">
                0{step.id}
              </div>
            )}
            <span
              className={`text-xs font-bold whitespace-nowrap ${
                isCompleted || isActive ? 'text-[#16A34A]' : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
