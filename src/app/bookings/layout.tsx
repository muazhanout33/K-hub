import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Bookings | K-HUB Sports Club',
};

export default function BookingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
