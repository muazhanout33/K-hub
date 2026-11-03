import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | WEGO Sports',
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
