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

  it('renders Overview, Bookings, Courts, Blocked Periods, Customers and Notifications as live navigation links', () => {
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

    const blocked = screen.getByRole('link', { name: /Blocked Periods/ });
    expect(blocked).toHaveAttribute('href', '/admin/blocked-periods');
    expect(blocked).not.toHaveAttribute('aria-current');

    const customers = screen.getByRole('link', { name: /Customers/ });
    expect(customers).toHaveAttribute('href', '/admin/customers');
    expect(customers).not.toHaveAttribute('aria-current');

    const notifications = screen.getByRole('link', { name: /Notifications/ });
    expect(notifications).toHaveAttribute('href', '/admin/notifications');
    expect(notifications).not.toHaveAttribute('aria-current');

    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('renders Settings as a live navigation link to /admin/settings', () => {
    render(<AdminShell><div /></AdminShell>);

    const settings = screen.getByRole('link', { name: /Settings/ });
    expect(settings).toHaveAttribute('href', '/admin/settings');
    expect(settings).not.toHaveAttribute('aria-current');
  });

  it('renders future sections as non-interactive planned items (no links)', () => {
    render(<AdminShell><div /></AdminShell>);

    const planned = ['New Booking'];
    for (const label of planned) {
      const item = screen.getByText(label);
      expect(item.closest('a'), `${label} must not be a link`).toBeNull();
      expect(item.closest('[aria-disabled="true"]')).not.toBeNull();
    }
    expect(screen.getAllByText('Planned')).toHaveLength(planned.length);
    // Customers, Notifications and Settings are live now — no Planned badge.
    expect(screen.getByText('Customers').closest('a')).not.toBeNull();
    expect(screen.getByText('Notifications').closest('a')).not.toBeNull();
    expect(screen.getByText('Settings').closest('a')).not.toBeNull();
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

  it('marks Blocked Periods active on /admin/blocked-periods and shows the Blocked Periods header title', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/blocked-periods');
    render(<AdminShell><div /></AdminShell>);

    const blocked = screen.getByRole('link', { name: /Blocked Periods/ });
    expect(blocked).toHaveAttribute('href', '/admin/blocked-periods');
    expect(blocked).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Blocked Periods' })).toBeInTheDocument();

    // Other live sections must not claim the active state on this route.
    expect(screen.getByRole('link', { name: /Bookings/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Courts/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Overview/ })).not.toHaveAttribute('aria-current');
  });

  it('marks Customers active on /admin/customers and shows the Customers header title', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/customers');
    render(<AdminShell><div /></AdminShell>);

    const customers = screen.getByRole('link', { name: /Customers/ });
    expect(customers).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument();

    // Other live sections must not claim the active state on this route.
    expect(screen.getByRole('link', { name: /Notifications/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Bookings/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Overview/ })).not.toHaveAttribute('aria-current');
  });

  it('keeps the Customers title on a customer detail route', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/customers/0f0f8a5e-1234-4abc-9def-0123456789ab');
    render(<AdminShell><div /></AdminShell>);

    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    // Exact-match active state: the list link is not active on a detail route.
    expect(screen.getByRole('link', { name: /Customers/ })).not.toHaveAttribute('aria-current');
  });

  it('marks Notifications active on /admin/notifications and shows the Notifications header title', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/notifications');
    render(<AdminShell><div /></AdminShell>);

    const notifications = screen.getByRole('link', { name: /Notifications/ });
    expect(notifications).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();

    // Other live sections must not claim the active state on this route.
    expect(screen.getByRole('link', { name: /Customers/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Bookings/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Overview/ })).not.toHaveAttribute('aria-current');
  });

  it('marks Settings active on /admin/settings and shows the Settings header title', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/settings');
    render(<AdminShell><div /></AdminShell>);

    const settings = screen.getByRole('link', { name: /Settings/ });
    expect(settings).toHaveAttribute('href', '/admin/settings');
    expect(settings).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    // Other live sections must not claim the active state on this route.
    expect(screen.getByRole('link', { name: /Overview/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Bookings/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Notifications/ })).not.toHaveAttribute('aria-current');
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
