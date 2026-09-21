import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment | K-HUB Sports Club',
};

export default function BookPaymentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
