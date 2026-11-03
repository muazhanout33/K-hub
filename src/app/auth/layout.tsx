import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | WEGO Sports',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
