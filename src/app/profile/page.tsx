'use client';

import { useState } from 'react';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { User, Save, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export default function ProfilePage() {
  const { user, isRedirecting } = useAuthGuard();
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Initialize form from store only after hydration
  const [formReady, setFormReady] = useState(false);
  if (user && !formReady) {
    setName(user.name);
    setPhone(user.phone || '');
    setFormReady(true);
  }

  if (isRedirecting) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Redirecting to login...</p>
      </div>
    );
  }

  if (!user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Name cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({ name: trimmedName, phone: phone.trim() });
      setSaved(true);
      toast.success('Profile updated successfully.');
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white p-5 sm:p-8 rounded-3xl border border-gray-200 shadow-xl space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-green-600 text-white font-black text-2xl flex items-center justify-center mx-auto shadow-md">
            <User className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">My Profile</h1>
          <p className="text-xs text-gray-500">Manage your account details</p>
        </div>

        {/* Role badge */}
        <div className="flex justify-center">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
            user.role === 'Admin'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-green-100 text-green-700'
          }`}>
            {user.role}
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full khub-input"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Email Address</label>
            <input
              type="email"
              disabled
              value={user.email}
              className="w-full khub-input bg-gray-50 text-gray-500 cursor-not-allowed"
            />
            <p className="text-[10px] text-gray-400 mt-1">Email cannot be changed</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter phone number"
              className="w-full khub-input"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Member Since</label>
            <input
              type="text"
              disabled
              value={user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
              className="w-full khub-input bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={saving}
          >
            {saved ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
