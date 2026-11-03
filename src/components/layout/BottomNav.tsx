'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, CalendarCheck, User } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mobile-only bottom navigation (hidden from `md` up).
 * Rendered by PublicChrome on every public route — never on /admin or /admin/*.
 * Uses the actual existing routes; /bookings and /profile keep their own
 * existing auth-guard redirect behavior.
 */
const TABS = [
  { href: '/', label: 'Home', icon: Home, exact: true },
  { href: '/courts', label: 'Explore', icon: Compass, exact: false },
  { href: '/bookings', label: 'Bookings', icon: CalendarCheck, exact: false },
  { href: '/profile', label: 'Profile', icon: User, exact: false },
] as const;

export function BottomNav() {
  const pathname = usePathname() ?? '/';

  return (
    <nav
      aria-label="Mobile primary navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#101512]/95 backdrop-blur-sm border-t border-gray-200 dark:border-[#344239] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4">
        {TABS.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 w-full min-h-[56px] py-2 transition-colors',
                  isActive
                    ? 'text-green-700 dark:text-[#4ADE80]'
                    : 'text-gray-500 dark:text-[#8A9A8E] hover:text-green-700 dark:hover:text-[#4ADE80]',
                )}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className={cn('text-[10px] leading-none', isActive && 'font-extrabold')}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
