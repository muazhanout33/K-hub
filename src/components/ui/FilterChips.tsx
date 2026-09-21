'use client';

import { cn } from '@/lib/utils';

interface FilterChipsProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  /** Use dark active style (e.g. Indoor/Outdoor filter). */
  darkActive?: boolean;
  className?: string;
}

export function FilterChips({ options, value, onChange, darkActive = false, className }: FilterChipsProps) {
  return (
    <div className={cn('filter-chip-group', className)}>
      {options.map((option) => {
        const isActive = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'filter-chip',
              isActive && (darkActive ? 'filter-chip-active-dark' : 'filter-chip-active')
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
