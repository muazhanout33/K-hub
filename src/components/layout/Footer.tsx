'use client';

import Link from 'next/link';
import { Globe, Share2, MessageCircle, Send, ArrowRight } from 'lucide-react';
import { SiteContainer } from './SiteContainer';

export function Footer() {
  return (
    <footer className="bg-white footer-divider pt-16 pb-12">
      <SiteContainer>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-gray-100">
          {/* Col 1: Brand */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3 min-h-[44px]">
              <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center text-white font-extrabold text-xl shadow-md">
                K
              </div>
              <span className="font-extrabold text-xl tracking-tight text-gray-900">
                K-HUB <span className="text-green-600 font-semibold text-xs">SPORTS CLUB</span>
              </span>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm">
              World-class sports booking platform. Reserve Padel, Football, and Tennis courts in seconds with real-time availability and 100% conflict-free guarantees.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a href="#" className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-green-600 hover:text-white transition-colors" title="Website">
                <Globe className="w-4 h-4" />
              </a>
              <a href="#" className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-green-600 hover:text-white transition-colors" title="Community">
                <MessageCircle className="w-4 h-4" />
              </a>
              <a href="#" className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-green-600 hover:text-white transition-colors" title="Social">
                <Share2 className="w-4 h-4" />
              </a>
              <a href="#" className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-green-600 hover:text-white transition-colors" title="Telegram">
                <Send className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h3 className="font-bold text-sm text-gray-900 mb-4 tracking-wider uppercase">Quick Links</h3>
            <ul className="space-y-1 text-sm">
              <li><Link href="/courts" className="text-gray-600 hover:text-green-600 transition-colors py-3 inline-block">Browse Courts</Link></li>
              <li><Link href="/book" className="text-gray-600 hover:text-green-600 transition-colors py-3 inline-block">Book a Court</Link></li>
              <li><Link href="/membership" className="text-gray-600 hover:text-green-600 transition-colors py-3 inline-block">Membership Plans</Link></li>
              <li><Link href="/sponsors" className="text-gray-600 hover:text-green-600 transition-colors py-3 inline-block">Official Sponsors</Link></li>
              <li><Link href="/events" className="text-gray-600 hover:text-green-600 transition-colors py-3 inline-block">Tournaments & Events</Link></li>
            </ul>
          </div>

          {/* Col 3: Information */}
          <div>
            <h3 className="font-bold text-sm text-gray-900 mb-4 tracking-wider uppercase">Club Info</h3>
            <ul className="space-y-1 text-sm">
              <li><Link href="/about" className="text-gray-600 hover:text-green-600 transition-colors py-3 inline-block">About K-HUB</Link></li>
              <li><Link href="/contact" className="text-gray-600 hover:text-green-600 transition-colors py-3 inline-block">Contact & Location</Link></li>
              <li><span className="text-gray-600 py-3 inline-block">Hours: 06:00 AM - 12:00 AM</span></li>
              <li><span className="text-gray-600 py-3 inline-block">Location: Shebin El-Kom, Monufia</span></li>
              <li><Link href="/contact" className="text-gray-600 hover:text-green-600 transition-colors py-3 inline-block">Support & FAQs</Link></li>
            </ul>
          </div>

          {/* Col 4: Newsletter */}
          <div>
            <h3 className="font-bold text-sm text-gray-900 mb-4 tracking-wider uppercase">Newsletter</h3>
            <p className="text-xs text-gray-500 mb-3">Get tournament announcements and exclusive court discounts.</p>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-2">
              <input
                type="email"
                placeholder="Enter your email"
                className="khub-input text-xs"
              />
              <button
                type="submit"
                className="w-full py-3.5 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Subscribe</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <p>© 2026 K-HUB Sports Club. All rights reserved. Powered by Kandil Group</p>
          <div className="flex gap-6">
            <span className="hover:underline cursor-pointer py-3 inline-block">Privacy Policy</span>
            <span className="hover:underline cursor-pointer py-3 inline-block">Terms of Service</span>
            <span className="hover:underline cursor-pointer py-3 inline-block">Cancellation Policy</span>
         </div>
       </div>
     </SiteContainer>
   </footer>
  );
}
