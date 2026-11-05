'use client';

import Link from 'next/link';
import { Globe, Share2, MessageCircle, Send, ArrowRight } from 'lucide-react';
import { SiteContainer } from './SiteContainer';
import { WegoLogo } from '@/components/ui/Logo';

export function Footer() {
  return (
    <footer className="bg-white footer-divider pt-10 sm:pt-16 pb-10 sm:pb-12 dark:bg-[#101512] dark:border-[#344239] transition-colors">
      <SiteContainer>
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-x-5 gap-y-10 pb-12 border-b border-gray-100 dark:border-[#344239]">
          {/* Col 1: Brand */}
          <div className="col-span-2 md:col-span-2 lg:col-span-2 space-y-4">
            <Link href="/" className="inline-flex items-center min-h-[44px]" aria-label="WEGO Home">
              <WegoLogo size="lg" showTagline />
            </Link>
            <p className="text-sm text-gray-500 dark:text-[#A1ADA4] leading-relaxed max-w-sm">
              World-class sports booking platform. Reserve Padel, Football, and Tennis courts in seconds with real-time availability and 100% conflict-free guarantees.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a href="#" className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 dark:bg-[#1D2821] dark:text-[#A1ADA4] flex items-center justify-center hover:bg-green-600 hover:text-white dark:hover:bg-[#16A34A] dark:hover:text-[#101512] transition-colors" title="Website">
                <Globe className="w-4 h-4" />
              </a>
              <a href="#" className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 dark:bg-[#1D2821] dark:text-[#A1ADA4] flex items-center justify-center hover:bg-green-600 hover:text-white dark:hover:bg-[#16A34A] dark:hover:text-[#101512] transition-colors" title="Community">
                <MessageCircle className="w-4 h-4" />
              </a>
              <a href="#" className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 dark:bg-[#1D2821] dark:text-[#A1ADA4] flex items-center justify-center hover:bg-green-600 hover:text-white dark:hover:bg-[#16A34A] dark:hover:text-[#101512] transition-colors" title="Social">
                <Share2 className="w-4 h-4" />
              </a>
              <a href="#" className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 dark:bg-[#1D2821] dark:text-[#A1ADA4] flex items-center justify-center hover:bg-green-600 hover:text-white dark:hover:bg-[#16A34A] dark:hover:text-[#101512] transition-colors" title="Telegram">
                <Send className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-[#F5F7F5] mb-4 tracking-wider uppercase">Quick Links</h3>
            <ul className="space-y-1 text-sm">
              <li><Link href="/courts" className="text-gray-600 hover:text-green-600 dark:text-[#A1ADA4] dark:hover:text-[#4ADE80] transition-colors py-3 inline-block">Browse Courts</Link></li>
              <li><Link href="/book" className="text-gray-600 hover:text-green-600 dark:text-[#A1ADA4] dark:hover:text-[#4ADE80] transition-colors py-3 inline-block">Book a Court</Link></li>
              <li><Link href="/membership" className="text-gray-600 hover:text-green-600 dark:text-[#A1ADA4] dark:hover:text-[#4ADE80] transition-colors py-3 inline-block">Membership Plans</Link></li>
              <li><Link href="/sponsors" className="text-gray-600 hover:text-green-600 dark:text-[#A1ADA4] dark:hover:text-[#4ADE80] transition-colors py-3 inline-block">Official Sponsors</Link></li>
              <li><Link href="/events" className="text-gray-600 hover:text-green-600 dark:text-[#A1ADA4] dark:hover:text-[#4ADE80] transition-colors py-3 inline-block">Tournaments & Events</Link></li>
            </ul>
          </div>

          {/* Col 3: Information */}
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-[#F5F7F5] mb-4 tracking-wider uppercase">Club Info</h3>
            <ul className="space-y-1 text-sm">
              <li><Link href="/about" className="text-gray-600 hover:text-green-600 dark:text-[#A1ADA4] dark:hover:text-[#4ADE80] transition-colors py-3 inline-block">About WEGO</Link></li>
              <li><Link href="/contact" className="text-gray-600 hover:text-green-600 dark:text-[#A1ADA4] dark:hover:text-[#4ADE80] transition-colors py-3 inline-block">Contact & Location</Link></li>
              <li><span className="text-gray-600 dark:text-[#A1ADA4] py-3 inline-block">Hours: 06:00 AM - 12:00 AM</span></li>
              <li><span className="text-gray-600 dark:text-[#A1ADA4] py-3 inline-block">Location: Shebin El-Kom, Monufia</span></li>
              <li><Link href="/contact" className="text-gray-600 hover:text-green-600 dark:text-[#A1ADA4] dark:hover:text-[#4ADE80] transition-colors py-3 inline-block">Support & FAQs</Link></li>
            </ul>
          </div>

          {/* Col 4: Newsletter */}
          <div className="col-span-2 md:col-span-2 lg:col-span-1">
            <h3 className="font-bold text-sm text-gray-900 dark:text-[#F5F7F5] mb-4 tracking-wider uppercase">Newsletter</h3>
            <p className="text-xs text-gray-500 dark:text-[#A1ADA4] mb-3">Get tournament announcements and exclusive court discounts.</p>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-2">
              <input
                type="email"
                placeholder="Enter your email"
                className="wego-input text-xs"
              />
              <button
                type="submit"
                className="w-full py-3.5 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white dark:bg-[#16A34A] dark:hover:bg-[#22C55E] dark:text-[#101512] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Subscribe</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500 dark:text-[#8A9A8E]">
          <p>© 2026 WEGO. All rights reserved.</p>
          <div className="flex gap-6">
            <span className="hover:underline cursor-pointer py-3 inline-block">Privacy Policy</span>
            <span className="hover:underline cursor-pointer py-3 inline-block">Terms of Service</span>
            <span className="hover:underline cursor-pointer py-3 inline-block">Cancellation Policy</span>
          </div>
        </div>
      </SiteContainer>

      {/* Mobile-only offset for the fixed BottomNav — keeps footer content
          reachable above the tab bar. Desktop unaffected. */}
      <div
        aria-hidden="true"
        className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden"
      />
    </footer>
  );
}
