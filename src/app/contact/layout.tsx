import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | K-HUB Sports Club',
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
