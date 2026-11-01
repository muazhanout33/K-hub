'use client';

import { useCallback, useMemo } from 'react';
import { useLocale } from './LocaleProvider';
import { errorMessageKey } from '@/i18n/errors';
import type { TranslationKey } from '@/i18n/dictionaries';
import type {
  AdvertisementStatus,
  BookingSource,
  BookingStatus,
  CourtStatus,
  PaymentStatus,
  SlotStatus,
  SportType,
  SponsorshipPricingType,
  SponsorshipStatus,
  SponsorshipTargetType,
} from '@/types';

/**
 * Domain-value → localized label helpers. Stored enum values stay English
 * everywhere (DB, localStorage, CSS class hooks); only rendering is localized.
 * Unknown values fall back to the raw stored string.
 */
export function useLabels() {
  const { locale, t } = useLocale();

  const pick = useCallback(
    (group: string, value: string): string => {
      const key = `enums.${group}.${value}` as TranslationKey;
      const label = t(key);
      return label === key ? value : label;
    },
    [t],
  );

  const errorMessage = useCallback(
    (message: string): string => {
      const key = errorMessageKey(message);
      return key ? t(key as TranslationKey) : message;
    },
    [t],
  );

  return useMemo(
    () => ({
      locale,
      sport: (v: SportType) => pick('sport', v),
      courtStatus: (v: CourtStatus) => pick('courtStatus', v),
      slotStatus: (v: SlotStatus) => pick('slotStatus', v),
      bookingStatus: (v: BookingStatus) => pick('bookingStatus', v),
      paymentStatus: (v: PaymentStatus) => pick('paymentStatus', v),
      bookingSource: (v: BookingSource) => pick('bookingSource', v),
      sponsorshipStatus: (v: SponsorshipStatus) => pick('sponsorshipStatus', v),
      advertisementStatus: (v: AdvertisementStatus) => pick('advertisementStatus', v),
      sponsorshipTarget: (v: SponsorshipTargetType) => pick('sponsorshipTarget', v),
      sponsorshipPricing: (v: SponsorshipPricingType) => pick('sponsorshipPricing', v),
      billingPeriod: (v: string) => pick('billingPeriod', v),
      userRole: (v: string) => pick('userRole', v),
      faqCategory: (v: string) => pick('faqCategory', v),
      errorMessage,
    }),
    [locale, pick, errorMessage],
  );
}
