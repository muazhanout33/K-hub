import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { Court } from '@/types';

const getAdminCourtsActionMock = vi.fn();
const setCourtArchivedActionMock = vi.fn();

vi.mock('@/app/actions/court.actions', () => ({
  getAdminCourtsAction: (...args: unknown[]) => getAdminCourtsActionMock(...args),
  setCourtArchivedAction: (...args: unknown[]) => setCourtArchivedActionMock(...args),
  createCourtAction: vi.fn(),
  updateCourtAction: vi.fn(),
}));

type GuardState = {
  user: { id: string; name: string; role: string } | null;
  isRedirecting: boolean;
  isAdmin: boolean;
};

const adminGuard: GuardState = {
  user: { id: 'admin-1', name: 'Admin User', role: 'Admin' },
  isRedirecting: false,
  isAdmin: true,
};

vi.mock('@/hooks/useAdminGuard', () => ({
  useAdminGuard: () => adminGuard,
}));

vi.mock('@/app/admin/courts/CourtEditDrawer', () => ({
  CourtEditDrawer: ({ court, mode }: { court: Court | null; mode?: string }) => {
    if (!court && mode !== 'create') return null;
    return <div data-testid="court-drawer">{`drawer:${mode ?? 'edit'}:${court?.name ?? 'none'}`}</div>;
  },
}));

import AdminCourtsPage from '@/app/admin/courts/page';

function makeCourt(overrides: Partial<Court> = {}): Court {
  return {
    id: 'court-1',
    name: 'Court One',
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
    ...overrides,
  };
}

describe('AdminCourtsPage — create & archive lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminGuard.user = { id: 'admin-1', name: 'Admin User', role: 'Admin' };
    adminGuard.isRedirecting = false;
    adminGuard.isAdmin = true;
    getAdminCourtsActionMock.mockResolvedValue({
      success: true,
      courts: [makeCourt()],
    });
    setCourtArchivedActionMock.mockResolvedValue({ success: true, courtId: 'court-1' });
  });

  it('lists active courts and passes active-only visibility by default', async () => {
    render(<AdminCourtsPage />);

    await screen.findByText('Court One');
    expect(getAdminCourtsActionMock).toHaveBeenLastCalledWith({ includeArchived: false });
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });

  it('toggles archived visibility and re-fetches with includeArchived', async () => {
    getAdminCourtsActionMock
      .mockResolvedValueOnce({ success: true, courts: [makeCourt()] })
      .mockResolvedValueOnce({
        success: true,
        courts: [
          makeCourt(),
          makeCourt({ id: 'court-2', name: 'Court Two', deletedAt: '2026-10-01T00:00:00Z' }),
        ],
      });

    render(<AdminCourtsPage />);
    await screen.findByText('Court One');

    fireEvent.click(screen.getByRole('button', { name: /Show archived/ }));

    expect(
      await screen.findByText('Court Two')
    ).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(getAdminCourtsActionMock).toHaveBeenLastCalledWith({ includeArchived: true });
    expect(screen.getByRole('button', { name: /Hide archived/ })).toBeInTheDocument();
  });

  it('archives a court via a two-step confirm and refreshes', async () => {
    getAdminCourtsActionMock.mockResolvedValue({ success: true, courts: [makeCourt()] });

    render(<AdminCourtsPage />);
    await screen.findByText('Court One');

    fireEvent.click(screen.getByRole('button', { name: 'Archive Court One' }));
    expect(setCourtArchivedActionMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm archive change Court One' }));

    await waitFor(() => {
      expect(setCourtArchivedActionMock).toHaveBeenCalledWith({
        courtId: 'court-1',
        archived: true,
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Court "Court One" archived.');
    await waitFor(() => {
      expect(getAdminCourtsActionMock).toHaveBeenCalledTimes(2);
    });
  });

  it('restores an archived court (deletedAt false is sent)', async () => {
    getAdminCourtsActionMock.mockResolvedValue({
      success: true,
      courts: [makeCourt({ deletedAt: '2026-10-01T00:00:00Z' })],
    });

    render(<AdminCourtsPage />);
    await screen.findByText('Court One');

    // Archived rows hide Edit but offer Restore.
    expect(screen.queryByRole('button', { name: 'Edit Court One' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Court One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm archive change Court One' }));

    await waitFor(() => {
      expect(setCourtArchivedActionMock).toHaveBeenCalledWith({
        courtId: 'court-1',
        archived: false,
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Court "Court One" restored.');
  });

  it('surfaces a failure from the archive action and keeps the row', async () => {
    setCourtArchivedActionMock.mockResolvedValue({ success: false, error: 'boom-static' });

    render(<AdminCourtsPage />);
    await screen.findByText('Court One');

    fireEvent.click(screen.getByRole('button', { name: 'Archive Court One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm archive change Court One' }));

    expect(await screen.findByText('boom-static')).toBeInTheDocument();
    expect(screen.getByText('Court One')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('boom-static');
  });

  it('opens the create drawer from the Add court button', async () => {
    // The edit drawer only renders for a selected court — initially hidden.
    const { queryByTestId } = render(<AdminCourtsPage />);
    expect(queryByTestId('court-drawer')).toBeNull();
    await screen.findByText('Court One');
    expect(queryByTestId('court-drawer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Add court/ }));

    await waitFor(() => {
      expect(screen.getByTestId('court-drawer')).toHaveTextContent('drawer:create:none');
    });
  });
});
