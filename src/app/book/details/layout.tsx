import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Booking Details | WEGO Sports',
};

export default function BookDetailsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
