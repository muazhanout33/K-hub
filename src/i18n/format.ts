import type { Locale } from './config';
import { to12Hour } from '@/lib/utils';

/**
 * Intl locale tags used for *display* formatting only.
 * Machine-readable formats (YYYY-MM-DD keys, en-CA day strings in timezone.ts)
 * must stay locale-independent — never route those through here.
 *
 * Arabic uses Latin digits (`-nu-latn`) because the booking flow renders
 * numeric schedules where Arabic-Indic numerals would hurt scannability.
 */
export function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US';
}

export function formatDate(
  value: string | Date | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const date = typeof value === 'string' && !value.includes('T') && value.length === 10
    ? parseIsoDate(value)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(intlLocale(locale), options);
}

export function formatDateTime(value: string | Date | number, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(intlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: locale !== 'ar',
  });
}

export function formatTime(value: string | Date | number, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: locale !== 'ar',
  });
}

export function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(intlLocale(locale));
}

/** Prices render the localized currency symbol from the `common` namespace. */
export function formatAmount(value: number, locale: Locale): string {
  return `${formatNumber(value, locale)} ${locale === 'ar' ? 'ج.م' : 'EGP'}`;
}

/** Localized 12-hour clock — Arabic gets ص/م (delegates to shared helper). */
export function format12Hour(time24: string, locale: Locale): string {
  return to12Hour(time24, locale);
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
