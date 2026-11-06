/**
 * @file checkout-payment-flow.test.tsx
 *
 * Focused tests for Checkout Infinite Auto-Processing Fix:
 * 1. Opening checkout does not automatically activate the processing state.
 * 2. The payment button starts processing only after an intentional click.
 * 3. Successful payment follows the existing success flow.
 * 4. Failed payment exits the loading state and allows a legitimate retry.
 * 5. Duplicate clicks do not create duplicate payment operations.
 * 6. Resuming an in-flight confirmation with attempts > 0 still automatically recovers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ fill, priority, ...props }: any) => <img {...props} />,
}));

// Mock server actions
const createBookingActionMock = vi.fn();
const confirmBookingStatusActionMock = vi.fn();
const getBookingStatusActionMock = vi.fn();

vi.mock('@/app/actions/booking.actions', () => ({
  createBookingAction: (...args: unknown[]) => createBookingActionMock(...args),
  cancelBookingAction: vi.fn(),
  confirmBookingStatusAction: (...args: unknown[]) => confirmBookingStatusActionMock(...args),
  expireStaleBookingsAction: vi.fn(),
  getBookingStatusAction: (...args: unknown[]) => getBookingStatusActionMock(...args),
}));

import BookingPaymentPage from '@/app/book/payment/page';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useBookingStore } from '@/features/booking/useBookingStore';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { clearPayments } from '@/services/payment.service';
import type { Court, TimeSlot, Booking } from '@/types';

const pushMock = vi.fn();

const TEST_COURT: Court = {
  id: 'court-chk-1',
  name: 'Center Padel Court',
  sportType: 'Padel',
  surface: 'Turf',
  isIndoor: true,
  capacity: 4,
  pricePerHour: 400,
  rating: 4.9,
  reviewCount: 15,
  image: '/images/courts/padel-1.jpg',
  gallery: [],
  description: 'Padel court',
  features: ['Lighting'],
  rules: [],
  status: 'Available',
  workingHours: { open: '08:00', close: '23:00' },
  slotDurationMinutes: 60,
};

const TEST_SLOT: TimeSlot = {
  id: 'slot-court-chk-1-2026-11-10-18:00',
  courtId: 'court-chk-1',
  date: '2026-11-10',
  startTime: '18:00',
  endTime: '19:00',
  price: 400,
  status: 'Available',
};

function makeBooking(id: string, status: 'Reserved' | 'Confirmed'): Booking {
  return {
    id,
    bookingNumber: `KH-${id}`,
    courtId: 'court-chk-1',
    courtName: 'Center Padel Court',
    courtImage: '/images/courts/padel-1.jpg',
    sportType: 'Padel',
    date: '2026-11-10',
    startTime: '18:00',
    endTime: '19:00',
    durationMinutes: 60,
    totalPrice: 400,
    status,
    bookingSource: 'ONLINE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'user-chk-1',
    userName: 'Jane Doe',
    userEmail: 'jane@example.com',
    userPhone: '+201000000000',
    selectedSlotIds: ['slot-court-chk-1-2026-11-10-18:00'],
  };
}

describe('Checkout Payment Flow — Button State & Confirmation Controls', () => {
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
    } as any);

    const initialBooking = makeBooking('bk-normal-1', 'Reserved');

    // Fresh checkout state as left by Step 2 & Step 3:
    // User selected court & slot, filled in details, and hold was created.
    // attempts === 0 and paymentId === null
    useBookingStore.setState({
      selectedCourt: TEST_COURT,
      selectedDate: '2026-11-10',
      selectedSlots: [TEST_SLOT],
      bookingStep: 4,
      userName: 'Jane Doe',
      userEmail: 'jane@example.com',
      userPhone: '+201000000000',
      bookings: [initialBooking],
      isCancelling: false,
      _hasHydrated: true,
    });

    usePaymentStore.setState({
      payments: [],
      lastIdempotencyKey: null,
      pendingConfirmation: {
        bookingId: 'bk-normal-1',
        paymentId: null,
        phase: 'confirming',
        attempts: 0,
        lastError: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      lastBookingId: 'bk-normal-1',
      _hasHydrated: true,
    });

    confirmBookingStatusActionMock.mockResolvedValue({
      success: true,
      booking: makeBooking('bk-normal-1', 'Confirmed'),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('1. Opening checkout does NOT automatically activate the processing state', async () => {
    render(<BookingPaymentPage />);

    // 1. Payment button must be in normal idle state
    const payButton = screen.getByRole('button', { name: /confirm & pay/i });
    expect(payButton).toBeTruthy();
    expect(payButton.hasAttribute('disabled')).toBe(false);

    // 2. Loading state "Processing..." must NOT be present
    expect(screen.queryByText(/Processing\.\.\./i)).toBeNull();

    // 3. Auto-recovery banner must NOT show for fresh un-submitted checkout
    expect(screen.queryByText(/Finishing your booking — resuming where you left off/i)).toBeNull();

    // 4. Server confirmation action must NOT have been called automatically
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(confirmBookingStatusActionMock).not.toHaveBeenCalled();
    expect(payButton.hasAttribute('disabled')).toBe(false);
  });

  it('2. The payment button starts processing only after an intentional click', async () => {
    // Hold confirmation promise to inspect in-flight loading state
    let resolveConfirmation!: (val: any) => void;
    confirmBookingStatusActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveConfirmation = resolve;
      })
    );

    render(<BookingPaymentPage />);

    const payButton = screen.getByRole('button', { name: /confirm & pay/i });
    expect(screen.queryByText(/Processing\.\.\./i)).toBeNull();

    // User intentionally clicks payment button
    fireEvent.click(payButton);

    // Button should now transition to processing state
    expect(screen.getByText(/Processing\.\.\./i)).toBeTruthy();
    expect(payButton.hasAttribute('disabled')).toBe(true);

    // Resolve the confirmation
    resolveConfirmation({
      success: true,
      booking: makeBooking('bk-normal-1', 'Confirmed'),
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/book/confirmation');
    });
  });

  it('3. Successful payment follows the existing success flow', async () => {
    confirmBookingStatusActionMock.mockResolvedValue({
      success: true,
      booking: makeBooking('bk-normal-1', 'Confirmed'),
    });

    render(<BookingPaymentPage />);

    const payButton = screen.getByRole('button', { name: /confirm & pay/i });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(confirmBookingStatusActionMock).toHaveBeenCalledWith('bk-normal-1');
      expect(pushMock).toHaveBeenCalledWith('/book/confirmation');
    });

    // Payment in store marked Paid
    const payments = usePaymentStore.getState().payments;
    expect(payments.length).toBeGreaterThan(0);
    expect(payments[0].status).toBe('Paid');

    // Selection cleared upon confirmation
    expect(useBookingStore.getState().selectedSlots).toHaveLength(0);
  });

  it('4. Failed payment exits the loading state and allows a legitimate retry', async () => {
    confirmBookingStatusActionMock.mockResolvedValue({
      success: false,
      error: 'Network connection dropped.',
    });

    render(<BookingPaymentPage />);

    const payButton = screen.getByRole('button', { name: /confirm & pay/i });
    fireEvent.click(payButton);

    // Retries run, then fail
    await waitFor(
      () => {
        expect(screen.getByText('Booking Confirmation Issue')).toBeTruthy();
      },
      { timeout: 8000 }
    );

    // Loading state MUST be dismissed
    expect(screen.queryByText(/Processing\.\.\./i)).toBeNull();

    // Retry affordance is active and clickable
    const retryButtons = screen.getAllByRole('button', { name: /retry confirmation/i });
    expect(retryButtons.length).toBeGreaterThan(0);
    expect(retryButtons[0].hasAttribute('disabled')).toBe(false);
  });

  it('5. Duplicate clicks do not create duplicate payment operations', async () => {
    let callCount = 0;
    confirmBookingStatusActionMock.mockImplementation(() => {
      callCount++;
      return new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100));
    });

    render(<BookingPaymentPage />);

    const payButton = screen.getByRole('button', { name: /confirm & pay/i });

    // Rapid double-click
    fireEvent.click(payButton);
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/book/confirmation');
    });

    // Only 1 confirmation call was initiated
    expect(callCount).toBe(1);
  });

  it('6. Resuming an in-flight confirmation with attempts > 0 automatically recovers', async () => {
    // Seed in-flight confirmation from interrupted attempt
    usePaymentStore.setState({
      pendingConfirmation: {
        bookingId: 'bk-recover-99',
        paymentId: 'pay-interrupted-1',
        phase: 'confirming',
        attempts: 1,
        lastError: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      lastBookingId: 'bk-recover-99',
    });

    useBookingStore.setState({
      bookings: [makeBooking('bk-recover-99', 'Reserved')],
    });

    confirmBookingStatusActionMock.mockResolvedValue({
      success: true,
      booking: makeBooking('bk-recover-99', 'Confirmed'),
    });

    render(<BookingPaymentPage />);

    // In-flight recovery runs automatically as designed
    await waitFor(() => {
      expect(confirmBookingStatusActionMock).toHaveBeenCalledWith('bk-recover-99');
      expect(pushMock).toHaveBeenCalledWith('/book/confirmation');
    });
  });

  it('7. A fresh booking with no previous payment attempt NEVER triggers auto-confirmation even if selectedSlots is cleared', async () => {
    // User has a fresh booking in pendingConfirmation (attempts === 0, paymentId === null),
    // but selectedSlots was cleared/empty during navigation (hasSelection === false)
    useBookingStore.setState({
      selectedCourt: TEST_COURT,
      selectedDate: '2026-11-10',
      selectedSlots: [], // Cleared selection!
      bookings: [makeBooking('bk-normal-1', 'Reserved')],
    });

    usePaymentStore.setState({
      pendingConfirmation: {
        bookingId: 'bk-normal-1',
        paymentId: null,
        phase: 'confirming',
        attempts: 0,
        lastError: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    render(<BookingPaymentPage />);

    // Wait a tick to ensure no deferred auto-recovery timer executes
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Must NOT call confirmation action automatically!
    expect(confirmBookingStatusActionMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Processing\.\.\./i)).toBeNull();
  });
});
