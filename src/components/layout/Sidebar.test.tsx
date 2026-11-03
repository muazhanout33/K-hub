import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// next/image is not mocked globally — provide a minimal local stand-in.
vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

// Reservation-timer hook pulls in timers/stores the sidebar doesn't need here.
vi.mock('@/features/booking/useReservationTimer', () => ({
  useReservationTimer: () => ({ isActive: false, formattedTime: '00:00' }),
}));

const logoutMock = vi.fn(async () => undefined);
vi.mock('@/features/auth/useAuthStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      user: null,
      isAuthenticated: false,
      logout: logoutMock,
    }),
}));

import { Sidebar } from './Sidebar';

describe('Sidebar — Settings link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('points the Settings control to /profile (not /contact)', () => {
    render(<Sidebar />);

    const settings = screen.getByRole('link', { name: 'Settings' });
    expect(settings).toHaveAttribute('href', '/profile');
    expect(settings).toHaveAttribute('title', 'Settings');
  });

  it('keeps the Contact nav item pointing to /contact', () => {
    render(<Sidebar />);

    const contact = screen.getByRole('link', { name: /Contact/ });
    expect(contact).toHaveAttribute('href', '/contact');
  });

  it('keeps the primary navigation items intact', () => {
    render(<Sidebar />);

    const expected: Array<[string, string]> = [
      ['Home', '/'],
      ['Courts', '/courts'],
      ['Book Court', '/book'],
      ['Sponsors', '/sponsors'],
      ['Advertise', '/advertise'],
      ['Events', '/events'],
      ['About', '/about'],
      ['Contact', '/contact'],
    ];
    for (const [label, href] of expected) {
      const link = screen.getByRole('link', { name: new RegExp(`^${label}`) });
      expect(link, `${label} href`).toHaveAttribute('href', href);
    }
  });

  it('renders exactly one Settings link (icon control only)', () => {
    render(<Sidebar />);

    expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(1);
  });
});
