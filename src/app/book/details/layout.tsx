import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Booking Details | K-HUB Sports Club',
};

export default function BookDetailsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
