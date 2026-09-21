'use server';

import { createNotification, createBookingNotification } from '@/services/notification.service';
import { NotificationType } from '@/types';

/**
 * Server Action: Create a notification.
 * Called from client components that need to trigger notifications
 * after server-side operations complete.
 */
export async function createNotificationAction(input: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedBookingId?: string;
}): Promise<{ success: boolean; error?: string }> {
  return createNotification(input);
}

/**
 * Server Action: Create a booking-scoped notification with deduplication.
 */
export async function createBookingNotificationAction(input: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  bookingId: string;
}): Promise<{ success: boolean; error?: string }> {
  return createBookingNotification(
    input.userId,
    input.type,
    input.title,
    input.message,
    input.bookingId
  );
}

/**
 * Server Action: Create a payment_refunded notification.
 * Called from client after mock refund succeeds.
 */
export async function createPaymentRefundedNotification(input: {
  userId: string;
  bookingId: string;
  bookingNumber: string;
  amount: number;
}): Promise<{ success: boolean; error?: string }> {
  return createBookingNotification(
    input.userId,
    'payment_refunded',
    'Payment Refunded',
    `EGP ${input.amount} refund processed for booking ${input.bookingNumber}.`,
    input.bookingId
  );
}
