import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createNotificationAction,
  createBookingNotificationAction,
  createPaymentRefundedNotification,
} from './notification.actions';

// Mock notification.service
const mockCreateNotification = vi.fn();
const mockCreateBookingNotification = vi.fn();

vi.mock('@/services/notification.service', () => ({
  createNotification: (...args: any[]) => mockCreateNotification(...args),
  createBookingNotification: (...args: any[]) => mockCreateBookingNotification(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateNotification.mockResolvedValue({ success: true, id: 'notif-1' });
  mockCreateBookingNotification.mockResolvedValue({ success: true, id: 'notif-2' });
});

describe('createNotificationAction', () => {
  it('delegates to createNotification service', async () => {
    const input = {
      userId: 'user-1',
      type: 'new_booking' as const,
      title: 'Test',
      message: 'Test message',
    };

    const result = await createNotificationAction(input);

    expect(result.success).toBe(true);
    expect(mockCreateNotification).toHaveBeenCalledWith(input);
  });

  it('passes relatedBookingId when provided', async () => {
    const input = {
      userId: 'user-1',
      type: 'booking_confirmed' as const,
      title: 'Confirmed',
      message: 'Booking confirmed',
      relatedBookingId: 'booking-123',
    };

    await createNotificationAction(input);

    expect(mockCreateNotification).toHaveBeenCalledWith(input);
  });

  it('propagates service failure', async () => {
    mockCreateNotification.mockResolvedValue({ success: false, error: 'DB error' });

    const result = await createNotificationAction({
      userId: 'user-1',
      type: 'new_booking',
      title: 'T',
      message: 'M',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB error');
  });
});

describe('createBookingNotificationAction', () => {
  it('delegates to createBookingNotification service', async () => {
    const result = await createBookingNotificationAction({
      userId: 'user-1',
      type: 'booking_confirmed',
      title: 'Confirmed',
      message: 'Booking confirmed',
      bookingId: 'booking-456',
    });

    expect(result.success).toBe(true);
    expect(mockCreateBookingNotification).toHaveBeenCalledWith(
      'user-1',
      'booking_confirmed',
      'Confirmed',
      'Booking confirmed',
      'booking-456'
    );
  });

  it('propagates service failure', async () => {
    mockCreateBookingNotification.mockResolvedValue({ success: false, error: 'Insert failed' });

    const result = await createBookingNotificationAction({
      userId: 'user-1',
      type: 'booking_confirmed',
      title: 'T',
      message: 'M',
      bookingId: 'booking-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Insert failed');
  });
});

describe('createPaymentRefundedNotification', () => {
  it('delegates to createBookingNotification with correct args', async () => {
    const result = await createPaymentRefundedNotification({
      userId: 'user-1',
      bookingId: 'booking-789',
      bookingNumber: 'KH-123456',
      amount: 5000,
    });

    expect(result.success).toBe(true);
    expect(mockCreateBookingNotification).toHaveBeenCalledWith(
      'user-1',
      'payment_refunded',
      'Payment Refunded',
      'EGP 5000 refund processed for booking KH-123456.',
      'booking-789'
    );
  });

  it('propagates service failure', async () => {
    mockCreateBookingNotification.mockResolvedValue({ success: false, error: 'Timeout' });

    const result = await createPaymentRefundedNotification({
      userId: 'user-1',
      bookingId: 'booking-1',
      bookingNumber: 'KH-000',
      amount: 100,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Timeout');
  });
});
