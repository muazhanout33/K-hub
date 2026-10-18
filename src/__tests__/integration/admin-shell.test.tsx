import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { AdminShell } from '@/app/admin/AdminShell';

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

describe('AdminShell', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/admin');
  });

  it('renders Overview, Bookings and Courts as live navigation links', () => {
    render(<AdminShell><div>page content</div></AdminShell>);

    const overview = screen.getByRole('link', { name: /Overview/ });
    expect(overview).toHaveAttribute('href', '/admin');
    expect(overview).toHaveAttribute('aria-current', 'page');

    const bookings = screen.getByRole('link', { name: /Bookings/ });
    expect(bookings).toHaveAttribute('href', '/admin/bookings');
    expect(bookings).not.toHaveAttribute('aria-current');

    const courts = screen.getByRole('link', { name: /Courts/ });
    expect(courts).toHaveAttribute('href', '/admin/courts');
    expect(courts).not.toHaveAttribute('aria-current');

    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('renders future sections as non-interactive planned items (no links)', () => {
    render(<AdminShell><div /></AdminShell>);

    const planned = ['New Booking', 'Blocked Periods', 'Customers', 'Notifications', 'Settings'];
    for (const label of planned) {
      const item = screen.getByText(label);
      expect(item.closest('a'), `${label} must not be a link`).toBeNull();
      expect(item.closest('[aria-disabled="true"]')).not.toBeNull();
    }
    expect(screen.getAllByText('Planned')).toHaveLength(planned.length);
  });

  it('marks Bookings active on /admin/bookings and shows the Bookings header title', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/bookings');
    render(<AdminShell><div /></AdminShell>);

    const bookings = screen.getByRole('link', { name: /Bookings/ });
    expect(bookings).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Bookings' })).toBeInTheDocument();
  });

  it('marks Courts active on /admin/courts and shows the Courts header title', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/courts');
    render(<AdminShell><div /></AdminShell>);

    const courts = screen.getByRole('link', { name: /Courts/ });
    expect(courts).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Courts' })).toBeInTheDocument();

    // Bookings and Overview must not claim the active state on this route.
    expect(screen.getByRole('link', { name: /Bookings/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Overview/ })).not.toHaveAttribute('aria-current');
  });

  it('does not mark Overview active on other paths', () => {
    vi.mocked(usePathname).mockReturnValue('/auth/login');
    render(<AdminShell><div /></AdminShell>);

    const overview = screen.getByRole('link', { name: /Overview/ });
    expect(overview).not.toHaveAttribute('aria-current');
  });

  it('exposes a logout control', () => {
    render(<AdminShell><div /></AdminShell>);

    expect(screen.getByRole('button', { name: /Log out/ })).toBeInTheDocument();
  });
});
