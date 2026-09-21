import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface SiteContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Render as a different element (e.g. section, header). */
  as?: 'div' | 'section' | 'header' | 'footer' | 'main' | 'nav';
  /** Remove the default horizontal padding (use when the child provides its own). */
  flush?: boolean;
}

const SITE_CONTAINER_CLASSES =
  'mx-auto w-full max-w-[1600px] px-6 lg:px-20';

/**
 * SiteContainer
 * ----------------------------------------------------------------------
 * The single source of truth for the app's outer content width and
 * horizontal rhythm. Every page-level section should be wrapped in this
 * component so that the 1600px cap and responsive side gutters stay
 * consistent site-wide — no more per-page `max-w-[1600px] mx-auto
 * px-6 lg:px-20` duplication.
 */
export const SiteContainer = forwardRef<HTMLDivElement, SiteContainerProps>(
  function SiteContainer({ as: Tag = 'div', flush = false, className, ...props }, ref) {
    return (
      <Tag
        ref={ref as never}
        className={cn(
          SITE_CONTAINER_CLASSES,
          flush && 'px-0 lg:px-0',
          className
        )}
        {...props}
      />
    );
  }
);
