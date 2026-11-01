'use client';

import { useLocale } from '@/components/i18n/LocaleProvider';
import type { Locale } from '@/i18n/config';

interface LocaleSwitcherProps {
  /** Variant for the mobile drawer (full-width labeled row). */
  variant?: 'segmented' | 'drawer';
  className?: string;
  onNavigate?: () => void;
}

const LOCALE_OPTIONS: { value: Locale; short: string; full: string }[] = [
  { value: 'en', short: 'EN', full: 'English' },
  { value: 'ar', short: 'عربي', full: 'العربية' },
];

/**
 * Segmented EN/العربية control. Switching updates the LocaleProvider state
 * (instant re-render of the current route — no navigation, no state loss),
 * writes the `khub-locale` cookie for the next SSR pass and flips
 * <html lang dir> immediately.
 */
export function LocaleSwitcher({ variant = 'segmented', className, onNavigate }: LocaleSwitcherProps) {
  const { locale, setLocale, t } = useLocale();

  const choose = (next: Locale) => {
    setLocale(next);
    onNavigate?.();
  };

  if (variant === 'drawer') {
    const current = LOCALE_OPTIONS.find((o) => o.value === locale);
    const other = LOCALE_OPTIONS.find((o) => o.value !== locale)!;
    return (
      <button
        type="button"
        onClick={() => choose(other.value)}
        className={`flex items-center gap-2.5 w-full px-4 py-3 rounded-xl text-[14px] font-medium text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors ${className ?? ''}`}
        aria-label={`${t('common.switchLanguage')} — ${other.full}`}
        lang={other.value}
      >
        <span aria-hidden="true" className="text-[var(--text-subtle)] text-xs font-bold">
          {other.short}
        </span>
        <span>
          {locale === 'en' ? 'العربية' : 'English'}
        </span>
        <span className="ms-auto text-[11px] text-[var(--text-subtle)] font-semibold uppercase">
          {current?.short}
        </span>
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t('common.switchLanguage')}
      className={`inline-flex items-center gap-0.5 p-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] shrink-0 ${className ?? ''}`}
    >
      {LOCALE_OPTIONS.map((option) => {
        const isActive = option.value === locale;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            aria-pressed={isActive}
            lang={option.value}
            title={option.full}
            className={`px-2.5 h-8 rounded-full text-[12px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${
              isActive
                ? 'bg-[var(--card)] text-[var(--text-main)] shadow-sm'
                : 'text-[var(--text-subtle)] hover:text-[var(--text-main)]'
            }`}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
}
