/**
 * Shared constants for admin manual notification sends.
 *
 * These live outside the 'use server' actions module because Server Action
 * files may only export async functions — non-function value exports break
 * `next build`. The DB CHECK constraint on notifications.type whitelists every
 * value in ADMIN_SEND_TYPES, so inserts can never fail on type.
 */

export const ADMIN_SEND_MAX_RECIPIENTS = 50;

/** Types an admin may send manually via the compose drawer. */
export const ADMIN_SEND_TYPES = ['info', 'promo_offer', 'booking_reminder', 'court_full'] as const;

export type AdminSendType = (typeof ADMIN_SEND_TYPES)[number];
