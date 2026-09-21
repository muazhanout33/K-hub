import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book a Court | K-HUB Sports Club',
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
