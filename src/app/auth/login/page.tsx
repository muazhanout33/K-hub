import type { Metadata } from 'next';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'Login | K-HUB Sports Club',
};

export default function LoginPage() {
  return <LoginForm />;
}
