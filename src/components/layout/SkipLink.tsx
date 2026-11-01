'use client';

import { useT } from '@/components/i18n/LocaleProvider';

/** Accessibility skip-link — localized, positioned with logical properties. */
export function SkipLink() {
  const t = useT();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[200] focus:bg-[var(--primary)] focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-white"
    >
      {t('common.skipToContent')}
    </a>
  );
}
