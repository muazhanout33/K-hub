import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Courts | WEGO Sports',
};

export default function CourtsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
