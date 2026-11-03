/**
 * BlockedPeriodsManager (Overview surface) — create-form validation.
 *
 * Regression: the add form previously only rejected `startTime === endTime`,
 * so an end-before-start pair passed through to a direct client insert,
 * failed against the tstzrange invariant in the database, and then fell
 * through to the "saved locally only" path — leaving a garbage entry in the
 * localStorage mirror. The manager now mirrors the same rule the dedicated
 * page and the server action enforce (end strictly after start) BEFORE any
 * insert or mirror write.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    warning: vi.fn(),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock('@/services/court.service', () => ({
  getCourtsFromSupabase: () => getCourtsFromSupabaseMock(),
}));

const getCourtsFromSupabaseMock = vi.fn(
  () =>
    Promise.resolve([
      // Partial court stubs — the manager only renders `{c.name}`.
      { id: '11111111-1111-1111-1111-111111111111', name: 'Court A', sportType: 'Padel' },
    ]) as unknown as Promise<Array<{ id: string; name: string; sportType: string }>>
);

const userMock = vi.fn(async () => ({
  data: { user: { id: 'admin-1', email: 'admin@test.local' } },
}));
const insertMock = vi.fn(() => Promise.resolve({ error: null } as { error: null }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => userMock(),
    },
    from: (table: string) => ({
      // list path: .select('*').order(...)
      select: (...selectArgs: unknown[]) => ({
        order: () => Promise.resolve({ data: [], error: null }),
        // insert path: the manager awaits .insert(...) directly, so only a
        // thenable insert is required.
        __selectArgs: selectArgs,
        table,
      }),
      insert: () => insertMock(),
    }),
  }),
}));

/**
 * The store module is replaced wholesale underneath (vi.mock below) — this
 * comment keeps the test self-documenting about which module is mocked.
 */

type BpStoreState = {
  blockedPeriods: Array<{ id: string; [k: string]: unknown }>;
  addBlockedPeriod: ReturnType<typeof vi.fn>;
  removeBlockedPeriod: ReturnType<typeof vi.fn>;
};

const store = {
  blockedPeriods: [] as BpStoreState['blockedPeriods'],
  addBlockedPeriod: vi.fn(),
  removeBlockedPeriod: vi.fn(),
};

vi.mock('@/features/booking/useBlockedPeriodStore', () => {
  const hook = vi.fn((selector: (s: BpStoreState) => unknown) =>
    selector(store as BpStoreState)
  ) as unknown as {
    getState: () => BpStoreState;
    (selector?: unknown): unknown;
  };
  hook.getState = () => store as BpStoreState;
  return { useBlockedPeriodStore: hook };
});

import { BlockedPeriodsManager } from '@/features/booking/BlockedPeriodsManager';

function fillForm(fields: {
  date?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
}) {
  if (fields.date !== undefined) {
    const input = document.querySelector(
      'input[type="date"]'
    ) as HTMLInputElement | null;
    fireEvent.change(input!, { target: { value: fields.date } });
  }
  if (fields.startTime !== undefined) {
    const inputs = document.querySelectorAll('input[type="time"]');
    fireEvent.change(inputs[0], { target: { value: fields.startTime } });
  }
  if (fields.endTime !== undefined) {
    const inputs = document.querySelectorAll('input[type="time"]');
    fireEvent.change(inputs[1], { target: { value: fields.endTime } });
  }
  if (fields.reason !== undefined) {
    const input = screen.getByPlaceholderText('Reason');
    fireEvent.change(input, { target: { value: fields.reason } });
  }
  const addButton = screen.getByRole('button', { name: /add/i });
  fireEvent.click(addButton);
}

beforeEach(() => {
  store.blockedPeriods = [];
  store.addBlockedPeriod.mockClear();
  store.removeBlockedPeriod.mockClear();
  toastErrorMock.mockClear();
  toastSuccessMock.mockClear();
  insertMock.mockClear();
  insertMock.mockResolvedValue({ error: null });
  getCourtsFromSupabaseMock.mockResolvedValue([
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Court A',
      sportType: 'Padel',
    } as { id: string; name: string; sportType: string },
  ]);
});

describe('BlockedPeriodsManager — create validation', () => {
  it('rejects an end time before the start time without writing anywhere', async () => {
    render(<BlockedPeriodsManager />);

    fillForm({ date: '2099-06-15', startTime: '12:00', endTime: '10:00', reason: 'Maintenance' });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('End time must be after start time.');
    });

    expect(insertMock).not.toHaveBeenCalled();
    expect(store.addBlockedPeriod).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('rejects an end time equal to the start time without writing anywhere', async () => {
    render(<BlockedPeriodsManager />);

    fillForm({ date: '2099-06-15', startTime: '12:00', endTime: '12:00', reason: 'Maintenance' });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('End time must be after start time.');
    });

    expect(insertMock).not.toHaveBeenCalled();
    expect(store.addBlockedPeriod).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('accepts end strictly after start: insert + mirror write both happen', async () => {
    render(<BlockedPeriodsManager />);

    fillForm({ date: '2099-06-15', startTime: '10:00', endTime: '12:00', reason: 'Maintenance' });

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Blocked period added.');
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(store.addBlockedPeriod).toHaveBeenCalledTimes(1);
    expect(store.addBlockedPeriod).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2099-06-15',
        startTime: '10:00',
        endTime: '12:00',
        reason: 'Maintenance',
      })
    );
  });
});
