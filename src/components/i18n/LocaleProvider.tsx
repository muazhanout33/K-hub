'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  getDir,
  isLocale,
  type Locale,
} from '@/i18n/config';
import { writeLocaleCookie } from '@/i18n/locale-cookie';
import {
  translate,
  type TranslationKey,
  type TranslationParams,
} from '@/i18n/dictionaries';

export type TFunction = (key: TranslationKey, params?: TranslationParams) => string;

interface LocaleContextValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (locale: Locale) => void;
  t: TFunction;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Single source of truth for the active language on the client.
 *
 * `initialLocale` comes from the root layout (server-read cookie), so the
 * SSR output already matches the visitor's stored preference — the first
 * client render therefore hydrates without any mismatch. Switching language
 * updates context state (instant UI change), writes the cookie (survives
 * reload / next SSR) and updates <html lang/dir> immediately.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState((current) => {
      if (current === next) return current;
      writeLocaleCookie(next);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = next;
        document.documentElement.dir = getDir(next);
      }
      return next;
    });
  }, []);

  const t = useCallback<TFunction>(
    (key, params) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dir: getDir(locale), setLocale, t }),
    [locale, setLocale, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Graceful degradation outside the provider (isolated unit tests, Storybook).
    return {
      locale: DEFAULT_LOCALE,
      dir: getDir(DEFAULT_LOCALE),
      setLocale: () => undefined,
      t: (key, params) => translate(DEFAULT_LOCALE, key, params),
    };
  }
  return ctx;
}

/** Shorthand: `const t = useT();` */
export function useT(): TFunction {
  return useLocale().t;
}
