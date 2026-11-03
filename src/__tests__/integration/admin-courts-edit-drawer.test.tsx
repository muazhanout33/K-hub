import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { toast } from 'sonner';
import { Court } from '@/types';

const updateCourtActionMock = vi.fn();
const createCourtActionMock = vi.fn();

vi.mock('@/app/actions/court.actions', () => ({
  getAdminCourtsAction: vi.fn(),
  updateCourtAction: (...args: unknown[]) => updateCourtActionMock(...args),
  createCourtAction: (...args: unknown[]) => createCourtActionMock(...args),
}));

import { CourtEditDrawer } from '@/app/admin/courts/CourtEditDrawer';

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

const noop = () => {};

describe('CourtEditDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when no court is selected', () => {
    const { container } = render(<CourtEditDrawer court={null} onClose={noop} onSaved={noop} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the seven approved editable fields prefilled, plus read-only slot duration', () => {
    render(<CourtEditDrawer court={makeCourt()} onClose={noop} onSaved={noop} />);

    expect(screen.getByLabelText('Court name')).toHaveValue('Court One');
    expect(screen.getByLabelText('Sport type')).toHaveValue('Padel');
    expect(screen.getByLabelText('Surface')).toHaveValue('Panoramic');
    expect(screen.getByLabelText('Hourly price (EGP)')).toHaveValue(250);
    expect(screen.getByLabelText('Opens')).toHaveValue('07:00');
    expect(screen.getByLabelText('Closes')).toHaveValue('00:00');
    expect(screen.getByLabelText('Operational status')).toHaveValue('Available');
    expect(screen.getByLabelText('Image URL')).toHaveValue('/images/courts/court-one.jpg');

    // Slot duration is displayed but never editable (D5).
    expect(screen.getByText(/Slot duration/)).toHaveTextContent('60 min');
    expect(screen.getByText(/not editable/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Slot duration')).not.toBeInTheDocument();
  });

  it('shows a placeholder for a non-editable current status instead of a silent Available fallback (fix #1)', () => {
    render(<CourtEditDrawer court={makeCourt({ status: 'Booked' })} onClose={noop} onSaved={noop} />);

    const select = screen.getByLabelText('Operational status');
    expect(select).toHaveValue(''); // no silent 'Available' pre-selection
    expect(screen.getByRole('option', { name: /Booked \(not editable/ })).toBeInTheDocument();
  });

  it('blocks submission with inline client validation and never calls the action', async () => {
    render(<CourtEditDrawer court={makeCourt()} onClose={noop} onSaved={noop} />);

    fireEvent.change(screen.getByLabelText('Court name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      expect(screen.getByText(/Name is required/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Court name')).toHaveAttribute('aria-invalid', 'true');
    expect(updateCourtActionMock).not.toHaveBeenCalled();
  });

  it('shows the saving state while the action is pending, then toasts, refreshes and closes', async () => {
    let resolveUpdate!: (value: unknown) => void;
    updateCourtActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );

    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<CourtEditDrawer court={makeCourt()} onClose={onClose} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    const savingButton = screen.getByRole('button', { name: /Saving/ });
    expect(savingButton).toBeDisabled();

    await act(async () => {
      resolveUpdate({ success: true, court: makeCourt({ name: 'Court One' }) });
    });

    expect(toast.success).toHaveBeenCalledWith('Court "Court One" updated.');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateCourtActionMock).toHaveBeenCalledTimes(1);
    // The base payload never carries an acknowledgement flag.
    expect(updateCourtActionMock.mock.calls[0][0]).not.toHaveProperty(
      'acknowledgeOutsideHours'
    );
  });

  it('surfaces a generic server error inline without closing the drawer', async () => {
    updateCourtActionMock.mockResolvedValue({
      success: false,
      error: 'Failed to save court changes. Please try again.',
    });

    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<CourtEditDrawer court={makeCourt()} onClose={onClose} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      expect(
        screen.getByText('Failed to save court changes. Please try again.')
      ).toBeInTheDocument();
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('asks for confirmation on the outside-hours warning and re-sends with acknowledgement when accepted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    updateCourtActionMock
      .mockResolvedValueOnce({
        success: false,
        warningCode: 'OUTSIDE_WORKING_HOURS',
        affectedBookingCount: 2,
        error: 'New working hours would leave 2 existing bookings outside opening hours.',
      })
      .mockResolvedValueOnce({ success: true, court: makeCourt() });

    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<CourtEditDrawer court={makeCourt()} onClose={onClose} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 existing bookings outside opening hours')
    );
    expect(updateCourtActionMock).toHaveBeenCalledTimes(2);
    expect(updateCourtActionMock.mock.calls[0][0]).not.toHaveProperty(
      'acknowledgeOutsideHours'
    );
    expect(updateCourtActionMock.mock.calls[1][0]).toMatchObject({
      acknowledgeOutsideHours: true,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the warning on screen and writes nothing when the admin declines the confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    updateCourtActionMock.mockResolvedValueOnce({
      success: false,
      warningCode: 'OUTSIDE_WORKING_HOURS',
      affectedBookingCount: 1,
      error: 'New working hours would leave 1 existing booking outside opening hours.',
    });

    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<CourtEditDrawer court={makeCourt()} onClose={onClose} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      expect(
        screen.getByText('New working hours would leave 1 existing booking outside opening hours.')
      ).toBeInTheDocument();
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(updateCourtActionMock).toHaveBeenCalledTimes(1); // no acknowledged re-send
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  // ── Status preservation (review fix #1) ────────────────────────

  it('editing only the name does not send or change a non-editable current status (fix #1)', async () => {
    updateCourtActionMock.mockResolvedValue({
      success: true,
      court: makeCourt({ name: 'Renamed' }),
    });
    const onClose = vi.fn();
    render(
      <CourtEditDrawer court={makeCourt({ status: 'Booked' })} onClose={onClose} onSaved={noop} />
    );

    fireEvent.change(screen.getByLabelText('Court name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateCourtActionMock).toHaveBeenCalledTimes(1);
    const payload = updateCourtActionMock.mock.calls[0][0];
    expect(payload).toMatchObject({ name: 'Renamed' });
    expect(payload).not.toHaveProperty('status'); // 'Booked' preserved — never rewritten
  });

  it('editing only the price does not send or change a non-editable current status (fix #1)', async () => {
    updateCourtActionMock.mockResolvedValue({ success: true, court: makeCourt() });
    render(
      <CourtEditDrawer
        court={makeCourt({ status: 'Starts Soon' })}
        onClose={noop}
        onSaved={noop}
      />
    );

    fireEvent.change(screen.getByLabelText('Hourly price (EGP)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(updateCourtActionMock).toHaveBeenCalledTimes(1));
    const payload = updateCourtActionMock.mock.calls[0][0];
    expect(payload).toMatchObject({ pricePerHour: 300 });
    expect(payload).not.toHaveProperty('status'); // 'Starts Soon' preserved
  });

  it('includes status only when the admin explicitly picks one (fix #1)', async () => {
    updateCourtActionMock.mockResolvedValue({ success: true, court: makeCourt() });
    render(
      <CourtEditDrawer court={makeCourt({ status: 'Booked' })} onClose={noop} onSaved={noop} />
    );

    fireEvent.change(screen.getByLabelText('Operational status'), {
      target: { value: 'Maintenance' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(updateCourtActionMock).toHaveBeenCalledTimes(1));
    expect(updateCourtActionMock.mock.calls[0][0]).toMatchObject({ status: 'Maintenance' });
  });

  // ── Create mode (Phase 3) ──────────────────────────────────────

  it('renders the add-court form for mode="create" with court=null and defaults', () => {
    render(<CourtEditDrawer mode="create" court={null} onClose={noop} onSaved={noop} />);

    expect(screen.getByText('Add court')).toBeInTheDocument();
    expect(screen.getByLabelText('Court name')).toHaveValue('');
    expect(screen.getByLabelText('Hourly price (EGP)')).toHaveValue(null);
    expect(screen.getByLabelText('Operational status')).toHaveValue('Available');
    expect(screen.getByLabelText('Opens')).toHaveValue('07:00');
    expect(screen.getByLabelText('Closes')).toHaveValue('00:00');
    // Edit-mode null guard is untouched: court absent + edit mode => closed.
    expect(createCourtActionMock).not.toHaveBeenCalled();
  });

  it('blocks create submission with client validation and never calls the action', async () => {
    render(<CourtEditDrawer mode="create" court={null} onClose={noop} onSaved={noop} />);

    fireEvent.click(screen.getByRole('button', { name: /Create court/ }));

    expect(await screen.findByText(/Name is required/)).toBeInTheDocument();
    expect(createCourtActionMock).not.toHaveBeenCalled();
  });

  it('calls createCourtAction with the trimmed default-backed payload and closes on success', async () => {
    createCourtActionMock.mockResolvedValue({
      success: true,
      court: makeCourt({ name: 'Court Three', id: 'court-3' }),
    });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <CourtEditDrawer mode="create" court={null} onClose={onClose} onSaved={onSaved} />
    );

    fireEvent.change(screen.getByLabelText('Court name'), { target: { value: 'Court Three' } });
    fireEvent.change(screen.getByLabelText('Surface'), { target: { value: 'Grass' } });
    fireEvent.change(screen.getByLabelText('Hourly price (EGP)'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Image URL'), {
      target: { value: '/images/courts/court-3.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create court/ }));

    await waitFor(() => expect(createCourtActionMock).toHaveBeenCalledTimes(1));
    expect(createCourtActionMock.mock.calls[0][0]).toEqual({
      name: 'Court Three',
      sportType: 'Padel',
      surface: 'Grass',
      pricePerHour: 200,
      workingHoursOpen: '07:00',
      workingHoursClose: '00:00',
      imageUrl: '/images/courts/court-3.jpg',
      status: 'Available',
    });
    expect(toast.success).toHaveBeenCalledWith('Court "Court Three" created.');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateCourtActionMock).not.toHaveBeenCalled();
  });

  it('keeps the drawer open with the server error when creation fails', async () => {
    createCourtActionMock.mockResolvedValue({ success: false, error: 'boom-static' });
    const onClose = vi.fn();

    render(
      <CourtEditDrawer mode="create" court={null} onClose={onClose} onSaved={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText('Court name'), { target: { value: 'Court Three' } });
    fireEvent.change(screen.getByLabelText('Surface'), { target: { value: 'Grass' } });
    fireEvent.change(screen.getByLabelText('Hourly price (EGP)'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Image URL'), {
      target: { value: '/images/courts/court-3.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create court/ }));

    expect(await screen.findByText('boom-static')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
