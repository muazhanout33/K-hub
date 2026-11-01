import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HydrationProvider } from '@/components/HydrationProvider';
import { SkipLink } from '@/components/layout/SkipLink';
import { AppToaster } from '@/components/layout/AppToaster';
import { LocaleProvider } from '@/components/i18n/LocaleProvider';
import { ThemeController } from '@/features/ui/ThemeController';
import { THEME_BOOT_SCRIPT } from '@/features/ui/theme-boot-script';
import { dictionaries } from '@/i18n/dictionaries';
import { getDir, type Locale } from '@/i18n/config';
import { readLocaleCookie } from '@/i18n/locale-cookie';

async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  return readLocaleCookie((name) => store.get(name)?.value);
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const meta = dictionaries[locale].home.meta;
  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords.split(',').map((keyword) => keyword.trim()),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();
  const dir = getDir(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--background)] text-[var(--text-main)] antialiased selection:bg-green-100 selection:text-green-800">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <LocaleProvider initialLocale={locale}>
          <SkipLink />
          <ThemeController />
          <Navbar />
          <HydrationProvider>
            <main id="main-content">{children}</main>
          </HydrationProvider>
          <Footer />
          <AppToaster />
        </LocaleProvider>
      </body>
    </html>
  );
}
