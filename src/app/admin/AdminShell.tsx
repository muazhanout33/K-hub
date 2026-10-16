'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import {
  Shield,
  LayoutDashboard,
  CalendarCheck,
  CalendarPlus,
  Building2,
  CalendarOff,
  Users,
  Bell,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react';

type NavItem = {
  label: string;
  /** Absent href => planned section: rendered as a non-interactive item. */
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'General',
    items: [{ label: 'Overview', href: '/admin', icon: LayoutDashboard }],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Bookings', href: '/admin/bookings', icon: CalendarCheck },
      { label: 'New Booking', icon: CalendarPlus },
      { label: 'Courts', icon: Building2 },
      { label: 'Blocked Periods', icon: CalendarOff },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Customers', icon: Users },
      { label: 'Notifications', icon: Bell },
    ],
  },
  {
    title: 'System',
    items: [{ label: 'Settings', icon: Settings }],
  },
];

function NavIcon({ icon: Icon, className }: { icon: NavItem['icon']; className?: string }) {
  return <Icon className={className} />;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [openPath, setOpenPath] = useState<string | null>(null);
  // The drawer is "open" only for the pathname it was opened on, so it closes
  // automatically on navigation without needing a setState-in-effect.
  const mobileOpen = openPath !== null && openPath === pathname;

  // Mirrors the public Navbar logout semantics exactly (Navbar.tsx handleLogout):
  // await store logout(), then push to '/'.
  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const sidebarContent = (
    <nav className="flex h-full flex-col" aria-label="Admin navigation">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-[72px] border-b border-[var(--border)]">
        <span className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary-hover)] flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5" aria-hidden="true" />
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-black text-[var(--text-main)] tracking-[-0.02em]">
            K-HUB
          </span>
          <span className="text-[10px] font-bold text-[var(--primary-hover)] tracking-[0.18em] uppercase mt-0.5">
            Admin
          </span>
        </span>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-2 mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-subtle)]">
              {section.title}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = item.href !== undefined && pathname === item.href;

                if (item.href === undefined) {
                  // Planned section — deliberately non-interactive (no link, no handler).
                  return (
                    <li key={item.label}>
                      <span
                        aria-disabled="true"
                        className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-semibold text-[var(--text-subtle)] opacity-60 cursor-not-allowed select-none"
                      >
                        <NavIcon icon={item.icon} className="w-[18px] h-[18px] shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5">
                          Planned
                        </span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => setOpenPath(null)}
                      className={`flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-white text-[#15803D] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-[var(--border)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-white/70'
                      }`}
                    >
                      <NavIcon icon={item.icon} className="w-[18px] h-[18px] shrink-0" />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Sidebar footer */}
      <div className="px-5 py-4 border-t border-[var(--border)]">
        <p className="text-[11px] text-[var(--text-subtle)]">
          Signed in as <span className="font-semibold text-[var(--text-muted)]">{user?.name}</span>
        </p>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col bg-[var(--background)] border-r border-[var(--border)]">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpenPath(null)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white border-r border-[var(--border)] shadow-[var(--shadow-floating)]">
            <button
              type="button"
              onClick={() => setOpenPath(null)}
              aria-label="Close admin menu"
              className="absolute top-4 right-3 w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--background)]"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Content column */}
      <div className="lg:pl-64">
        {/* Admin header */}
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-[var(--border)]">
          <div className="flex items-center justify-between gap-3 h-[64px] px-4 sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setOpenPath(pathname)}
                aria-label="Open admin menu"
                className="lg:hidden w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--background)]"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h2 className="text-sm font-bold text-[var(--text-main)] truncate">
                {pathname === '/admin'
                  ? 'Overview'
                  : pathname.startsWith('/admin/bookings')
                    ? 'Bookings'
                    : 'Admin'}
              </h2>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <NotificationBell />

              <Link
                href="/profile"
                className="hidden sm:flex items-center gap-2 rounded-[var(--radius-pill)] pl-1 pr-3 py-1 hover:bg-[var(--background)] transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-[var(--primary-light)] text-[var(--primary-hover)] text-xs font-black flex items-center justify-center">
                  {(user?.name || '?').charAt(0).toUpperCase()}
                </span>
                <span className="flex flex-col items-start leading-none">
                  <span className="text-xs font-bold text-[var(--text-main)]">{user?.name}</span>
                  <span className="text-[10px] font-semibold text-[var(--primary-hover)]">
                    {user?.role}
                  </span>
                </span>
              </Link>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                aria-label="Log out"
                className="text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Log out</span>
              </Button>
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
