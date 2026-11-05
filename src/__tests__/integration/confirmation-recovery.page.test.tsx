/**
 * Confirmation page — durable recovery after refresh / redirect.
 *
 * Regression coverage for the production bug where a successful payment was
 * followed by a lost booking context: the confirmation page bounced the user
 * to /book ("No booking in progress") instead of recovering the booking from
 * the server via its durable id.
 *
 * Covered here:
 *  1. Recovers the booking from the server when the local store is empty
 *     (durable id from the payment store) — exactly one fetch, no /book bounce
 *  2. A recovered `Reserved` booking offers "Complete Payment" (never dead-ends)
 *  3. Recovery failure shows truth + "Try Again" — no redirect, no fake success
 *  4. Truly nothing to show → redirect to /book (unchanged behaviour)
 *  5. Re-renders do not refetch / re-recover (single attempt per id)
 *  6. "Try Again" performs a REAL refetch (the old state-reset-only retry
 *     could never re-run the effect because its deps were unchanged)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// next/image is not mocked globally — provide a minimal local stand-in.
vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

// ── Server actions used by the recovery path ──
const getBookingStatusActionMock = vi.fn();

vi.mock('@/app/actions/booking.actions', () => ({
  createBookingAction: vi.fn(),
  cancelBookingAction: vi.fn(),
  confirmBookingStatusAction: vi.fn(),
  expireStaleBookingsAction: vi.fn(),
  getBookingStatusAction: (...args: unknown[]) =>
    getBookingStatusActionMock(...args),
}));

import BookingConfirmationPage from '@/app/book/confirmation/page';
import { useRouter } from 'next/navigation';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import type { PendingConfirmation } from '@/features/payment/usePaymentStore';
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

function seedStores({
  bookings = [] as Booking[],
  pendingConfirmation = null as PendingConfirmation | null,
  lastBookingId = null as string | null,
} = {}) {
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
    bookings,
    isCancelling: false,
    _hasHydrated: true,
  });
  usePaymentStore.setState({
    payments: [],
    lastIdempotencyKey: null,
    pendingConfirmation,
    lastBookingId,
    _hasHydrated: true,
  });
}

describe('Confirmation page — durable recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({
      push: pushMock,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as ReturnType<typeof useRouter>);
    seedStores();
    getBookingStatusActionMock.mockResolvedValue({ success: false });
  });

  it('recovers the booking from the server when the local store is empty — one fetch, no /book bounce', async () => {
    // Refresh wiped the booking store; only the durable id survives.
    seedStores({ lastBookingId: 'bk-recover-1' });
    getBookingStatusActionMock.mockResolvedValue({
      success: true,
      booking: makeBooking('bk-recover-1', 'Confirmed'),
    });

    render(<BookingConfirmationPage />);

    await waitFor(() =>
      expect(screen.getByText('Booking Confirmed!')).toBeTruthy()
    );

    // Recovered exactly once, by its durable id.
    expect(getBookingStatusActionMock).toHaveBeenCalledTimes(1);
    expect(getBookingStatusActionMock).toHaveBeenCalledWith('bk-recover-1');
    // The old bug bounced to /book ("No booking in progress").
    expect(pushMock).not.toHaveBeenCalledWith('/book');
    // The recovered booking landed in the local store for later renders.
    expect(useBookingStore.getState().bookings).toHaveLength(1);
    expect(useBookingStore.getState().bookings[0].id).toBe('bk-recover-1');
    expect(useBookingStore.getState().bookings[0].status).toBe('Confirmed');
  });

  it('offers "Complete Payment" for a recovered Reserved booking (never dead-ends)', async () => {
    seedStores({ lastBookingId: 'bk-reserved-1' });
    getBookingStatusActionMock.mockResolvedValue({
      success: true,
      booking: makeBooking('bk-reserved-1', 'Reserved'),
    });

    render(<BookingConfirmationPage />);

    await waitFor(() =>
      expect(screen.getByText('Payment not completed')).toBeTruthy()
    );
    expect(screen.getByText('Complete Payment')).toBeTruthy();
    expect(screen.getByText(/reservation is still pending payment/i)).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalledWith('/book');
  });

  it('shows truth + "Try Again" when recovery fails — no redirect, no fake success', async () => {
    seedStores({ lastBookingId: 'bk-broken' });
    getBookingStatusActionMock.mockResolvedValue({
      success: false,
      error: 'Unable to reach the server.',
    });

    render(<BookingConfirmationPage />);

    await waitFor(() =>
      expect(screen.getByText('Try Again')).toBeTruthy()
    );

    // Truthful error surfaced instead of bouncing or faking a success.
    expect(screen.getByText('Unable to reach the server.')).toBeTruthy();
    expect(screen.queryByText('Booking Confirmed!')).toBeNull();
    expect(pushMock).not.toHaveBeenCalledWith('/book');
    // Never silently retried into a loop either.
    expect(getBookingStatusActionMock).toHaveBeenCalledTimes(1);
  });

  it('redirects to /book only when there is genuinely nothing to recover', async () => {
    // Hydrated, empty store, no durable id — same as a direct visit.
    seedStores();

    render(<BookingConfirmationPage />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/book'));
    expect(getBookingStatusActionMock).not.toHaveBeenCalled();
  });

  it('does not refetch or re-recover on re-renders (single attempt per id)', async () => {
    seedStores({ lastBookingId: 'bk-once' });
    // Hang the fetch so the page stays in its recovery state.
    getBookingStatusActionMock.mockReturnValue(new Promise(() => undefined));

    const { rerender } = render(<BookingConfirmationPage />);
    rerender(<BookingConfirmationPage />);
    rerender(<BookingConfirmationPage />);

    await waitFor(() =>
      expect(getBookingStatusActionMock).toHaveBeenCalledTimes(1)
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getBookingStatusActionMock).toHaveBeenCalledTimes(1);
    // Still recovering — never bounced away mid-recovery.
    expect(pushMock).not.toHaveBeenCalledWith('/book');
  });

  it('"Try Again" performs a real refetch and recovers after a transient failure', async () => {
    seedStores({ lastBookingId: 'bk-retry' });
    // First attempt fails (e.g. network hiccup right after payment).
    getBookingStatusActionMock.mockResolvedValueOnce({
      success: false,
      error: 'Unable to reach the server.',
    });

    render(<BookingConfirmationPage />);

    await waitFor(() => expect(screen.getByText('Try Again')).toBeTruthy());
    expect(getBookingStatusActionMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalledWith('/book');

    // Server is reachable again on retry.
    getBookingStatusActionMock.mockResolvedValue({
      success: true,
      booking: makeBooking('bk-retry', 'Confirmed'),
    });

    fireEvent.click(screen.getByText('Try Again'));

    // A REAL refetch happens (regression: the old retry only reset local
    // state, so the effect never re-ran and the user was stuck forever).
    await waitFor(() =>
      expect(screen.getByText('Booking Confirmed!')).toBeTruthy()
    );
    expect(getBookingStatusActionMock).toHaveBeenCalledTimes(2);
    expect(getBookingStatusActionMock).toHaveBeenLastCalledWith('bk-retry');
    // Never bounced to /book while a durable id exists.
    expect(pushMock).not.toHaveBeenCalledWith('/book');
    expect(useBookingStore.getState().bookings).toHaveLength(1);
    expect(useBookingStore.getState().bookings[0].id).toBe('bk-retry');
  });

  it('a failed "Try Again" stays truthful — no redirect, no fake success', async () => {
    seedStores({ lastBookingId: 'bk-retry-2' });
    getBookingStatusActionMock.mockResolvedValue({
      success: false,
      error: 'Temporary outage.',
    });

    render(<BookingConfirmationPage />);

    await waitFor(() => expect(screen.getByText('Try Again')).toBeTruthy());
    expect(getBookingStatusActionMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Try Again'));

    await waitFor(() =>
      expect(getBookingStatusActionMock).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => expect(screen.getByText('Temporary outage.')).toBeTruthy());
    expect(screen.queryByText('Booking Confirmed!')).toBeNull();
    expect(pushMock).not.toHaveBeenCalledWith('/book');
    // Retry affordance remains available for the next attempt.
    expect(screen.getByText('Try Again')).toBeTruthy();
  });
});
