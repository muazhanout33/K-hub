import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HydrationProvider } from '@/components/HydrationProvider';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'K-HUB Sports Club | Premium Court Booking Platform',
  description:
    'Book world-class Padel, Football, and Tennis courts online in seconds. Live real-time availability, instant confirmation, and 100% duplicate booking prevention.',
  keywords: [
    'sports club',
    'padel booking',
    'football court',
    'tennis court',
    'sports reservation',
    'K-HUB',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--background)] text-[var(--text-main)] antialiased selection:bg-green-100 selection:text-green-800">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:bg-[var(--primary)] focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-white"
        >
          Skip to main content
        </a>
        <Navbar />
        <HydrationProvider>
          <main id="main-content">{children}</main>
        </HydrationProvider>
        <Footer />
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
