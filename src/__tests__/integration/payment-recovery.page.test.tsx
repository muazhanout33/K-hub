/**
 * Payment page — durable confirmation recovery (refresh / redirect).
 *
 * Regression coverage for the production bug where a payment succeeded but
 * the booking confirmation was lost on a refresh/redirect, and the user
 * was bounced to the misleading "No booking in progress" empty state
 * (sometimes even being asked to pay again).
 *
 * Covered here:
 *  1. Auto-recovery resumes a pending confirmation exactly once on mount
 *     (confirm-only — never a second payment, never a duplicate booking)
 *  2. Exhausted retries persist a TRUTHFUL failure ("payment received but
 *     confirmation failed") with a Retry Confirmation affordance
 *  3. The empty state still appears when there is genuinely nothing
 *  4. A pending confirmation with no local booking never silently drops
 *     into the empty state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ── next/image stand-in (jsdom has no image optimizer) ──
vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

// ── Server actions (booking store + confirmation flow) ──
const createBookingActionMock = vi.fn();
const confirmBookingStatusActionMock = vi.fn();
const getBookingStatusActionMock = vi.fn();

vi.mock('@/app/actions/booking.actions', () => ({
  createBookingAction: (...args: unknown[]) => createBookingActionMock(...args),
  cancelBookingAction: vi.fn(),
  confirmBookingStatusAction: (...args: unknown[]) =>
    confirmBookingStatusActionMock(...args),
  expireStaleBookingsAction: vi.fn(),
  getBookingStatusAction: (...args: unknown[]) => getBookingStatusActionMock(...args),
}));

import BookingPaymentPage from '@/app/book/payment/page';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { clearPayments } from '@/services/payment.service';
import type { Booking } from '@/types';

const pushMock = vi.fn();

function makeBooking(
  id: string,
  status: 'Reserved' | 'Confirmed' | 'Cancelled' | 'Expired'
): Booking {
  return {
    id,
    bookingNumber: `KH-${id}`,
    courtId: 'court-1',
    courtName: 'Padel Court 1',
    courtImage: '',
    sportType: 'Padel',
    date: '2099-06-15',
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
    totalPrice: 350,
    status,
    bookingSource: 'ONLINE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    userId: 'user-1',
    userName: 'Test User',
    userEmail: 'test@example.com',
    userPhone: '01000000000',
    selectedSlotIds: ['slot-1'],
  } as Booking;
}

function seedBookingStore(overrides: Record<string, unknown> = {}) {
  useBookingStore.setState({
    selectedCourt: null,
    selectedDate: '2099-06-15',
    selectedSlots: [],
    bookingStep: 4,
    reservationStartTime: null,
    reservationExpiresAt: null,
    hasExtendedReservation: false,
    userName: '',
    userEmail: '',
    userPhone: '',
    bookings: [],
    isCancelling: false,
    _hasHydrated: true,
    ...overrides,
  });
}

function seedPaymentStore(overrides: Record<string, unknown> = {}) {
  usePaymentStore.setState({
    payments: [],
    lastIdempotencyKey: null,
    pendingConfirmation: null,
    lastBookingId: null,
    _hasHydrated: true,
    ...overrides,
  });
}

function seedPending(
  bookingId: string,
  overrides: Record<string, unknown> = {}
) {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    bookingId,
    paymentId: null,
    phase: 'confirming' as const,
    attempts: 1,
    lastError: null,
    startedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Payment page — durable confirmation recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPayments();
    vi.mocked(useRouter).mockReturnValue({
      push: pushMock,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as ReturnType<typeof useRouter>);
    seedBookingStore();
    seedPaymentStore();
    confirmBookingStatusActionMock.mockResolvedValue({ success: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-recovers a pending confirmation after refresh — confirm-only, no duplicate payment or booking', async () => {
    seedBookingStore({ bookings: [makeBooking('bk-recover-1', 'Reserved')] });
    seedPaymentStore({
      pendingConfirmation: seedPending('bk-recover-1'),
      lastBookingId: 'bk-recover-1',
    });
    confirmBookingStatusActionMock.mockResolvedValue({
      success: true,
      booking: makeBooking('bk-recover-1', 'Confirmed'),
    });

    render(<BookingPaymentPage />);

    // The misleading empty state must never flash while recovering.
    expect(screen.queryByText(/No booking in progress/)).toBeNull();
    expect(screen.getByText(/Finishing your booking/)).toBeTruthy();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/book/confirmation'));

    // Auto-recovery ran EXACTLY once (no retry storms / duplicate calls).
    expect(confirmBookingStatusActionMock).toHaveBeenCalledTimes(1);
    expect(confirmBookingStatusActionMock).toHaveBeenCalledWith('bk-recover-1');
    // Recovery never re-creates the reservation.
    expect(createBookingActionMock).not.toHaveBeenCalled();

    // Exactly one payment, already Paid — never charged twice.
    const payments = usePaymentStore.getState().payments;
    expect(payments).toHaveLength(1);
    expect(payments[0].bookingId).toBe('bk-recover-1');
    expect(payments[0].status).toBe('Paid');

    // Durable op cleared after success; no bounce to details/book.
    expect(usePaymentStore.getState().pendingConfirmation).toBeNull();
    expect(pushMock).not.toHaveBeenCalledWith('/book/details');
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Booking confirmed!');
  });

  it('keeps the recovery path even when local user details are gone (no /book/details bounce)', async () => {
    // Refresh wipes userName/userEmail — before the fix this redirected
    // away and lost the in-flight confirmation.
    seedBookingStore({
      bookings: [makeBooking('bk-recover-2', 'Reserved')],
      userName: '',
      userEmail: '',
    });
    seedPaymentStore({
      pendingConfirmation: seedPending('bk-recover-2'),
      lastBookingId: 'bk-recover-2',
    });
    confirmBookingStatusActionMock.mockResolvedValue({
      success: true,
      booking: makeBooking('bk-recover-2', 'Confirmed'),
    });

    render(<BookingPaymentPage />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/book/confirmation'));
    expect(pushMock).not.toHaveBeenCalledWith('/book/details');
    expect(confirmBookingStatusActionMock).toHaveBeenCalledTimes(1);
  });

  it('persists a truthful failure after retries and offers Retry Confirmation (never asks to pay again)', async () => {
    seedBookingStore({ bookings: [makeBooking('bk-fail-1', 'Reserved')] });
    seedPaymentStore({
      pendingConfirmation: seedPending('bk-fail-1', { phase: 'failed' }),
      lastBookingId: 'bk-fail-1',
    });
    confirmBookingStatusActionMock.mockResolvedValue({
      success: false,
      error: 'Network failure.',
    });

    render(<BookingPaymentPage />);

    // Payment succeeded (mock provider) but confirmation never went
    // through — retries are exhausted in the background (~4s of delays).
    await waitFor(
      () => expect(screen.getByText('Booking Confirmation Issue')).toBeTruthy(),
      { timeout: 8000 }
    );

    // Truthful state: payment received, confirmation failed, retry-only.
    expect(
      screen.getByText(/payment was received but booking confirmation failed/i)
    ).toBeTruthy();
    expect(screen.getAllByText('Retry Confirmation').length).toBeGreaterThan(0);
    expect(
      vi.mocked(toast.error).mock.calls.some(([msg]) =>
        /payment was received but booking confirmation failed/i.test(String(msg))
      )
    ).toBe(true);

    // Never asked to pay again: no second payment, no redirect away.
    const payments = usePaymentStore.getState().payments;
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('Paid');
    expect(pushMock).not.toHaveBeenCalledWith('/book');
    expect(pushMock).not.toHaveBeenCalledWith('/book/details');

    // The durable op is marked failed so a refresh can still recover it.
    const pending = usePaymentStore.getState().pendingConfirmation;
    expect(pending?.phase).toBe('failed');
    expect(pending?.lastError).toMatch(/payment was received/i);
    // 1 initial attempt + 2 retries.
    expect(confirmBookingStatusActionMock).toHaveBeenCalledTimes(3);
  }, 12000);

  it('still shows the empty state when there is genuinely nothing to recover', () => {
    render(<BookingPaymentPage />);

    expect(
      screen.getByText(/No booking in progress. Please select a court and time first./)
    ).toBeTruthy();
    expect(confirmBookingStatusActionMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalledWith('/book/details');
  });

  it('never drops a pending confirmation into the empty state when the booking is not local', async () => {
    // Storage cleared: durable op survives but no local booking record.
    seedPaymentStore({
      pendingConfirmation: seedPending('bk-vanished', { phase: 'failed' }),
      lastBookingId: 'bk-vanished',
    });

    render(<BookingPaymentPage />);

    expect(screen.queryByText(/No booking in progress/)).toBeNull();
    // Recovery reports a truthful, retryable error instead of pretending
    // nothing is in progress — and never attempts a blind confirmation.
    // (Auto-recovery is scheduled on a macrotask, so await the panel.)
    await waitFor(() => expect(screen.getByText('Booking Confirmation Issue')).toBeTruthy());
    expect(confirmBookingStatusActionMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalledWith('/book/details');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not run auto-recovery twice for the same mount (single confirmation attempt)', async () => {
    seedBookingStore({ bookings: [makeBooking('bk-once', 'Reserved')] });
    seedPaymentStore({
      pendingConfirmation: seedPending('bk-once'),
      lastBookingId: 'bk-once',
    });
    // Hang the confirmation so the flow never reaches its retry loop —
    // any second recovery attempt would show up as an extra call.
    confirmBookingStatusActionMock.mockReturnValue(
      new Promise(() => undefined)
    );

    const { rerender } = render(<BookingPaymentPage />);
    // Re-renders must not restart the recovery.
    rerender(<BookingPaymentPage />);
    rerender(<BookingPaymentPage />);

    await waitFor(() =>
      expect(confirmBookingStatusActionMock).toHaveBeenCalledTimes(1)
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(confirmBookingStatusActionMock).toHaveBeenCalledTimes(1);
  });
});
