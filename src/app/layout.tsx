import type { Metadata } from 'next';
import './globals.css';
import { PublicChrome } from '@/components/layout/PublicChrome';
import { HydrationProvider } from '@/components/HydrationProvider';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'WEGO | Premium Sports Court Booking Platform',
  description:
    'Book world-class Padel, Football, and Tennis courts online in seconds. Play. Book. Enjoy. Live real-time availability and instant confirmation with WEGO.',
  keywords: [
    'WEGO',
    'sports club',
    'padel booking',
    'football court',
    'tennis court',
    'sports reservation',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('wego-theme')||localStorage.getItem('khub-theme');var s=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&s)||(t==='system'&&s)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--background)] text-[var(--text-main)] antialiased selection:bg-green-100 selection:text-green-800 dark:selection:bg-green-900/40 dark:selection:text-green-300">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:bg-[var(--primary)] focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-white"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          <PublicChrome>
            <HydrationProvider>
              <main id="main-content">{children}</main>
            </HydrationProvider>
          </PublicChrome>
        </ThemeProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
