'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Home,
  Trophy,
  CalendarCheck,
  Sparkles,
  PartyPopper,
  Info,
  Mail,
  Bell,
  HelpCircle,
  Settings,
  LogOut,
  Megaphone,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useReservationTimer } from '@/features/booking/useReservationTimer';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/courts', label: 'Courts', icon: Trophy },
  { href: '/book', label: 'Book Court', icon: CalendarCheck },
  { href: '/sponsors', label: 'Sponsors', icon: Sparkles },
  { href: '/advertise', label: 'Advertise', icon: Megaphone },
  { href: '/events', label: 'Events', icon: PartyPopper },
  { href: '/about', label: 'About', icon: Info },
  { href: '/contact', label: 'Contact', icon: Mail },
];

export function Sidebar({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const { isActive, formattedTime } = useReservationTimer();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <aside className={`sidebar-nav flex flex-col justify-between p-6 bg-white border-r border-gray-200 ${className}`}>
      <div>
        {/* Top Area: Logo */}
        <Link href="/" className="flex items-center gap-3 mb-8 px-2 group">
          <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center text-white font-extrabold text-xl shadow-md group-hover:scale-105 transition-transform">
            K
          </div>
          <div>
            <span className="font-black text-lg tracking-tight text-gray-900 block leading-none">
              K-HUB
            </span>
            <span className="text-[11px] font-semibold text-green-600 tracking-wider uppercase block mt-1">
              Sports Club
            </span>
          </div>
        </Link>

        {/* Temporary Lock Live Badge if active */}
        {isActive && (
          <div className="mb-6 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between text-xs font-semibold shadow-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              Slot Reserved:
            </span>
            <span className="font-mono text-sm font-bold text-amber-900">{formattedTime}</span>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActivePage = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-3 px-4 py-3 rounded-2xl font-medium text-sm transition-all duration-200 group ${
                  isActivePage
                    ? 'bg-green-50 text-green-700 font-semibold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {isActivePage && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 top-2 bottom-2 w-1.5 bg-green-600 rounded-r-full"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActivePage ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-700'
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Area */}
      <div className="pt-6 border-t border-gray-100 space-y-3">
        {/* Secondary controls */}
        <div className="flex items-center justify-around px-2 text-gray-400">
          <Link href="/bookings" className="p-2 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors relative" title="My Bookings">
            <Bell className="w-5 h-5" />
          </Link>
          <Link href="/about" className="p-2 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors" title="Help & Support">
            <HelpCircle className="w-5 h-5" />
          </Link>
          <Link href="/contact" className="p-2 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors" title="Settings">
            <Settings className="w-5 h-5" />
          </Link>
        </div>

        {/* User Profile Card */}
        {isAuthenticated && user ? (
          <div className="p-3 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
            <Link href="/bookings" className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity">
              <div className="relative w-9 h-9 rounded-full overflow-hidden ring-2 ring-green-500/20">
                <Image
                  src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                  alt={user.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900 truncate">{user.name}</p>
                <p className="text-[11px] text-green-600 font-medium truncate">Member</p>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Link
              href="/auth/login"
              className="flex-1 py-2.5 px-3 text-center text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/auth/register"
              className="flex-1 py-2.5 px-3 text-center text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors"
            >
              Register
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
