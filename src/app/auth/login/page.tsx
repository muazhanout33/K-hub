import type { Metadata } from 'next';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign In | WEGO Sports',
};

export default function LoginPage() {
  return <LoginForm />;
}
