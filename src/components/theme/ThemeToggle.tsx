'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme, type Theme } from '@/lib/theme/useTheme';

interface ThemeToggleProps {
  /**
   * 'compact' (default): A compact 3-icon pill control suitable for headers.
   * 'segmented': A wider 3-button segmented control with text labels.
   */
  variant?: 'compact' | 'segmented';
  className?: string;
}

export function ThemeToggle({ variant = 'compact', className = '' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Render an inert placeholder during SSR to prevent layout shift
    return (
      <div
        className={`inline-flex items-center rounded-full border border-gray-200 dark:border-[#344239] p-0.5 bg-gray-100/80 dark:bg-[#1D2821] ${
          variant === 'compact' ? 'h-9 w-[104px]' : 'h-10 w-full max-w-[280px]'
        } ${className}`}
        aria-hidden="true"
      />
    );
  }

  const options: { value: Theme; label: string; icon: React.ElementType }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Laptop },
  ];

  if (variant === 'segmented') {
    return (
      <div
        role="radiogroup"
        aria-label="Theme selection"
        className={`inline-flex items-center p-1 rounded-full border border-gray-200 dark:border-[#344239] bg-gray-100/90 dark:bg-[#1D2821] w-full max-w-[320px] transition-colors ${className}`}
      >
        {options.map(({ value, label, icon: Icon }) => {
          const isActive = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setTheme(value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-[#26332A] text-gray-900 dark:text-[#F5F7F5] shadow-sm'
                  : 'text-gray-500 dark:text-[#A1ADA4] hover:text-gray-900 dark:hover:text-[#F5F7F5]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Compact variant: 3-icon pill
  return (
    <div
      role="radiogroup"
      aria-label="Theme selection"
      className={`inline-flex items-center p-0.5 rounded-full border border-gray-200 dark:border-[#344239] bg-gray-100/80 dark:bg-[#171F1A] transition-colors shrink-0 ${className}`}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={`${label} Mode`}
            aria-label={`${label} Mode`}
            onClick={() => setTheme(value)}
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isActive
                ? 'bg-white dark:bg-[#26332A] text-green-700 dark:text-[#4ADE80] shadow-xs'
                : 'text-gray-400 dark:text-[#8A9A8E] hover:text-gray-700 dark:hover:text-[#F5F7F5]'
            }`}
          >
            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
