'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGuestGuard, sanitizeNextPath } from '@/hooks/useGuestGuard';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { WegoLogo } from '@/components/ui/Logo';

/** Safe internal destination from the current URL's `next` param, or null. */
function getNextDestination(): string | null {
  if (typeof window === 'undefined') return null;
  return sanitizeNextPath(
    new URLSearchParams(window.location.search).get('next')
  );
}

export default function LoginForm() {
  const router = useRouter();
  const nextDestination = getNextDestination();
  const user = useAuthStore((state) => state.user);
  const fallbackDestination = user?.role === 'Admin' ? '/admin' : '/book';
  const { hydrated, isRedirecting } = useGuestGuard(nextDestination ?? fallbackDestination);
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
    const defaultTarget = result.user?.role === 'Admin' ? '/admin' : '/book';
    router.push(getNextDestination() ?? defaultTarget);
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
      <div className="w-full max-w-md bg-white dark:bg-[#1D2821] p-5 sm:p-8 rounded-3xl border border-gray-200 dark:border-[#344239] shadow-xl space-y-5 sm:space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-1">
            <WegoLogo size="xl" showTagline />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-[#F5F7F5]">Sign In to WEGO</h1>
          <p className="text-xs text-gray-500 dark:text-[#8A9A8E]">Access your bookings and court reservations</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-bold text-gray-700 dark:text-[#A1ADA4] uppercase mb-1.5">Email Address *</label>
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
            <label htmlFor="login-password" className="block text-xs font-bold text-gray-700 dark:text-[#A1ADA4] uppercase mb-1.5">Password *</label>
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
            <p id="login-error" className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-transparent dark:border-red-900/40 px-3 py-2 rounded-lg" role="alert">
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

        <p className="text-center text-xs text-gray-500 dark:text-[#8A9A8E]">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="font-extrabold text-green-600 dark:text-[#4ADE80] hover:underline inline-block py-3.5">
            Register Here
          </Link>
        </p>
      </div>
    </div>
  );
}
