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

  it('renders Overview as the only live navigation link with active state', () => {
    render(<AdminShell><div>page content</div></AdminShell>);

    const overview = screen.getByRole('link', { name: /Overview/ });
    expect(overview).toHaveAttribute('href', '/admin');
    expect(overview).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('renders future sections as non-interactive planned items (no links)', () => {
    render(<AdminShell><div /></AdminShell>);

    const planned = ['Bookings', 'New Booking', 'Courts', 'Blocked Periods', 'Customers', 'Notifications', 'Settings'];
    for (const label of planned) {
      const item = screen.getByText(label);
      expect(item.closest('a'), `${label} must not be a link`).toBeNull();
      expect(item.closest('[aria-disabled="true"]')).not.toBeNull();
    }
    expect(screen.getAllByText('Planned')).toHaveLength(planned.length);
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
