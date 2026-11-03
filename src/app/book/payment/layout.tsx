import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment | WEGO Sports',
};

export default function BookPaymentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
