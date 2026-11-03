import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { BlockedPeriod, Court } from '@/types';

const getBlockedPeriodsActionMock = vi.fn();
const createBlockedPeriodActionMock = vi.fn();
const deleteBlockedPeriodActionMock = vi.fn();
const getAdminCourtsActionMock = vi.fn();

vi.mock('@/app/actions/blocked-period.actions', () => ({
  getBlockedPeriodsAction: (...args: unknown[]) => getBlockedPeriodsActionMock(...args),
  createBlockedPeriodAction: (...args: unknown[]) => createBlockedPeriodActionMock(...args),
  deleteBlockedPeriodAction: (...args: unknown[]) => deleteBlockedPeriodActionMock(...args),
}));

vi.mock('@/app/actions/court.actions', () => ({
  getAdminCourtsAction: (...args: unknown[]) => getAdminCourtsActionMock(...args),
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

import AdminBlockedPeriodsPage from '@/app/admin/blocked-periods/page';

const store: { blockedPeriods: BlockedPeriod[] } = { blockedPeriods: [] };
const addBlockedPeriodMock = vi.fn(
  (period: Omit<BlockedPeriod, 'id' | 'createdAt'>): BlockedPeriod => {
    const record: BlockedPeriod = {
      ...period,
      id: `store-${store.blockedPeriods.length + 1}`,
      createdAt: '2026-10-21T00:00:00Z',
    };
    store.blockedPeriods.push(record);
    return record;
  }
);
const removeBlockedPeriodMock = vi.fn((id: string) => {
  store.blockedPeriods = store.blockedPeriods.filter((bp) => bp.id !== id);
  return true;
});

vi.mock('@/features/booking/useBlockedPeriodStore', () => ({
  useBlockedPeriodStore: {
    getState: () => ({
      blockedPeriods: store.blockedPeriods,
      addBlockedPeriod: addBlockedPeriodMock,
      removeBlockedPeriod: removeBlockedPeriodMock,
    }),
  },
}));

const COURT_A_ID = '11111111-1111-1111-1111-111111111111';

function makeCourt(id: string, name: string): Court {
  return {
    id,
    name,
    sportType: 'Padel',
    surface: 'Panoramic',
    isIndoor: true,
    capacity: 4,
    pricePerHour: 250,
    rating: 4.8,
    reviewCount: 12,
    image: '/images/courts/court-one.jpg',
    gallery: [],
    description: '',
    features: [],
    rules: [],
    status: 'Available',
    workingHours: { open: '07:00', close: '00:00' },
    slotDurationMinutes: 60,
  };
}

function makeBlockedPeriod(overrides: Partial<BlockedPeriod> = {}): BlockedPeriod {
  return {
    id: 'bp-1',
    courtId: COURT_A_ID,
    date: '2026-11-01',
    startTime: '10:00',
    endTime: '12:00',
    reason: 'Maintenance',
    createdAt: '2026-10-20T10:00:00Z',
    ...overrides,
  };
}

function fillValidCreateForm() {
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-05' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Private event' } });
}

describe('AdminBlockedPeriodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.blockedPeriods = [];
    adminGuard.hydrated = true;
    adminGuard.user = { id: 'admin-1', name: 'Admin User', role: 'Admin' };
    adminGuard.isRedirecting = false;
    adminGuard.isAdmin = true;
    getBlockedPeriodsActionMock.mockResolvedValue({ success: true, blockedPeriods: [] });
    getAdminCourtsActionMock.mockResolvedValue({
      success: true,
      courts: [makeCourt(COURT_A_ID, 'Panoramic Court')],
    });
  });

  it('shows the access-checking state while the guard is redirecting', () => {
    adminGuard.isRedirecting = true;
    adminGuard.isAdmin = false;
    adminGuard.user = null;

    render(<AdminBlockedPeriodsPage />);
    expect(screen.getByText('Checking access...')).toBeInTheDocument();
    expect(getBlockedPeriodsActionMock).not.toHaveBeenCalled();
  });

  it('renders nothing for a non-admin user', () => {
    adminGuard.isAdmin = false;
    adminGuard.user = null;

    const { container } = render(<AdminBlockedPeriodsPage />);
    expect(container.firstChild).toBeNull();
    expect(getBlockedPeriodsActionMock).not.toHaveBeenCalled();
  });

  it('lists blocked periods with the resolved court name, date, time and reason', async () => {
    getBlockedPeriodsActionMock.mockResolvedValue({
      success: true,
      blockedPeriods: [makeBlockedPeriod()],
    });

    render(<AdminBlockedPeriodsPage />);

    const courtCell = await screen.findByRole('cell', { name: 'Panoramic Court' });
    expect(courtCell).toBeInTheDocument();
    expect(screen.getByText('2026-11-01')).toBeInTheDocument();
    expect(screen.getByText('10:00–12:00')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  });

  it('falls back to "Unknown court" when the court list cannot resolve an id', async () => {
    getBlockedPeriodsActionMock.mockResolvedValue({
      success: true,
      blockedPeriods: [makeBlockedPeriod({ courtId: '99999999-9999-9999-9999-999999999999' })],
    });

    render(<AdminBlockedPeriodsPage />);
    expect(await screen.findByText('Unknown court')).toBeInTheDocument();
  });

  it('shows the empty state when there are no blocked periods', async () => {
    render(<AdminBlockedPeriodsPage />);
    expect(await screen.findByText('No blocked periods defined.')).toBeInTheDocument();
  });

  it('shows a list error with Retry that refetches the data', async () => {
    getBlockedPeriodsActionMock
      .mockResolvedValueOnce({ success: false, error: 'Failed to load blocked periods. Please try again.' })
      .mockResolvedValueOnce({ success: true, blockedPeriods: [makeBlockedPeriod()] });

    render(<AdminBlockedPeriodsPage />);

    expect(
      await screen.findByText('Failed to load blocked periods. Please try again.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Maintenance')).toBeInTheDocument();
    expect(getBlockedPeriodsActionMock).toHaveBeenCalledTimes(2);
  });

  it('disables creation and warns when the court list fails to load', async () => {
    getAdminCourtsActionMock.mockResolvedValue({
      success: false,
      error: 'Failed to load courts. Please try again.',
    });
    getBlockedPeriodsActionMock.mockResolvedValue({
      success: true,
      blockedPeriods: [makeBlockedPeriod()],
    });

    render(<AdminBlockedPeriodsPage />);

    expect(
      await screen.findByText('Failed to load courts. Please try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add/ })).toBeDisabled();
    expect(await screen.findByText('Maintenance')).toBeInTheDocument();
  });

  it('blocks submission with a client hint and never calls the action when the date is missing', async () => {
    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('No blocked periods defined.');

    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect(await screen.findByText('Date is required.')).toBeInTheDocument();
    expect(createBlockedPeriodActionMock).not.toHaveBeenCalled();
  });

  it('blocks submission with a client hint when end time is not after start time', async () => {
    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('No blocked periods defined.');

    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '12:00' } });
    fillValidCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect(await screen.findByText('End time must be after start time.')).toBeInTheDocument();
    expect(createBlockedPeriodActionMock).not.toHaveBeenCalled();
  });

  it('submits the create payload, toasts, resets the form and refreshes the list', async () => {
    createBlockedPeriodActionMock.mockResolvedValue({
      success: true,
      blockedPeriod: makeBlockedPeriod({ id: 'bp-new' }),
    });

    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('No blocked periods defined.');

    fillValidCreateForm();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '  Private event  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    await waitFor(() => {
      expect(createBlockedPeriodActionMock).toHaveBeenCalledWith({
        courtId: COURT_A_ID,
        date: '2026-11-05',
        startTime: '07:00',
        endTime: '12:00',
        reason: '  Private event  ',
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Blocked period added.');
    await waitFor(() => {
      expect(getBlockedPeriodsActionMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Date')).toHaveValue('');
      expect(screen.getByLabelText('Reason')).toHaveValue('');
    });
  });

  it('never renders booking numbers or counts when the action reports a booking conflict', async () => {
    createBlockedPeriodActionMock.mockResolvedValue({
      success: false,
      hasBookingConflict: true,
      error:
        'This time overlaps 2 existing bookings (KH-0042). Existing bookings are never changed — choose a different time.',
    });

    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('No blocked periods defined.');

    fillValidCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect(
      await screen.findByText('This time overlaps existing bookings. Please choose a different time.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/KH-0042/)).toBeNull();
    expect(screen.queryByText(/2 existing bookings/)).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      'This time overlaps existing bookings. Please choose a different time.'
    );
  });

  it('shows a non-booking-conflict server error verbatim', async () => {
    createBlockedPeriodActionMock.mockResolvedValue({
      success: false,
      error: 'This time range overlaps an existing blocked period.',
    });

    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('No blocked periods defined.');

    fillValidCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect(
      await screen.findByText('This time range overlaps an existing blocked period.')
    ).toBeInTheDocument();
  });

  it('requires a two-step confirm before deleting, then refreshes on success', async () => {
    getBlockedPeriodsActionMock
      .mockResolvedValueOnce({ success: true, blockedPeriods: [makeBlockedPeriod()] })
      .mockResolvedValueOnce({ success: true, blockedPeriods: [] });
    deleteBlockedPeriodActionMock.mockResolvedValue({ success: true, id: 'bp-1' });

    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('Maintenance');

    const deleteButton = screen.getByRole('button', { name: 'Delete 2026-11-01' });
    fireEvent.click(deleteButton);
    expect(deleteBlockedPeriodActionMock).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole('button', { name: 'Confirm delete 2026-11-01' });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteBlockedPeriodActionMock).toHaveBeenCalledWith('bp-1');
    });
    expect(toast.success).toHaveBeenCalledWith('Blocked period removed.');
    expect(await screen.findByText('No blocked periods defined.')).toBeInTheDocument();
  });

  it('keeps the row and surfaces the server error when deletion fails', async () => {
    getBlockedPeriodsActionMock.mockResolvedValue({
      success: true,
      blockedPeriods: [makeBlockedPeriod()],
    });
    deleteBlockedPeriodActionMock.mockResolvedValue({ success: false, error: 'Blocked period not found.' });

    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('Maintenance');

    fireEvent.click(screen.getByRole('button', { name: 'Delete 2026-11-01' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete 2026-11-01' }));

    expect(await screen.findByText('Blocked period not found.')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Blocked period not found.');
  });

  // ── Item D: localStorage mirror (admin-browser consistency) ─────

  it('mirrors a successful create into the local store with the submitted fields', async () => {
    createBlockedPeriodActionMock.mockResolvedValue({
      success: true,
      blockedPeriod: makeBlockedPeriod({ id: 'bp-new' }),
    });

    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('No blocked periods defined.');

    fillValidCreateForm();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Private event' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    await waitFor(() => {
      expect(addBlockedPeriodMock).toHaveBeenCalledWith({
        courtId: COURT_A_ID,
        date: '2026-11-05',
        startTime: '07:00',
        endTime: '12:00',
        reason: 'Private event',
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Blocked period added.');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('skips the mirror when the local store already holds the same court+date+startTime', async () => {
    store.blockedPeriods = [
      makeBlockedPeriod({
        id: 'store-existing',
        date: '2026-11-05',
        startTime: '07:00',
        reason: 'Pre-existing local entry',
      }),
    ];
    createBlockedPeriodActionMock.mockResolvedValue({
      success: true,
      blockedPeriod: makeBlockedPeriod({ id: 'bp-new' }),
    });

    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('No blocked periods defined.');

    fillValidCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Blocked period added.');
    });
    expect(addBlockedPeriodMock).not.toHaveBeenCalled();
  });

  it('does NOT present a successful create as fully successful when the mirror fails, and offers Re-sync', async () => {
    createBlockedPeriodActionMock.mockResolvedValue({
      success: true,
      blockedPeriod: makeBlockedPeriod({ id: 'bp-new' }),
    });
    addBlockedPeriodMock.mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });

    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('No blocked periods defined.');

    fillValidCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect(
      await screen.findByText(
        'Saved to the database, but the local device copy (used by the availability view in this browser) could not be updated. Press Re-sync below; if it keeps failing, reload this page and try again.'
      )
    ).toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledWith(
      'Saved to the database, but the local device copy (used by the availability view in this browser) could not be updated. Press Re-sync below; if it keeps failing, reload this page and try again.'
    );
    expect(toast.success).not.toHaveBeenCalledWith('Local copy re-synced.');

    // Safe recovery path: the retry succeeds and clears the warning.
    fireEvent.click(screen.getByRole('button', { name: 'Re-sync' }));

    await waitFor(() => {
      expect(addBlockedPeriodMock).toHaveBeenCalledTimes(2);
    });
    expect(toast.success).toHaveBeenCalledWith('Local copy re-synced.');
    expect(
      screen.queryByText(/Saved to the database, but the local device copy/)
    ).not.toBeInTheDocument();
  });

  it('mirrors a successful delete by removing the matching local row', async () => {
    store.blockedPeriods = [
      makeBlockedPeriod({ id: 'store-bp-1', date: '2026-11-01', startTime: '10:00', endTime: '12:00' }),
    ];
    getBlockedPeriodsActionMock
      .mockResolvedValueOnce({ success: true, blockedPeriods: [makeBlockedPeriod()] })
      .mockResolvedValueOnce({ success: true, blockedPeriods: [] });
    deleteBlockedPeriodActionMock.mockResolvedValue({ success: true, id: 'bp-1' });

    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('Maintenance');

    fireEvent.click(screen.getByRole('button', { name: 'Delete 2026-11-01' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete 2026-11-01' }));

    await waitFor(() => {
      expect(removeBlockedPeriodMock).toHaveBeenCalledWith('store-bp-1');
    });
    expect(toast.success).toHaveBeenCalledWith('Blocked period removed.');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('warns without false success when a delete mirror fails and re-syncs by retry', async () => {
    store.blockedPeriods = [
      makeBlockedPeriod({ id: 'store-bp-1', date: '2026-11-01', startTime: '10:00', endTime: '12:00' }),
    ];
    getBlockedPeriodsActionMock
      .mockResolvedValueOnce({ success: true, blockedPeriods: [makeBlockedPeriod()] })
      .mockResolvedValueOnce({ success: true, blockedPeriods: [] });
    deleteBlockedPeriodActionMock.mockResolvedValue({ success: true, id: 'bp-1' });
    removeBlockedPeriodMock.mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });

    render(<AdminBlockedPeriodsPage />);
    await screen.findByText('Maintenance');

    fireEvent.click(screen.getByRole('button', { name: 'Delete 2026-11-01' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete 2026-11-01' }));

    expect(
      await screen.findByText(/Saved to the database, but the local device copy/)
    ).toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalledWith('Local copy re-synced.');

    fireEvent.click(screen.getByRole('button', { name: 'Re-sync' }));

    await waitFor(() => {
      expect(removeBlockedPeriodMock).toHaveBeenCalledTimes(2);
    });
    expect(toast.success).toHaveBeenCalledWith('Local copy re-synced.');
  });
});
