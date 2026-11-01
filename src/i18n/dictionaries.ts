import { common } from './namespaces/common';
import { nav } from './namespaces/nav';
import { footer } from './namespaces/footer';
import { home } from './namespaces/home';
import { auth } from './namespaces/auth';
import { courts } from './namespaces/courts';
import { booking } from './namespaces/booking';
import { bookings } from './namespaces/bookings';
import { profile } from './namespaces/profile';
import { notifications } from './namespaces/notifications';
import { admin } from './namespaces/admin';
import { pages } from './namespaces/pages';
import { enums } from './namespaces/enums';
import { errors } from './namespaces/errors';
import type { Locale } from './config';

const en = {
  common: common.en,
  nav: nav.en,
  footer: footer.en,
  home: home.en,
  auth: auth.en,
  courts: courts.en,
  booking: booking.en,
  bookings: bookings.en,
  profile: profile.en,
  notifications: notifications.en,
  admin: admin.en,
  pages: pages.en,
  enums: enums.en,
  errors: errors.en,
};

export type Dictionary = typeof en;

const ar: Dictionary = {
  common: common.ar,
  nav: nav.ar,
  footer: footer.ar,
  home: home.ar,
  auth: auth.ar,
  courts: courts.ar,
  booking: booking.ar,
  bookings: bookings.ar,
  profile: profile.ar,
  notifications: notifications.ar,
  admin: admin.ar,
  pages: pages.ar,
  enums: enums.ar,
  errors: errors.ar,
};

export const dictionaries: Record<Locale, Dictionary> = { en, ar };

/* ── Typed key paths, e.g. 'nav.items.courts' ─────────────────────── */
type DotUnion<T, Prefix extends string = ''> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string
        ? `${Prefix}${K}`
        : DotUnion<T[K], `${Prefix}${K}.`>;
    }[keyof T & string];

export type TranslationKey = DotUnion<Dictionary>;

export type TranslationParams = Record<string, string | number>;

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * Resolve a key against the active locale, falling back to English so a
 * missing Arabic string degrades to readable text instead of a raw key.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const dict = dictionaries[locale];
  const value = lookup(dict, key) ?? lookup(dictionaries.en, key);
  if (value === undefined) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[i18n] Missing translation key: ${key}`);
    }
    return key;
  }
  return interpolate(value, params);
}
