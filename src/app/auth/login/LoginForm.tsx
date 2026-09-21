'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGuestGuard } from '@/hooks/useGuestGuard';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export default function LoginForm() {
  const router = useRouter();
  const { hydrated, isRedirecting } = useGuestGuard('/book');
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setFieldError('Please enter both email and password.');
      toast.error('Please enter both email and password.');
      return;
    }

    setFieldError('');
    setLoading(true);
    const result = await login(trimmedEmail, password);
    setLoading(false);

    if (!result.success) {
      toast.error(result.error || 'Login failed. Please try again.');
      return;
    }

    toast.success(`Welcome back, ${result.user?.name}!`);
    router.push('/book');
  };

  if (!hydrated || isRedirecting) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white p-5 sm:p-8 rounded-3xl border border-gray-200 shadow-xl space-y-5 sm:space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-green-600 text-white font-black text-2xl flex items-center justify-center mx-auto shadow-md">
            K
          </div>
          <h1 className="text-2xl font-black text-gray-900">Sign In to K-HUB</h1>
          <p className="text-xs text-gray-500">Access your bookings and court reservations</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Email Address *</label>
            <input
              id="login-email"
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFieldError(''); }}
              className="w-full khub-input"
              aria-invalid={!!fieldError}
              aria-describedby="login-error"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Password *</label>
            <input
              id="login-password"
              type="password"
              required
              placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldError(''); }}
              className="w-full khub-input"
              aria-invalid={!!fieldError}
              aria-describedby="login-error"
            />
          </div>

          {fieldError && (
            <p id="login-error" className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg" role="alert">
              {fieldError}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={loading}
            aria-busy={loading}
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'Signing In...' : 'Sign In'}</span>
          </Button>
        </form>

        <p className="text-center text-xs text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="font-extrabold text-green-600 hover:underline inline-block py-3.5">
            Register Here
          </Link>
        </p>
      </div>
    </div>
  );
}
