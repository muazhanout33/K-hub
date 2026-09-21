'use client';

import { useState } from 'react';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { MapPin, Phone, Mail, Clock, Send, Navigation, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { submitContactAction } from '@/app/actions/contact.actions';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', subject: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.subject || !form.message) {
      toast.error('Please complete all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitContactAction({
        name: form.name,
        email: form.email,
        subject: form.subject,
        message: form.message,
      });

      if (result.success) {
        toast.success('Message sent successfully! Our club manager will respond within 2 hours.');
        setForm({ name: '', phone: '', email: '', subject: '', message: '' });
      } else {
        toast.error(result.error || 'Failed to send message. Please try again.');
      }
    } catch {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Page hero — no mt-14 hack; sticky navbar handled by layout */}
      <section className="bg-white border-b border-gray-200/80 py-8 sm:py-14 text-center">
        <SiteContainer>
          <div className="page-hero-inner page-hero-inner--center">
            <div className="flex justify-center">
              <Badge icon={<Mail className="icon-inline text-green-600" />} size="sm">
                Contact &amp; Support
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tight leading-[1.05]">We Are Here To Help</h1>
            <p className="text-sm sm:text-base text-muted max-w-2xl mx-auto leading-relaxed">
              Have a question about court reservations, membership plans, or private tournament hosting? Reach out anytime!
            </p>
          </div>
        </SiteContainer>
      </section>

      <SiteContainer as="section" className="py-10 sm:py-16 pb-12">
        <div className="bg-white rounded-[var(--radius-xl)] border border-gray-200/80 p-5 sm:p-8 lg:p-12 shadow-xl grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-start">
          {/* Left Form */}
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-4 sm:mb-6">Send A Direct Message</h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                {/* Label directly above input with consistent mb-1.5 gap */}
                <label htmlFor="contact-name" className="block text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-1.5">
                  Your Full Name *
                </label>
                {/* Standard .khub-input height (44px) — no !h-12 override */}
                <input
                  id="contact-name"
                  type="text"
                  required
                  placeholder="e.g. Sarah Jenkins"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="khub-input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-phone" className="block text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-1.5">
                    Phone Number
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="khub-input"
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-1.5">
                    Email Address *
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    placeholder="sarah@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="khub-input"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="contact-subject" className="block text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-1.5">
                  Subject *
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  required
                  placeholder="e.g. Court booking inquiry"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="khub-input"
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="block text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-1.5">
                  Message *
                </label>
                <textarea
                  id="contact-message"
                  required
                  rows={4}
                  placeholder="Type your message here..."
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="khub-input resize-none"
                />
              </div>
              {/* Full-width primary button — proper Button component, no rounded-full override */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isSubmitting}
                className="w-full font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="icon-btn animate-spin" />
                ) : (
                  <Send className="icon-btn" />
                )}
                <span>{isSubmitting ? 'Sending...' : 'Send Message'}</span>
              </Button>
            </form>
          </div>

          {/* Right Info & Map */}
          <div className="space-y-6 flex flex-col">
            {/* Info Card */}
            <div className="bg-white rounded-[var(--radius-lg)] border border-gray-200/80 p-4 sm:p-6 shadow-sm">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-1">Club Location &amp; Hours</h2>
              <p className="text-xs text-muted mb-5 leading-relaxed">
                Visit us in person or reach the front desk during operating hours.
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3.5 rounded-[var(--radius-sm)] bg-gray-50 border border-gray-100">
                  <MapPin className="icon-btn text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-gray-900 block">Address</span>
                    <a href="https://maps.app.goo.gl/ZCf1mssj1hdpqiop9" target="_blank" rel="noreferrer" className="text-muted text-sm hover:text-green-600 transition-colors">
                      Hamdi Kandil Buildings,<br />Shebin El-Kom,<br />Monufia, Egypt
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3.5 rounded-[var(--radius-sm)] bg-gray-50 border border-gray-100">
                  <Phone className="icon-btn text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-gray-900 block">Telephone Hotline</span>
                    <div className="flex flex-col gap-0.5">
                      <a href="tel:01097747738" className="text-muted text-sm hover:text-green-600 transition-colors inline-block py-3">0109 774 7738</a>
                      <a href="tel:01031882128" className="text-muted text-sm hover:text-green-600 transition-colors inline-block py-3">0103 188 2128</a>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3.5 rounded-[var(--radius-sm)] bg-gray-50 border border-gray-100">
                  <Clock className="icon-btn text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-gray-900 block">Operating Hours</span>
                    <span className="text-muted text-sm">Monday – Sunday: 06:00 AM – 12:00 AM (Midnight)</span>
                  </div>
                </div>
              </div>

              <a
                href="https://maps.app.goo.gl/ZCf1mssj1hdpqiop9"
                target="_blank"
                rel="noreferrer"
                className="mt-4 w-full h-11 rounded-[var(--radius-md)] bg-green-600 hover:bg-green-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm shadow-green-600/20"
              >
                <Navigation className="icon-inline" />
                <span>Get Directions</span>
              </a>
            </div>

            {/* Map Card — explicit fixed height, rounded, clipped container */}
            <div className="bg-white rounded-[var(--radius-lg)] border border-gray-200/80 p-3 shadow-sm flex-1">
              <div className="h-72 md:h-80 w-full rounded-[var(--radius-sm)] overflow-hidden bg-gray-100">
                <iframe
                  title="Google Map"
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d0!2d0!3d0!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z4pShIDQzwrAyMiczMi44TiIgMjYywrAyMicxNi40RQ!5e0!3m2!1sen!2seg!4v1620000000000!5m2!1sen!2seg"
                  className="w-full h-full border-0 grayscale hover:grayscale-0 transition-all duration-300"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </SiteContainer>
    </div>
  );
}
