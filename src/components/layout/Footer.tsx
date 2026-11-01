'use client';

import Link from 'next/link';
import { Globe, Share2, MessageCircle, Send, ArrowRight } from 'lucide-react';
import { SiteContainer } from './SiteContainer';
import { useT } from '@/components/i18n/LocaleProvider';

export function Footer() {
  const t = useT();
  return (
    <footer className="bg-[var(--card)] footer-divider pt-16 pb-12">
      <SiteContainer>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-[var(--border-light)]">
          {/* Col 1: Brand */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3 min-h-[44px]">
              <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center text-white font-extrabold text-xl shadow-md">
                K
              </div>
              <span className="font-extrabold text-xl tracking-tight text-[var(--text-main)]">
                K-HUB <span className="text-green-600 font-semibold text-xs">SPORTS CLUB</span>
              </span>
            </Link>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-sm">
              {t('footer.description')}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a href="#" className="w-11 h-11 rounded-full bg-[var(--surface-3)] text-[var(--text-muted)] flex items-center justify-center hover:bg-green-600 hover:text-white transition-colors" title={t('footer.social.website')}>
                <Globe className="w-4 h-4" />
              </a>
              <a href="#" className="w-11 h-11 rounded-full bg-[var(--surface-3)] text-[var(--text-muted)] flex items-center justify-center hover:bg-green-600 hover:text-white transition-colors" title={t('footer.social.community')}>
                <MessageCircle className="w-4 h-4" />
              </a>
              <a href="#" className="w-11 h-11 rounded-full bg-[var(--surface-3)] text-[var(--text-muted)] flex items-center justify-center hover:bg-green-600 hover:text-white transition-colors" title={t('footer.social.social')}>
                <Share2 className="w-4 h-4" />
              </a>
              <a href="#" className="w-11 h-11 rounded-full bg-[var(--surface-3)] text-[var(--text-muted)] flex items-center justify-center hover:bg-green-600 hover:text-white transition-colors" title={t('footer.social.telegram')}>
                <Send className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h3 className="font-bold text-sm text-[var(--text-main)] mb-4 tracking-wider uppercase">{t('footer.quickLinksTitle')}</h3>
            <ul className="space-y-1 text-sm">
              <li><Link href="/courts" className="text-[var(--text-muted)] hover:text-green-600 transition-colors py-3 inline-block">{t('footer.quickLinks.browseCourts')}</Link></li>
              <li><Link href="/book" className="text-[var(--text-muted)] hover:text-green-600 transition-colors py-3 inline-block">{t('footer.quickLinks.bookCourt')}</Link></li>
              <li><Link href="/membership" className="text-[var(--text-muted)] hover:text-green-600 transition-colors py-3 inline-block">{t('footer.quickLinks.membershipPlans')}</Link></li>
              <li><Link href="/sponsors" className="text-[var(--text-muted)] hover:text-green-600 transition-colors py-3 inline-block">{t('footer.quickLinks.officialSponsors')}</Link></li>
              <li><Link href="/events" className="text-[var(--text-muted)] hover:text-green-600 transition-colors py-3 inline-block">{t('footer.quickLinks.tournaments')}</Link></li>
            </ul>
          </div>

          {/* Col 3: Information */}
          <div>
            <h3 className="font-bold text-sm text-[var(--text-main)] mb-4 tracking-wider uppercase">{t('footer.infoTitle')}</h3>
            <ul className="space-y-1 text-sm">
              <li><Link href="/about" className="text-[var(--text-muted)] hover:text-green-600 transition-colors py-3 inline-block">{t('footer.info.about')}</Link></li>
              <li><Link href="/contact" className="text-[var(--text-muted)] hover:text-green-600 transition-colors py-3 inline-block">{t('footer.info.contactLocation')}</Link></li>
              <li><span className="text-[var(--text-muted)] py-3 inline-block">{t('footer.info.hours')}</span></li>
              <li><span className="text-[var(--text-muted)] py-3 inline-block">{t('footer.info.location')}</span></li>
              <li><Link href="/contact" className="text-[var(--text-muted)] hover:text-green-600 transition-colors py-3 inline-block">{t('footer.info.supportFaqs')}</Link></li>
            </ul>
          </div>

          {/* Col 4: Newsletter */}
          <div>
            <h3 className="font-bold text-sm text-[var(--text-main)] mb-4 tracking-wider uppercase">{t('footer.newsletterTitle')}</h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">{t('footer.newsletterDescription')}</p>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-2">
              <input
                type="email"
                placeholder={t('footer.emailPlaceholder')}
                aria-label={t('footer.emailPlaceholder')}
                className="khub-input text-xs"
              />
              <button
                type="submit"
                className="w-full py-3.5 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>{t('footer.subscribe')}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
          <p>{t('footer.copyright')}</p>
          <div className="flex gap-6">
            <span className="hover:underline cursor-pointer py-3 inline-block">{t('footer.privacyPolicy')}</span>
            <span className="hover:underline cursor-pointer py-3 inline-block">{t('footer.termsOfService')}</span>
            <span className="hover:underline cursor-pointer py-3 inline-block">{t('footer.cancellationPolicy')}</span>
         </div>
       </div>
     </SiteContainer>
   </footer>
  );
}
