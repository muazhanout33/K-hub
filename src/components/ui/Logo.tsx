import React from 'react';
import { cn } from '@/lib/utils';

export interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
}

/**
 * WEGO Wordmark Logo
 * Clean, modern, athletic typographic branding.
 * "WE" adapts to background (dark slate / light gray), "GO" in vibrant brand green.
 */
export function WegoLogo({
  className = '',
  size = 'md',
  showTagline = false,
}: LogoProps) {
  const sizeStyles = {
    sm: 'text-lg tracking-tight',
    md: 'text-2xl tracking-tighter',
    lg: 'text-[28px] sm:text-[32px] tracking-tighter',
    xl: 'text-3xl sm:text-4xl tracking-tighter',
  };

  const taglineStyles = {
    sm: 'text-[8.5px] tracking-[0.2em] mt-0.5',
    md: 'text-[9.5px] sm:text-[10px] tracking-[0.22em] mt-1',
    lg: 'text-[10.5px] sm:text-[11px] tracking-[0.22em] mt-1',
    xl: 'text-[11.5px] sm:text-[12px] tracking-[0.24em] mt-1.5',
  };

  return (
    <div className={cn('inline-flex flex-col select-none leading-none', className)}>
      <span className={`font-black font-sans uppercase ${sizeStyles[size]}`}>
        <span className="text-[#0F172A] dark:text-[#F5F7F5] transition-colors">WE</span>
        <span className="text-[#15803D] dark:text-[#22C55E] transition-colors">GO</span>
      </span>
      {showTagline && (
        <span
          className={`font-bold text-[#15803D] dark:text-[#22C55E] uppercase ${taglineStyles[size]}`}
        >
          Play. Book. Enjoy.
        </span>
      )}
    </div>
  );
}

export default WegoLogo;
