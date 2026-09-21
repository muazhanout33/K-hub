import { HTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'brand' | 'neutral' | 'outline' | 'subtle';
type BadgeSize = 'xs' | 'sm';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  brand: 'bg-green-50 text-green-700 border-green-100',
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  outline: 'bg-white text-gray-700 border-gray-200',
  subtle: 'bg-green-100/90 text-green-800 border-green-200/60',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: 'px-2.5 py-1 text-[10px] tracking-wider gap-1.5',
  sm: 'px-3 py-1 text-[11px] tracking-wider gap-1.5',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'brand', size = 'xs', icon, className, children, ...props },
  ref
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-[var(--radius-pill)] font-extrabold uppercase border shadow-2xs whitespace-nowrap',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    >
      {icon}
      {children}
   </span>
  );
});
