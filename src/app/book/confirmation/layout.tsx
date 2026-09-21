import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Booking Confirmed | K-HUB Sports Club',
};

export default function BookConfirmationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
