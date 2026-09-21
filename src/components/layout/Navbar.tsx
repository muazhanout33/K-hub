'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { User, Menu, X, LogOut, UserPlus } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { Button } from '@/components/ui/button';
import { SiteContainer } from './SiteContainer';
import { getCourtsFromSupabase } from '@/services/court.service';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { NotificationBell } from '@/components/notifications/NotificationBell';

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/courts', label: 'Courts' },
  { href: '/bookings', label: 'My Bookings', authOnly: true },
  { href: '/sponsors', label: 'Sponsors' },
  { href: '/advertise', label: 'Advertise' },
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact' },
  { href: '/admin', label: 'Admin', adminOnly: true },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const selectCourt = useBookingStore((s) => s.selectCourt);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const firstFocusable = getFocusable()[0];
    if (firstFocusable) firstFocusable.focus();
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [mobileOpen, closeMenu]);

  const handleBookNow = async () => {
    try {
      const courts = await getCourtsFromSupabase();
      if (courts.length > 0) {
        selectCourt(courts[0]);
      }
    } catch {
      // If courts fail to load, still navigate to /book — the booking page
      // will show its own error state if no court is available.
    }
    router.push('/book');
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <SiteContainer className="h-[76px] lg:h-[80px] flex items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3.5 sm:gap-4 shrink-0 group py-1">
            <div className="relative w-12 h-12 sm:w-13 sm:h-13 lg:w-14 lg:h-14 shrink-0 transition-transform duration-200 ease-out group-hover:scale-[1.03]">
              <Image
                src="/khub logo.png"
                alt="K-HUB Sports Club Logo"
                width={56}
                height={56}
                className="w-full h-full object-contain drop-shadow-sm"
                priority
              />
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-black text-[22px] sm:text-[24px] lg:text-[26px] text-slate-900 tracking-[-0.03em] leading-none group-hover:text-black transition-colors">
                K-HUB
              </span>
              <span className="text-[10px] sm:text-[11px] lg:text-[11.5px] font-bold text-[#16A34A] tracking-[0.22em] uppercase leading-none mt-[3.5px]">
                Sports Club
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden xl:flex flex-1 items-center justify-center gap-1">
            {NAV_ITEMS.filter((item) => {
              if (item.authOnly && !isAuthenticated) return false;
              if (item.adminOnly && user?.role !== 'Admin') return false;
              return true;
            }).map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 xl:px-4.5 py-2 rounded-xl text-sm xl:text-[15px] font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-[#16A34A]/10 text-[#15803D] font-semibold'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/80'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Notification Bell */}
            <NotificationBell />

            {/* Divider */}
            <div className="w-px h-6 bg-gray-200 hidden md:block" />

            {/* Book Now CTA */}
            <Button
              onClick={handleBookNow}
              variant="primary"
              size="sm"
              className="hidden md:inline-flex rounded-full px-6 h-11 text-[14px] font-semibold tracking-wide shadow-sm"
            >
              Book Now
            </Button>

            {/* User Avatar / Auth Links */}
            {isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/profile')}
                  className="w-11 h-11 rounded-full overflow-hidden ring-[1.5px] ring-gray-200 hover:ring-[#16A34A] transition-all duration-200 shrink-0 flex items-center justify-center cursor-pointer"
                  aria-label="My profile"
                >
                  {user.avatar ? (
                    <div className="relative w-full h-full">
                      <Image
                        src={user.avatar}
                        alt={user.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-[#16A34A]/10 flex items-center justify-center">
                      <User className="w-[18px] h-[18px] text-[#16A34A]" />
                    </div>
                  )}
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors hidden md:block"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/auth/register"
                  className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold text-[#16A34A] border border-[#16A34A]/30 hover:bg-[#16A34A]/5 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Register
                </Link>
                <Link
                  href="/auth/login"
                  className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200/80 transition-colors shrink-0"
                  aria-label="Sign in"
                >
                  <User className="w-4 h-4 text-gray-500" />
                </Link>
              </div>
            )}

            {/* Mobile hamburger */}
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="icon"
              className="xl:hidden h-11 w-11 rounded-xl"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
           </Button>
         </div>
       </SiteContainer>
     </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="xl:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            onClick={closeMenu}
            aria-hidden="true"
          />
          <div
            id="mobile-nav-drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="relative ml-auto w-[300px] bg-white h-full shadow-2xl flex flex-col"
          >
            <div className="px-5 h-[68px] border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 shrink-0">
                  <Image
                    src="/khub logo.png"
                    alt="K-HUB Sports Club Logo"
                    width={40}
                    height={40}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex flex-col justify-center">
                  <span className="font-black text-[19px] text-slate-900 tracking-[-0.03em] leading-none">
                    K-HUB
                  </span>
                  <span className="text-[10px] font-bold text-[#16A34A] tracking-[0.20em] uppercase leading-none mt-[2.5px]">
                    Sports Club
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={closeMenu}
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
              {NAV_ITEMS.filter((item) => {
                if (item.authOnly && !isAuthenticated) return false;
                if (item.adminOnly && user?.role !== 'Admin') return false;
                return true;
              }).map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    className={`flex items-center px-4 py-3 rounded-xl text-[14px] font-medium transition-colors ${
                      isActive
                        ? 'bg-[#16A34A]/10 text-[#15803D] font-semibold'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              {/* Profile + Logout for authenticated users */}
              {isAuthenticated && (
                <>
                  <Link
                    href="/profile"
                    onClick={closeMenu}
                    className={`flex items-center px-4 py-3 rounded-xl text-[14px] font-medium transition-colors ${
                      pathname === '/profile'
                        ? 'bg-[#16A34A]/10 text-[#15803D] font-semibold'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-4 py-3 rounded-xl text-[14px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Sign Out
                  </button>
                </>
              )}
              {/* Register link for guests */}
              {!isAuthenticated && (
                <Link
                  href="/auth/register"
                  onClick={closeMenu}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold text-[#16A34A] hover:bg-[#16A34A]/5 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Register
                </Link>
              )}
            </nav>
            <div className="p-4 border-t border-gray-100/60">
              <Button
                onClick={() => { handleBookNow(); closeMenu(); }}
                variant="primary"
                size="lg"
                className="w-full rounded-full font-bold"
              >
                Book Now
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
