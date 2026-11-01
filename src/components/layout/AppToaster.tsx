'use client';

import { Toaster } from 'sonner';
import { useLocale } from '@/components/i18n/LocaleProvider';

/** Site-wide toast host — position mirrors with the document direction. */
export function AppToaster() {
  const { dir } = useLocale();
  return (
    <Toaster position={dir === 'rtl' ? 'top-left' : 'top-right'} richColors closeButton />
  );
}
