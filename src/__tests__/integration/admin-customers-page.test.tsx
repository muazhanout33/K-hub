import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Customer } from '@/types';

const getAdminCustomersPageActionMock = vi.fn();

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

import AdminCustomersPage from '@/app/admin/customers/page';

const CUSTOMER_ID = '0f0f8a5e-1234-4abc-9def-0123456789ab';

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

function pageResult(customers: Customer[], extra: Record<string, unknown> = {}) {
  return {
    success: true,
    customers,
    total: customers.length,
    page: 1,
    pageSize: 25,
    ...extra,
  };
}

describe('AdminCustomersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminGuard.hydrated = true;
    adminGuard.user = { id: 'admin-1', name: 'Admin User', role: 'Admin' };
    adminGuard.isRedirecting = false;
    adminGuard.isAdmin = true;
    getAdminCustomersPageActionMock.mockResolvedValue(pageResult([makeCustomer()]));
  });

  it('shows the access-checking state while the guard is redirecting', () => {
    adminGuard.isRedirecting = true;
    adminGuard.isAdmin = false;
    adminGuard.user = null;

    render(<AdminCustomersPage />);
    expect(screen.getByText('Checking access...')).toBeInTheDocument();
    expect(getAdminCustomersPageActionMock).not.toHaveBeenCalled();
  });

  it('renders nothing for a non-admin user', () => {
    adminGuard.isAdmin = false;
    adminGuard.user = null;

    const { container } = render(<AdminCustomersPage />);
    expect(container.firstChild).toBeNull();
    expect(getAdminCustomersPageActionMock).not.toHaveBeenCalled();
  });

  it('shows the loading state on first load', () => {
    getAdminCustomersPageActionMock.mockReturnValue(new Promise(() => {}));

    render(<AdminCustomersPage />);
    expect(screen.getByText('Loading customers...')).toBeInTheDocument();
  });

  it('lists customers with name, email, phone, role, status and a details link', async () => {
    render(<AdminCustomersPage />);

    const nameCell = await screen.findByRole('cell', { name: 'Sara Hassan' });
    expect(nameCell).toBeInTheDocument();
    expect(screen.getByText('sara.hassan@example.com')).toBeInTheDocument();
    expect(screen.getByText('+201001112233')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'User' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Active' })).toBeInTheDocument();

    const viewLink = screen.getByRole('link', { name: 'View' });
    expect(viewLink).toHaveAttribute('href', `/admin/customers/${CUSTOMER_ID}`);
  });

  it('renders a dash for a customer without a phone number', async () => {
    getAdminCustomersPageActionMock.mockResolvedValue(
      pageResult([makeCustomer({ phoneNumber: null })])
    );

    render(<AdminCustomersPage />);

    const phoneCell = await screen.findByRole('cell', { name: '—' });
    expect(phoneCell).toBeInTheDocument();
  });

  it('shows the empty state when there are no customers', async () => {
    getAdminCustomersPageActionMock.mockResolvedValue(pageResult([]));

    render(<AdminCustomersPage />);
    expect(await screen.findByText('No customers yet.')).toBeInTheDocument();
  });

  it('shows the filtered empty state when filters exclude everyone', async () => {
    getAdminCustomersPageActionMock.mockResolvedValue(pageResult([]));

    render(<AdminCustomersPage />);

    await screen.findByText('No customers yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Suspended' }));

    expect(await screen.findByText('No customers match your filters.')).toBeInTheDocument();
    expect(getAdminCustomersPageActionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'Suspended' })
    );
  });

  it('applies the status chip filter and resets to page 1', async () => {
    render(<AdminCustomersPage />);
    await screen.findByText('Sara Hassan');

    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));

    await waitFor(() => {
      expect(getAdminCustomersPageActionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'Inactive', page: 1 })
      );
    });
  });

  it('applies the role filter from the select', async () => {
    render(<AdminCustomersPage />);
    await screen.findByText('Sara Hassan');

    fireEvent.change(screen.getByLabelText('Filter by role'), { target: { value: 'Guest' } });

    await waitFor(() => {
      expect(getAdminCustomersPageActionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: 'Guest', page: 1 })
      );
    });
  });

  it('submits the search form with the trimmed search term', async () => {
    render(<AdminCustomersPage />);
    await screen.findByText('Sara Hassan');

    fireEvent.change(screen.getByLabelText('Search customers'), {
      target: { value: '  sara  ' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(getAdminCustomersPageActionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'sara', page: 1 })
      );
    });
  });

  it('clears all filters and refetches from page 1', async () => {
    render(<AdminCustomersPage />);
    await screen.findByText('Sara Hassan');

    fireEvent.click(screen.getByRole('button', { name: 'Suspended' }));
    fireEvent.change(screen.getByLabelText('Filter by role'), { target: { value: 'Guest' } });
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'sara' } });

    const clearButton = await screen.findByRole('button', { name: 'Clear filters' });
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(getAdminCustomersPageActionMock).toHaveBeenLastCalledWith({
        search: undefined,
        status: undefined,
        role: undefined,
        page: 1,
      });
    });
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('shows an inline error banner with Retry that refetches', async () => {
    getAdminCustomersPageActionMock
      .mockResolvedValueOnce({ success: false, error: 'Failed to load customers. Please try again.' })
      .mockResolvedValueOnce(pageResult([makeCustomer()]));

    render(<AdminCustomersPage />);

    expect(
      await screen.findByText('Failed to load customers. Please try again.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Sara Hassan')).toBeInTheDocument();
    expect(getAdminCustomersPageActionMock).toHaveBeenCalledTimes(2);
  });

  it('paginates forward with Next', async () => {
    getAdminCustomersPageActionMock.mockResolvedValue(
      pageResult([makeCustomer()], { total: 60, page: 1, pageSize: 25 })
    );

    render(<AdminCustomersPage />);
    await screen.findByText('Sara Hassan');

    expect(screen.getByText('Showing 1–1 of 60 customers')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(getAdminCustomersPageActionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
  });

  it('disables Next on a single page of results', async () => {
    render(<AdminCustomersPage />);

    expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('clamps back to the last page when a deeper page comes back empty', async () => {
    getAdminCustomersPageActionMock
      .mockResolvedValueOnce(pageResult([makeCustomer()], { total: 60, page: 1, pageSize: 25 }))
      .mockResolvedValueOnce(pageResult([makeCustomer()], { total: 60, page: 2, pageSize: 25 }))
      .mockResolvedValueOnce(pageResult([], { total: 30, page: 3, pageSize: 25 }))
      .mockResolvedValueOnce(pageResult([makeCustomer()], { total: 30, page: 2, pageSize: 25 }));

    render(<AdminCustomersPage />);
    await screen.findByText('Page 1 of 3');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Page 3 came back empty with total 30 => clamp to page 2 and refetch.
    await waitFor(() => {
      expect(getAdminCustomersPageActionMock).toHaveBeenCalledTimes(4);
    });
    expect(getAdminCustomersPageActionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 })
    );
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
  });
});
