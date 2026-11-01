/**
 * BOOKING namespace — /book wizard (4 steps), summary, payment, confirmation,
 * time slot grid, day selector, countdown, live availability.
 * Keep the `en` object and the shape of `ar` identical.
 */
const en = {
  seed: 'Replace this file with the full booking dictionary',
};

export type BookingDict = typeof en;

const ar: BookingDict = {
  seed: 'استبدل هذا الملف بقاموس الحجز الكامل',
};

export const booking = { en, ar };
