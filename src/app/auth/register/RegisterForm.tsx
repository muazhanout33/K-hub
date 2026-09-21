'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGuestGuard } from '@/hooks/useGuestGuard';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export default function RegisterForm() {
  const router = useRouter();
  const { hydrated, isRedirecting } = useGuestGuard();
  const register = useAuthStore((state) => state.register);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPhone || !password || !confirmPassword) {
      toast.error('Please complete all fields.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setLoading(true);
    const result = await register(trimmedName, trimmedEmail, trimmedPhone, password);
    setLoading(false);

    if (!result.success) {
      toast.error(result.error || 'Registration failed. Please try again.');
      return;
    }

    toast.success('Account created successfully! Welcome to K-HUB Sports.');
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
          <h1 className="text-2xl font-black text-gray-900">Create Player Account</h1>
          <p className="text-xs text-gray-500">Join K-HUB to reserve courts and track bookings</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="register-name" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Full Name *</label>
            <input
              id="register-name"
              type="text"
              required
              placeholder="e.g. John Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full khub-input"
            />
          </div>

          <div>
            <label htmlFor="register-email" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Email Address *</label>
            <input
              id="register-email"
              type="email"
              required
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full khub-input"
            />
          </div>

          <div>
            <label htmlFor="register-phone" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Phone Number *</label>
            <input
              id="register-phone"
              type="tel"
              required
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full khub-input"
            />
          </div>

          <div>
            <label htmlFor="register-password" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Password *</label>
            <input
              id="register-password"
              type="password"
              required
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full khub-input"
            />
          </div>

          <div>
            <label htmlFor="register-confirm-password" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Confirm Password *</label>
            <input
              id="register-confirm-password"
              type="password"
              required
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full khub-input"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={loading}
            aria-busy={loading}
          >
            <UserPlus className="w-4 h-4" />
            <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
          </Button>
        </form>

        <p className="text-center text-xs text-gray-500">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-extrabold text-green-600 hover:underline inline-block py-3.5">
            Sign In Here
          </Link>
        </p>
      </div>
    </div>
  );
}
