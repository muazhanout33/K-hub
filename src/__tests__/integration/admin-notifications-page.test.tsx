import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { AdminNotificationRow } from '@/app/actions/admin-notification.actions';
import { Customer } from '@/types';

const getAdminNotificationsPageActionMock = vi.fn();
const deleteAdminNotificationActionMock = vi.fn();
const sendAdminNotificationActionMock = vi.fn();
const getAdminCustomersPageActionMock = vi.fn();

vi.mock('@/app/actions/admin-notification.actions', () => ({
  getAdminNotificationsPageAction: (...args: unknown[]) =>
    getAdminNotificationsPageActionMock(...args),
  deleteAdminNotificationAction: (...args: unknown[]) =>
    deleteAdminNotificationActionMock(...args),
  sendAdminNotificationAction: (...args: unknown[]) =>
    sendAdminNotificationActionMock(...args),
}));

vi.mock('@/app/actions/customer.actions', () => ({
  getAdminCustomersPageAction: (...args: unknown[]) => getAdminCustomersPageActionMock(...args),
}));

type GuardState = {
  hydrated: boolean;
  user: { id: string; name: string; role: string } | null;
  isRedirecting: boolean;
  isAdmin: boolean;
};

const adminGuard: GuardState = {
  hydrated: true,
  user: { id: 'admin-1', name: 'Admin User', role: 'Admin' },
  isRedirecting: false,
  isAdmin: true,
};

vi.mock('@/hooks/useAdminGuard', () => ({
  useAdminGuard: () => adminGuard,
}));

import AdminNotificationsPage from '@/app/admin/notifications/page';

const NOTIFICATION_ID = '11111111-2222-4444-8555-666666666666';
const CUSTOMER_ID = '0f0f8a5e-1234-4abc-9def-0123456789ab';

function makeNotification(
  overrides: Partial<AdminNotificationRow> = {}
): AdminNotificationRow {
  return {
    id: NOTIFICATION_ID,
    userId: CUSTOMER_ID,
    type: 'promo_offer',
    title: 'Weekend Promo',
    message: '20% off court bookings this weekend.',
    isRead: false,
    createdAt: '2026-09-01T10:00:00Z',
    recipient: { fullName: 'Sara Hassan', email: 'sara.hassan@example.com' },
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: CUSTOMER_ID,
    fullName: 'Sara Hassan',
    email: 'sara.hassan@example.com',
    phoneNumber: '+201001112233',
    avatarUrl: null,
    role: 'User',
    status: 'Active',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
    ...overrides,
  };
}

function pageResult(
  notifications: AdminNotificationRow[],
  extra: Record<string, unknown> = {}
) {
  return {
    success: true,
    notifications,
    total: notifications.length,
    page: 1,
    pageSize: 25,
    ...extra,
  };
}

describe('AdminNotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminGuard.hydrated = true;
    adminGuard.user = { id: 'admin-1', name: 'Admin User', role: 'Admin' };
    adminGuard.isRedirecting = false;
    adminGuard.isAdmin = true;
    getAdminNotificationsPageActionMock.mockResolvedValue(pageResult([makeNotification()]));
  });

  it('shows the access-checking state while the guard is redirecting', () => {
    adminGuard.isRedirecting = true;
    adminGuard.isAdmin = false;
    adminGuard.user = null;

    render(<AdminNotificationsPage />);
    expect(screen.getByText('Checking access...')).toBeInTheDocument();
    expect(getAdminNotificationsPageActionMock).not.toHaveBeenCalled();
  });

  it('renders nothing for a non-admin user', () => {
    adminGuard.isAdmin = false;
    adminGuard.user = null;

    const { container } = render(<AdminNotificationsPage />);
    expect(container.firstChild).toBeNull();
    expect(getAdminNotificationsPageActionMock).not.toHaveBeenCalled();
  });

  it('shows the loading state on first load', () => {
    getAdminNotificationsPageActionMock.mockReturnValue(new Promise(() => {}));

    render(<AdminNotificationsPage />);
    expect(screen.getByText('Loading notifications...')).toBeInTheDocument();
  });

  it('lists notifications with recipient, type, title, message and read status', async () => {
    render(<AdminNotificationsPage />);

    expect(await screen.findByText('Weekend Promo')).toBeInTheDocument();
    expect(screen.getByText('sara.hassan@example.com')).toBeInTheDocument();
    expect(screen.getByText('20% off court bookings this weekend.')).toBeInTheDocument();
    // Underscores are rendered as spaces in the type pill.
    expect(screen.getByRole('cell', { name: 'promo offer' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Unread' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Delete notification Weekend Promo` })
    ).toBeInTheDocument();
  });

  it('renders a dash when the recipient profile is missing', async () => {
    getAdminNotificationsPageActionMock.mockResolvedValue(
      pageResult([makeNotification({ recipient: null })])
    );

    render(<AdminNotificationsPage />);

    const row = (await screen.findByText('Weekend Promo')).closest('tr');
    expect(within(row as HTMLElement).getByText('—')).toBeInTheDocument();
  });

  it('shows the empty state when there are no notifications', async () => {
    getAdminNotificationsPageActionMock.mockResolvedValue(pageResult([]));

    render(<AdminNotificationsPage />);
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
  });

  it('shows the filtered empty state when the type filter excludes everything', async () => {
    getAdminNotificationsPageActionMock.mockResolvedValue(pageResult([]));

    render(<AdminNotificationsPage />);

    await screen.findByText('No notifications yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Booking Confirmed' }));

    expect(
      await screen.findByText('No notifications match this filter.')
    ).toBeInTheDocument();
    expect(getAdminNotificationsPageActionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'booking_confirmed', page: 1 })
    );
  });

  it('applies a type filter chip and resets to page 1', async () => {
    render(<AdminNotificationsPage />);
    await screen.findByText('Weekend Promo');

    fireEvent.click(screen.getByRole('button', { name: 'Promo Offer' }));

    await waitFor(() => {
      expect(getAdminNotificationsPageActionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'promo_offer', page: 1 })
      );
    });
  });

  it('paginates forward with Next', async () => {
    getAdminNotificationsPageActionMock.mockResolvedValue(
      pageResult([makeNotification()], { total: 60, page: 1, pageSize: 25 })
    );

    render(<AdminNotificationsPage />);
    await screen.findByText('Weekend Promo');

    expect(screen.getByText('Showing 1–1 of 60 notifications')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(getAdminNotificationsPageActionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
  });

  it('requires two clicks to delete and then removes the notification', async () => {
    deleteAdminNotificationActionMock.mockResolvedValue({ success: true });

    render(<AdminNotificationsPage />);
    await screen.findByText('Weekend Promo');

    const deleteButton = screen.getByRole('button', {
      name: 'Delete notification Weekend Promo',
    });
    fireEvent.click(deleteButton);

    // First click only arms the confirmation.
    expect(deleteAdminNotificationActionMock).not.toHaveBeenCalled();
    const confirmButton = screen.getByRole('button', {
      name: 'Confirm delete notification Weekend Promo',
    });

    getAdminNotificationsPageActionMock.mockResolvedValue(pageResult([]));
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteAdminNotificationActionMock).toHaveBeenCalledWith(NOTIFICATION_ID);
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Notification deleted.');
    });
    // The list refreshes after a successful delete.
    await waitFor(() => {
      expect(getAdminNotificationsPageActionMock).toHaveBeenCalledTimes(2);
    });
  });

  it('shows an inline error and toast when deletion fails', async () => {
    deleteAdminNotificationActionMock.mockResolvedValue({
      success: false,
      error: 'Failed to delete notification. Please try again.',
    });

    render(<AdminNotificationsPage />);
    await screen.findByText('Weekend Promo');

    fireEvent.click(screen.getByRole('button', { name: 'Delete notification Weekend Promo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete notification Weekend Promo' }));

    expect(
      await screen.findByText('Failed to delete notification. Please try again.')
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to delete notification. Please try again.');
    });
    // No refresh on failure.
    expect(getAdminNotificationsPageActionMock).toHaveBeenCalledTimes(1);
  });
});

describe('AdminNotificationsPage — compose drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminGuard.hydrated = true;
    adminGuard.user = { id: 'admin-1', name: 'Admin User', role: 'Admin' };
    adminGuard.isRedirecting = false;
    adminGuard.isAdmin = true;
    getAdminNotificationsPageActionMock.mockResolvedValue(pageResult([makeNotification()]));
  });

  async function openDrawer() {
    render(<AdminNotificationsPage />);
    await screen.findByText('Weekend Promo');
    fireEvent.click(screen.getByRole('button', { name: 'Send notification' }));
    return await screen.findByRole('dialog');
  }

  it('opens the compose drawer from the Send notification button', async () => {
    const dialog = await openDrawer();

    expect(within(dialog).getByLabelText('Recipients')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Type')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Title')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Message')).toBeInTheDocument();
  });

  it('searches customers and adds a recipient', async () => {
    getAdminCustomersPageActionMock.mockResolvedValue({
      success: true,
      customers: [makeCustomer()],
      total: 1,
      page: 1,
      pageSize: 25,
    });

    const dialog = await openDrawer();

    fireEvent.change(within(dialog).getByLabelText('Recipients'), {
      target: { value: 'sara' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Search' }));

    const checkbox = await within(dialog).findByLabelText('Select Sara Hassan');
    fireEvent.click(checkbox);

    // The name now appears in both the result row and the selected-recipient chip.
    expect(within(dialog).getAllByText('Sara Hassan').length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).getByText('1 of 50 recipients selected.')).toBeInTheDocument();
    expect(getAdminCustomersPageActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'sara' })
    );
  });

  it('blocks sending without recipients and shows a field error', async () => {
    const dialog = await openDrawer();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));

    expect(await within(dialog).findByText('Select at least one recipient.')).toBeInTheDocument();
    expect(sendAdminNotificationActionMock).not.toHaveBeenCalled();
  });

  it('sends the notification to the selected recipients and closes the drawer', async () => {
    getAdminCustomersPageActionMock.mockResolvedValue({
      success: true,
      customers: [makeCustomer()],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    sendAdminNotificationActionMock.mockResolvedValue({ success: true, sentCount: 1 });

    const dialog = await openDrawer();

    fireEvent.change(within(dialog).getByLabelText('Recipients'), {
      target: { value: 'sara' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Search' }));
    fireEvent.click(await within(dialog).findByLabelText('Select Sara Hassan'));

    fireEvent.change(within(dialog).getByLabelText('Type'), {
      target: { value: 'promo_offer' },
    });
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Weekend Promo' },
    });
    fireEvent.change(within(dialog).getByLabelText('Message'), {
      target: { value: '20% off court bookings this weekend.' },
    });

    getAdminNotificationsPageActionMock.mockResolvedValue(pageResult([]));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(sendAdminNotificationActionMock).toHaveBeenCalledWith({
        userIds: [CUSTOMER_ID],
        type: 'promo_offer',
        title: 'Weekend Promo',
        message: '20% off court bookings this weekend.',
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Notification sent to 1 customer.');
    });
    // Drawer closes and the list refreshes.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(getAdminNotificationsPageActionMock).toHaveBeenCalledTimes(2);
    });
  });

  it('surfaces a server-side send failure in the drawer', async () => {
    getAdminCustomersPageActionMock.mockResolvedValue({
      success: true,
      customers: [makeCustomer()],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    sendAdminNotificationActionMock.mockResolvedValue({
      success: false,
      error: 'Failed to send notification. Please try again.',
    });

    const dialog = await openDrawer();

    fireEvent.change(within(dialog).getByLabelText('Recipients'), {
      target: { value: 'sara' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Search' }));
    fireEvent.click(await within(dialog).findByLabelText('Select Sara Hassan'));
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Weekend Promo' },
    });
    fireEvent.change(within(dialog).getByLabelText('Message'), {
      target: { value: '20% off court bookings this weekend.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));

    expect(
      await within(dialog).findByText('Failed to send notification. Please try again.')
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
