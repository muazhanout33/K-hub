import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login | K-HUB Sports Club',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
