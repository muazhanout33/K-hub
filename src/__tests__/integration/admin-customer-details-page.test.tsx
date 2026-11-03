/**
 * Integration tests for the admin customer details page (/admin/customers/[id]).
 *
 * Covers:
 *  - useAdminGuard gates (redirecting / non-admin)
 *  - loading / error states
 *  - header card (name, email, joined date, role + status pills)
 *  - status management (select + save; disabled for Admin targets and when unchanged)
 *  - sensitive profile details behind a Show / Hide Details reveal
 *  - read-only booking history (rows, empty state, pagination)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { toast } from 'sonner';
import Page from '@/app/admin/customers/[id]/page';
import {
  getAdminCustomerDetailAction,
  getAdminCustomerBookingsPageAction,
  updateCustomerStatusAction,
} from '@/app/actions/customer.actions';
import type { CustomerDetails, Booking } from '@/types';

vi.mock('@/app/actions/customer.actions', () => ({
  getAdminCustomerDetailAction: vi.fn(),
  getAdminCustomerBookingsPageAction: vi.fn(),
  updateCustomerStatusAction: vi.fn(),
}));

const adminGuard = {
  hydrated: true,
  user: { id: 'admin-1', role: 'Admin' },
  isRedirecting: false,
  isAdmin: true,
};

vi.mock('@/hooks/useAdminGuard', () => ({
  useAdminGuard: () => adminGuard,
}));

const CUSTOMER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PARAMS = { id: CUSTOMER_ID };

const baseCustomer: CustomerDetails = {
  id: CUSTOMER_ID,
  fullName: 'Jane Doe',
  email: 'jane.doe@example.com',
  phoneNumber: '+1 555 123 4567',
  avatarUrl: null,
  role: 'User',
  status: 'Active',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
  dateOfBirth: '1990-05-15',
  gender: 'female',
  address: '123 Main Street, Springfield',
  emergencyContact: '+1 555 987 6543',
};

const bookings: Booking[] = [
  {
    id: 'b1111111-1111-4111-8111-111111111111',
    bookingNumber: 'BK-0001',
    courtId: 'c1111111-1111-4111-8111-111111111111',
    courtName: 'Court 1',
    courtImage: '',
    sportType: 'Football',
    date: '2026-11-15',
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
    totalPrice: 50,
    status: 'Confirmed',
    bookingSource: 'ONLINE',
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-01T09:00:00Z',
    userId: CUSTOMER_ID,
    userName: 'Jane Doe',
    userEmail: 'jane.doe@example.com',
    userPhone: '+1 555 123 4567',
    selectedSlotIds: [],
  },
];

/**
 * The page resolves its dynamic `params` via React's `use()`, which suspends on
 * the first render. Wrapping render in an async `act` flushes that suspension so
 * assertions run against the mounted page (tests have no Suspense boundary).
 */
const renderPage = async () => {
  await act(async () => {
    render(<Page params={Promise.resolve(PARAMS)} />);
  });
};

describe('Admin customer details page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminGuard.hydrated = true;
    adminGuard.user = { id: 'admin-1', role: 'Admin' };
    adminGuard.isRedirecting = false;
    adminGuard.isAdmin = true;
    vi.mocked(getAdminCustomerDetailAction).mockResolvedValue({
      success: true,
      customer: baseCustomer,
    });
    vi.mocked(updateCustomerStatusAction).mockResolvedValue({
      success: true,
      customer: baseCustomer,
    });
    vi.mocked(getAdminCustomerBookingsPageAction).mockResolvedValue({
      success: true,
      bookings,
      total: 2,
      page: 1,
      pageSize: 25,
    });
  });

  it('renders nothing while the auth guard is redirecting', async () => {
    adminGuard.isRedirecting = true;
    adminGuard.isAdmin = false;
    await renderPage();
    expect(screen.queryByText('Loading customer...')).not.toBeInTheDocument();
    expect(screen.queryByText('Back to Customers')).not.toBeInTheDocument();
  });

  it('renders nothing for non-admin users (redirect in progress)', async () => {
    adminGuard.isAdmin = false;
    adminGuard.user = { id: 'user-1', role: 'User' };
    await renderPage();
    expect(screen.queryByText('Loading customer...')).not.toBeInTheDocument();
    expect(screen.queryByText('Back to Customers')).not.toBeInTheDocument();
    expect(getAdminCustomerDetailAction).not.toHaveBeenCalled();
  });

  it('shows a loading state while customer details load', async () => {
    // Keep the details action pending so the loading state stays visible.
    vi.mocked(getAdminCustomerDetailAction).mockImplementation(() => new Promise(() => {}));
    await renderPage();
    expect(screen.getByText('Loading customer...')).toBeInTheDocument();
  });

  it('shows an error state with retry when the customer cannot be loaded', async () => {
    vi.mocked(getAdminCustomerDetailAction).mockResolvedValue({
      success: false,
      error: 'Customer not found.',
    });
    await renderPage();
    expect(await screen.findByText('Customer not found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retries the customer load when Retry is clicked', async () => {
    vi.mocked(getAdminCustomerDetailAction)
      .mockResolvedValueOnce({ success: false, error: 'Network error.' })
      .mockResolvedValueOnce({ success: true, customer: baseCustomer });
    await renderPage();
    expect(await screen.findByText('Network error.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(getAdminCustomerDetailAction).toHaveBeenCalledTimes(2);
  });

  it('renders the header card with joined date and role/status pills', async () => {
    await renderPage();
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Joined Jan 15, 2026/)).toBeInTheDocument();
    // Pills live in the header; the status <option> shares the same label text.
    const headerCard = screen.getByText('Jane Doe').closest('div')?.parentElement as HTMLElement;
    expect(within(headerCard).getByText('Active')).toBeInTheDocument();
    expect(within(headerCard).getByText('User')).toBeInTheDocument();
  });

  it('shows the phone number in the details card without revealing sensitive fields', async () => {
    await renderPage();
    await screen.findByText('Jane Doe');
    expect(screen.getByText('+1 555 123 4567')).toBeInTheDocument();
    // Sensitive values are not rendered until revealed.
    expect(screen.queryByText('1990-05-15')).not.toBeInTheDocument();
    expect(screen.queryByText('123 Main Street, Springfield')).not.toBeInTheDocument();
    expect(
      screen.getByText('Sensitive profile details are hidden. Use Show Details to reveal them.')
    ).toBeInTheDocument();
  });

  it('reveals sensitive fields via the Show Details toggle and hides them again', async () => {
    await renderPage();
    await screen.findByText('Jane Doe');

    fireEvent.click(screen.getByRole('button', { name: 'Show Details' }));

    expect(screen.getByText('May 15, 1990')).toBeInTheDocument();
    expect(screen.getByText('female')).toBeInTheDocument();
    expect(screen.getByText('123 Main Street, Springfield')).toBeInTheDocument();
    expect(screen.getByText('+1 555 987 6543')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide Details' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide Details' }));
    expect(screen.queryByText('123 Main Street, Springfield')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Details' })).toBeInTheDocument();
  });

  it('renders an em dash for missing optional fields once revealed', async () => {
    vi.mocked(getAdminCustomerDetailAction).mockResolvedValue({
      success: true,
      customer: { ...baseCustomer, dateOfBirth: null, gender: null, address: null, emergencyContact: null },
    });
    await renderPage();
    await screen.findByText('Jane Doe');

    fireEvent.click(screen.getByRole('button', { name: 'Show Details' }));
    const genderLabel = screen.getByText('Gender');
    const dd = genderLabel.parentElement?.querySelector('dd') as HTMLElement;
    expect(dd.textContent).toBe('—');
  });

  it('disables the status save button when the status has not been changed', async () => {
    await renderPage();
    await screen.findByText('Jane Doe');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves a changed status, calls the action, toasts, and updates the pill', async () => {
    vi.mocked(updateCustomerStatusAction).mockResolvedValue({
      success: true,
      customer: { ...baseCustomer, status: 'Suspended' },
    });
    await renderPage();
    await screen.findByText('Jane Doe');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Suspended' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateCustomerStatusAction).toHaveBeenCalledWith(CUSTOMER_ID, 'Suspended');
    });
    // Toast text lives in the mocked sonner; assert the call, not the DOM.
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Status updated to Suspended.');
    });
    // The refreshed header pill now shows the new status.
    const headerCard = screen.getByText('Jane Doe').closest('div')?.parentElement as HTMLElement;
    expect(within(headerCard).getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('toasts an error and keeps the chosen value when the status update fails', async () => {
    vi.mocked(updateCustomerStatusAction).mockResolvedValue({
      success: false,
      error: 'Admin accounts cannot be modified.',
    });
    await renderPage();
    await screen.findByText('Jane Doe');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Suspended' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Errors surface via the (mocked) toast — assert the call, not the DOM.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Admin accounts cannot be modified.');
    });
    expect(toast.success).not.toHaveBeenCalled();
    // Select keeps the user-chosen value after a failed save.
    expect(screen.getByRole('combobox')).toHaveValue('Suspended');
  });

  it('disables the status control for Admin accounts with an explanation', async () => {
    const adminTarget: CustomerDetails = { ...baseCustomer, role: 'Admin', fullName: 'Admin User' };
    vi.mocked(getAdminCustomerDetailAction).mockResolvedValue({
      success: true,
      customer: adminTarget,
    });
    vi.mocked(getAdminCustomerBookingsPageAction).mockResolvedValue({
      success: true,
      bookings: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    await renderPage();
    await screen.findByText('Admin User');

    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('Admin accounts cannot be modified from here.')).toBeInTheDocument();
  });

  it('renders read-only booking history rows with a status pill', async () => {
    await renderPage();
    const table = await screen.findByRole('table');

    const rows = within(table).getAllByRole('row');
    // Header row + one booking row.
    expect(rows).toHaveLength(2);
    const bookingRow = rows[1];
    expect(within(bookingRow).getByText('BK-0001')).toBeInTheDocument();
    expect(within(bookingRow).getByText('Court 1')).toBeInTheDocument();
    expect(within(bookingRow).getByText('2026-11-15')).toBeInTheDocument();
    expect(within(bookingRow).getByText('10:00–11:00')).toBeInTheDocument();
    expect(within(bookingRow).getByText('50 EGP')).toBeInTheDocument();
    expect(within(bookingRow).getByText('Confirmed')).toBeInTheDocument();
    // Read-only: no action buttons in the history rows.
    expect(within(bookingRow).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an empty state when the customer has no bookings', async () => {
    vi.mocked(getAdminCustomerBookingsPageAction).mockResolvedValue({
      success: true,
      bookings: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    await renderPage();
    await screen.findByText('Jane Doe');

    expect(screen.getByText('No bookings for this customer.')).toBeInTheDocument();
    expect(
      screen.getByText("Only bookings made with this customer's account are shown.")
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('surfaces an inline error when the booking history fails to load', async () => {
    vi.mocked(getAdminCustomerBookingsPageAction).mockResolvedValue({
      success: false,
      error: 'Failed to load customer bookings.',
    });
    await renderPage();
    await screen.findByText('Jane Doe');

    expect(await screen.findByText('Failed to load customer bookings.')).toBeInTheDocument();
  });

  it('retries the booking history load when Retry is clicked on the first-load error', async () => {
    vi.mocked(getAdminCustomerBookingsPageAction)
      .mockResolvedValueOnce({ success: false, error: 'Failed to load customer bookings.' })
      .mockResolvedValueOnce({
        success: true,
        bookings,
        total: 2,
        page: 1,
        pageSize: 25,
      });
    await renderPage();
    await screen.findByText('Jane Doe');
    expect(await screen.findByText('Failed to load customer bookings.')).toBeInTheDocument();

    // Page 1 retry must refetch even though setHistoryPage(1) alone would be a no-op.
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('BK-0001')).toBeInTheDocument();
    expect(getAdminCustomerBookingsPageAction).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Failed to load customer bookings.')).not.toBeInTheDocument();
  });

  it('requests the next page of booking history', async () => {
    vi.mocked(getAdminCustomerBookingsPageAction).mockResolvedValue({
      success: true,
      bookings,
      total: 60,
      page: 1,
      pageSize: 25,
    });
    await renderPage();
    await screen.findByText('Jane Doe');

    const next = screen.getByRole('button', { name: 'Next' });
    // totalPages = ceil(60 / 25) = 3, so Next is available.
    expect(next).toBeEnabled();
    fireEvent.click(next);

    await waitFor(() => {
      expect(getAdminCustomerBookingsPageAction).toHaveBeenCalledWith(CUSTOMER_ID, { page: 2 });
    });
  });
});
