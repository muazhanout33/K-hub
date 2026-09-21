'use client';

import { useRef, useEffect } from 'react';
import { generateCalendarDays, type CalendarDay } from '@/lib/dates';

interface DaySelectorProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  /** If true, scroll to today on mount */
  autoScrollToToday?: boolean;
}

export default function DaySelector({
  selectedDate,
  onSelectDate,
  autoScrollToToday = true,
}: DaySelectorProps) {
  const months = generateCalendarDays();
  const todayRef = useRef<HTMLButtonElement | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
  }, []);

  useEffect(() => {
    if (!autoScrollToToday || !isMountedRef.current) return;
    const timer = setTimeout(() => {
      todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 50);
    return () => clearTimeout(timer);
  }, [autoScrollToToday]);

  return (
    <div className="w-full max-w-full -mx-1 px-1">
      <div
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide items-start"
        style={{ scrollBehavior: 'smooth' }}
      >
        {months.map((month) => (
          <div key={month.key} className="flex items-start shrink-0">
            {/* Month label */}
            <div className="flex items-center shrink-0">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap bg-white/80 backdrop-blur-sm px-1 py-1 rounded">
                {month.label}
              </span>
            </div>
            {/* Day buttons for this month */}
            <div className="flex gap-2">
              {month.days.map((d) => (
                <DayButton
                  key={d.date}
                  item={d}
                  isSelected={d.date === selectedDate}
                  onSelect={onSelectDate}
                  buttonRef={d.isToday ? todayRef : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Individual day button ──

function DayButton({
  item,
  isSelected,
  onSelect,
  buttonRef,
}: {
  item: CalendarDay;
  isSelected: boolean;
  onSelect: (date: string) => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onSelect(item.date)}
      className={`
        flex flex-col items-center justify-center
        min-w-[58px] sm:min-w-[72px] py-2 px-2 sm:px-3 rounded-xl border-2
        transition-all duration-200 cursor-pointer shrink-0
        ${
          isSelected
            ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-md'
            : 'border-gray-200 bg-white hover:border-[var(--primary)] hover:bg-green-50 text-gray-700'
        }
        ${item.isToday && !isSelected ? 'ring-2 ring-[var(--primary)] ring-offset-1' : ''}
      `}
    >
      <span
        className={`text-xs font-medium uppercase tracking-wide ${
          isSelected ? 'text-white/80' : 'text-gray-500'
        }`}
      >
        {item.dayName}
      </span>
      <span className={`text-lg font-bold`}>{item.dayNumber}</span>
      <span
        className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-gray-400'}`}
      >
        {item.monthName}
      </span>
    </button>
  );
}
