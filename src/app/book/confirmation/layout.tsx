import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Booking Confirmed | WEGO Sports',
};

export default function BookConfirmationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
