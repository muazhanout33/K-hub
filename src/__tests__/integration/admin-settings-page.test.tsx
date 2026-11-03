import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';

const getSettingsActionMock = vi.fn();
const updateSettingsActionMock = vi.fn();

vi.mock('@/app/actions/settings.actions', () => ({
  getSettingsAction: (...args: unknown[]) => getSettingsActionMock(...args),
  updateSettingsAction: (...args: unknown[]) => updateSettingsActionMock(...args),
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

// ── Notification store (client-only sound preference) ──
// Reactive mock: mirrors Zustand's subscribe/getSnapshot semantics so
// toggles re-render the component.
const storeListeners = new Set<() => void>();
let soundSnapshot: { soundEnabled: boolean; toggleSound: () => void } = {
  soundEnabled: true,
  toggleSound: () => undefined,
};
const toggleSoundMock = vi.fn(() => {
  soundSnapshot = {
    ...soundSnapshot,
    soundEnabled: !soundSnapshot.soundEnabled,
  };
  storeListeners.forEach((listener) => listener());
});
soundSnapshot.toggleSound = toggleSoundMock;

vi.mock('@/features/notifications/useNotificationStore', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useNotificationStore: <T,>(selector: (s: typeof soundSnapshot) => T): T =>
      useSyncExternalStore(
        (listener: () => void) => {
          storeListeners.add(listener);
          return () => storeListeners.delete(listener);
        },
        () => selector(soundSnapshot)
      ),
  };
});

const playNotificationSoundMock = vi.fn();
vi.mock('@/lib/audio', () => ({
  playNotificationSound: (...args: unknown[]) =>
    playNotificationSoundMock(...args),
}));

import AdminSettingsPage from '@/app/admin/settings/page';

/** Default values matching the registry defaults. */
function defaultValues(): Record<string, unknown> {
  return {
    'booking.cancellation_window_hours': 2,
    'booking.hold_timer_minutes': 10,
    'booking.max_advance_days': 30,
    'club.name': 'WEGO',
    'club.operating_hours_start': '09:00',
    'club.operating_hours_end': '23:00',
    'system.maintenance_mode': false,
    'system.maintenance_message':
      'We are performing scheduled maintenance. Please check back shortly.',
  };
}

function successRead(overrides: Record<string, unknown> = {}, defaultKeys: string[] = []) {
  return {
    success: true,
    values: { ...defaultValues(), ...overrides },
    defaultKeys,
  };
}

describe('AdminSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminGuard.hydrated = true;
    adminGuard.user = { id: 'admin-1', name: 'Admin User', role: 'Admin' };
    adminGuard.isRedirecting = false;
    adminGuard.isAdmin = true;
    soundSnapshot = { ...soundSnapshot, soundEnabled: true };
    getSettingsActionMock.mockResolvedValue(successRead());
    updateSettingsActionMock.mockResolvedValue({ success: true, values: defaultValues(), updatedKeys: [] });
  });

  // ── Access guard ───────────────────────────────────────────────

  it('shows the access-checking state while the guard is redirecting', () => {
    adminGuard.isRedirecting = true;
    adminGuard.isAdmin = false;
    adminGuard.user = null;

    render(<AdminSettingsPage />);
    expect(screen.getByText('Checking access...')).toBeInTheDocument();
    expect(getSettingsActionMock).not.toHaveBeenCalled();
  });

  it('renders nothing for a non-admin user and never loads settings', () => {
    adminGuard.isAdmin = false;
    adminGuard.user = null;

    const { container } = render(<AdminSettingsPage />);
    expect(container.firstChild).toBeNull();
    expect(getSettingsActionMock).not.toHaveBeenCalled();
  });

  // ── Load ───────────────────────────────────────────────────────

  it('renders all sections with loaded values', async () => {
    render(<AdminSettingsPage />);

    expect(
      await screen.findByTestId('settings-section-booking')
    ).toBeInTheDocument();
    expect(screen.getByTestId('settings-section-club')).toBeInTheDocument();
    expect(screen.getByTestId('settings-section-system')).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-section-notifications')
    ).toBeInTheDocument();

    // Loaded (stored) values appear in the inputs.
    expect(
      screen.getByDisplayValue('WEGO')
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('10')
    ).toBeInTheDocument();

    // Section headings present.
    expect(screen.getByText('Booking Rules')).toBeInTheDocument();
    expect(screen.getByText('Club & Facility Defaults')).toBeInTheDocument();
    expect(screen.getByText('System Preferences')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('shows a loading state while the first read is in flight', async () => {
    let resolveRead: (v: unknown) => void = () => undefined;
    getSettingsActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      })
    );

    render(<AdminSettingsPage />);
    expect(screen.getByText('Loading settings...')).toBeInTheDocument();

    resolveRead(successRead());
    expect(
      await screen.findByTestId('settings-section-booking')
    ).toBeInTheDocument();
  });

  it('shows a load error with Retry that refetches', async () => {
    getSettingsActionMock
      .mockResolvedValueOnce({
        success: false,
        error: 'Unable to load settings. Please try again.',
      })
      .mockResolvedValueOnce(successRead());

    render(<AdminSettingsPage />);

    expect(
      await screen.findByText('Unable to load settings. Please try again.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByTestId('settings-section-booking')
    ).toBeInTheDocument();
    expect(getSettingsActionMock).toHaveBeenCalledTimes(2);
  });

  it('shows a generic error when the load action throws', async () => {
    getSettingsActionMock.mockRejectedValue(new Error('network down'));

    render(<AdminSettingsPage />);

    expect(
      await screen.findByText('Unable to load settings. Please try again.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-booking')).toBeNull();
  });

  it('shows the empty banner when every value is a default', async () => {
    const allKeys = Object.keys(defaultValues());
    getSettingsActionMock.mockResolvedValue(successRead({}, allKeys));

    render(<AdminSettingsPage />);

    expect(await screen.findByTestId('settings-empty-banner')).toBeInTheDocument();
  });

  it('hides the empty banner once a custom value is stored', async () => {
    getSettingsActionMock.mockResolvedValue(
      successRead({ 'booking.hold_timer_minutes': 20 }, ['club.name'])
    );

    render(<AdminSettingsPage />);

    expect(await screen.findByDisplayValue('20')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-empty-banner')).toBeNull();
  });

  // ── Save ───────────────────────────────────────────────────────

  it('disables Save until a field is edited', async () => {
    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-booking');

    const saveButton = screen.getByTestId('settings-save-booking');
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByTestId('setting-input-booking.hold_timer_minutes'), {
      target: { value: '25' },
    });

    expect(saveButton).toBeEnabled();
  });

  it('saves only the changed keys of the section and toasts success', async () => {
    updateSettingsActionMock.mockResolvedValue({
      success: true,
      values: { ...defaultValues(), 'booking.hold_timer_minutes': 25 },
      updatedKeys: ['booking.hold_timer_minutes'],
    });

    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-booking');

    fireEvent.change(screen.getByTestId('setting-input-booking.hold_timer_minutes'), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByTestId('settings-save-booking'));

    await waitFor(() => {
      expect(updateSettingsActionMock).toHaveBeenCalledWith({
        'booking.hold_timer_minutes': 25,
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Saved 1 setting.');
    // Untouched keys are not sent.
    const payload = updateSettingsActionMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(['booking.hold_timer_minutes']);
  });

  it('disables Save again when the input is restored to its original value', async () => {
    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-booking');

    const input = screen.getByTestId('setting-input-booking.hold_timer_minutes');
    const saveButton = screen.getByTestId('settings-save-booking');

    fireEvent.change(input, { target: { value: '99' } });
    expect(saveButton).toBeEnabled();

    fireEvent.change(input, { target: { value: '10' } });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);
    expect(updateSettingsActionMock).not.toHaveBeenCalled();
  });

  it('blocks invalid input client-side without calling the action', async () => {
    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-booking');

    fireEvent.change(screen.getByTestId('setting-input-booking.hold_timer_minutes'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByTestId('settings-save-booking'));

    expect(await screen.findByText('Must be at least 1 minutes.')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Please fix the highlighted fields.');
    expect(updateSettingsActionMock).not.toHaveBeenCalled();
  });

  it('clears the field error as soon as the input is edited again', async () => {
    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-booking');

    const input = screen.getByTestId('setting-input-booking.hold_timer_minutes');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('settings-save-booking'));
    expect(await screen.findByText('Must be at least 1 minutes.')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '5' } });
    expect(screen.queryByText('Must be at least 1 minutes.')).toBeNull();
  });

  it('surfaces server field errors without a full-save failure banner', async () => {
    updateSettingsActionMock.mockResolvedValue({
      success: false,
      fieldErrors: { 'booking.hold_timer_minutes': 'Must be at most 120 minutes.' },
      error: 'Please correct the highlighted fields.',
    });

    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-booking');

    fireEvent.change(screen.getByTestId('setting-input-booking.hold_timer_minutes'), {
      target: { value: '11' },
    });
    fireEvent.click(screen.getByTestId('settings-save-booking'));

    expect(
      await screen.findByText('Must be at most 120 minutes.')
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Please correct the highlighted fields.');
  });

  it('shows the save-error banner when the server rejects the write', async () => {
    updateSettingsActionMock.mockResolvedValue({
      success: false,
      error: 'Unable to save settings. Please try again.',
    });

    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-booking');

    fireEvent.change(screen.getByTestId('setting-input-booking.hold_timer_minutes'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByTestId('settings-save-booking'));

    expect(await screen.findByTestId('settings-save-error')).toBeInTheDocument();
    expect(
      screen.getByText('Unable to save settings. Please try again.')
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      'Unable to save settings. Please try again.'
    );
  });

  it('shows a generic error when the save action throws', async () => {
    updateSettingsActionMock.mockRejectedValue(new Error('boom'));

    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-booking');

    fireEvent.change(screen.getByTestId('setting-input-booking.hold_timer_minutes'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByTestId('settings-save-booking'));

    expect(
      await screen.findByText('Could not save settings. Please try again.')
    ).toBeInTheDocument();
    expect(updateSettingsActionMock).toHaveBeenCalledTimes(1);
  });

  it('marks updated keys as Saved after a successful write', async () => {
    updateSettingsActionMock.mockResolvedValue({
      success: true,
      values: { ...defaultValues(), 'club.name': 'Sky Club' },
      updatedKeys: ['club.name'],
    });

    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-club');

    fireEvent.change(screen.getByTestId('setting-input-club.name'), {
      target: { value: 'Sky Club' },
    });
    fireEvent.click(screen.getByTestId('settings-save-club'));

    await waitFor(() => {
      expect(updateSettingsActionMock).toHaveBeenCalledWith({ 'club.name': 'Sky Club' });
    });
    expect(await screen.findByText('Saved', { selector: 'span' })).toBeInTheDocument();
  });

  it('saves boolean toggles as real booleans', async () => {
    updateSettingsActionMock.mockResolvedValue({
      success: true,
      values: { ...defaultValues(), 'system.maintenance_mode': true },
      updatedKeys: ['system.maintenance_mode'],
    });

    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-system');

    const toggle = screen.getByTestId('setting-toggle-system.maintenance_mode');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('settings-save-system'));

    await waitFor(() => {
      expect(updateSettingsActionMock).toHaveBeenCalledWith({
        'system.maintenance_mode': true,
      });
    });
  });

  // ── Notifications (client-only) ────────────────────────────────

  it('reflects the persisted sound preference', async () => {
    soundSnapshot = { ...soundSnapshot, soundEnabled: false };
    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-notifications');

    expect(screen.getByTestId('notification-sound-toggle')).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('toggles the sound preference without touching settings actions', async () => {
    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-notifications');

    const toggle = screen.getByTestId('notification-sound-toggle');
    fireEvent.click(toggle);

    expect(toggleSoundMock).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    // Sound changes never hit the server.
    expect(updateSettingsActionMock).not.toHaveBeenCalled();
  });

  it('plays the test sound on demand', async () => {
    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-notifications');

    fireEvent.click(screen.getByTestId('test-sound-button'));

    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
    expect(updateSettingsActionMock).not.toHaveBeenCalled();
  });

  // ── Stored-only disclosure ─────────────────────────────────────

  it('discloses that DB settings are stored-only and not yet enforced', async () => {
    render(<AdminSettingsPage />);
    await screen.findByTestId('settings-section-booking');

    expect(screen.getByText(/not yet enforced/)).toBeInTheDocument();
    const storedOnlyBadges = screen.getAllByText('Stored only');
    // Every DB-backed field carries the badge (8 registry settings).
    expect(storedOnlyBadges).toHaveLength(8);
  });
});
