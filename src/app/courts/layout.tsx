import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Courts | K-HUB Sports Club',
};

export default function CourtsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
