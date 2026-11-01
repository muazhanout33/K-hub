import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, DEFAULT_LOCALE, type Locale } from './config';

/**
 * Server-side read of the locale cookie.
 * Used by the root layout (SSR `lang`/`dir` + localized server render)
 * and by `generateMetadata`.
 */
export function readLocaleCookie(get: (name: string) => string | undefined): Locale {
  const value = get(LOCALE_COOKIE);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Client-side write — called when the user flips the language switcher. */
export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}
