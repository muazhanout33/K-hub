'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { BookingSteps } from '@/features/booking/BookingSteps';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import { UserCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function BookingDetailsPage() {
  const router = useRouter();
  const selectedCourt = useBookingStore((s) => s.selectedCourt);
  const selectedSlots = useBookingStore((s) => s.selectedSlots);
  const setUserDetails = useBookingStore((s) => s.setUserDetails);
  const setBookingStep = useBookingStore((s) => s.setBookingStep);
  const storeUserName = useBookingStore((s) => s.userName);
  const storeUserEmail = useBookingStore((s) => s.userEmail);
  const storeUserPhone = useBookingStore((s) => s.userPhone);
  const authUser = useAuthStore((s) => s.user);

  // Auto-fill from auth store if available, then fall back to booking store values
  const [name, setName] = useState(
    storeUserName || authUser?.name || ''
  );
  const [email, setEmail] = useState(
    storeUserEmail || authUser?.email || ''
  );
  const [phone, setPhone] = useState(
    storeUserPhone || authUser?.phone || ''
  );

  if (!selectedCourt || selectedSlots.length === 0) {
    return (
      <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC]">
        <SiteContainer className="py-16 sm:py-20 text-center">
          <p className="text-gray-500 text-sm">No booking in progress. Please select a court and time first.</p>
          <Button render={<a href="/book" />} nativeButton={false} variant="primary" size="md" className="mt-4">
            Start Booking
          </Button>
        </SiteContainer>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (!phone.trim()) {
      toast.error('Please enter your phone number.');
      return;
    }

    setUserDetails({ userName: name.trim(), userEmail: email.trim(), userPhone: phone.trim() });
    setBookingStep(4);
    router.push('/book/payment');
  };

  return (
    <div className="space-y-6 sm:space-y-10 bg-[#F8FAFC]">
      <section className="bg-white border-b border-gray-200/80 py-6 sm:py-10">
        <SiteContainer>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
            <div className="section-head mb-0">
              <Badge icon={<UserCheck className="icon-inline text-green-600" />} size="sm">
                Step 3 of 4
              </Badge>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 tracking-tight leading-[1.05]">Your Details</h1>
              <p className="text-sm text-muted max-w-xl leading-relaxed">
                Enter your contact information to complete the booking.
              </p>
            </div>
          </div>
        </SiteContainer>
      </section>

      <SiteContainer className="pb-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <BookingSteps />

          <form onSubmit={handleSubmit} className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-4 sm:p-6 space-y-5">
            <div>
              <label htmlFor="name" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Full Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm text-[#0F172A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Email Address *
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm text-[#0F172A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Phone Number *
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+20 100 000 0000"
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm text-[#0F172A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
              />
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
              <Button
                type="button"
                onClick={() => {
                  setBookingStep(2);
                  router.push('/book');
                }}
                variant="outline"
                size="md"
                className="w-full sm:w-auto px-8"
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full sm:w-auto px-8"
              >
                Continue to Payment
              </Button>
            </div>
          </form>
        </div>
      </SiteContainer>
    </div>
  );
}
