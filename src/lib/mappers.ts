/**
 * Data Mapping Boundary Layer.
 * Bridges raw PostgreSQL database rows (snake_case) and application domain interfaces (camelCase).
 *
 * Keeps UI components and business services decoupled from database naming conventions.
 */

import {
  DbProfile,
  DbCourt,
  DbBlockedPeriod,
  DbBooking,
  DbPayment,
  DbNotification,
  DbSponsorshipRequest,
  DbAdvertisingSpace,
  DbAdvertisementRequest,
  DbEvent,
  DbFAQ,
  DbTestimonial,
} from '@/types/database.types';

import {
  User,
  Court,
  BlockedPeriod,
  Booking,
  Payment,
  Notification,
  SponsorshipRequest,
  AdvertisingSpace,
  AdvertisementRequest,
  EventItem,
  FAQItem,
  Testimonial,
} from '@/types';
import { FALLBACK_COURT_IMAGE } from '@/services/court.service';
import { resolveEventImage } from '@/lib/sport-images';

/**
 * Helper to add days to a YYYY-MM-DD date string.
 */
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d + days));
  return dateObj.toISOString().split('T')[0];
}

/**
 * Matches wall-clock timestamp digits inside a stored tstzrange string,
 * e.g. `2026-08-25 10:00:00+00` or `2026-08-25T10:00:00+00:00`.
 * Captures: YYYY-MM-DD, HH:mm (seconds and UTC offset ignored).
 */
const TSTZRANGE_TS_RE = /(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?(?:Z|[+-]\d{2}(?::?\d{2})?)?/g;

interface RangeBounds {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

/**
 * Extracts the raw wall-clock bounds of a tstzrange string.
 * Returns null when fewer than two timestamps are found.
 * Deliberately avoids `Date` parsing (host-timezone dependent).
 */
function matchRangeBounds(range: string): RangeBounds | null {
  const matches = [...range.matchAll(TSTZRANGE_TS_RE)];
  if (matches.length < 2) return null;
  return {
    startDate: matches[0][1],
    startTime: matches[0][2],
    endDate: matches[1][1],
    endTime: matches[1][2],
  };
}

/**
 * Extracts the RAW wall-clock start of a stored tstzrange, with no
 * session-date reconstruction. Use for comparisons against the stored
 * range (e.g. the cancellation window). Returns null if unparseable.
 */
export function parseTstzrangeStart(range: string): { date: string; time: string } | null {
  const bounds = matchRangeBounds(range);
  if (!bounds) return null;
  return { date: bounds.startDate, time: bounds.startTime };
}

/**
 * Parses a PostgreSQL TSTZRANGE string, e.g. '["2026-08-25 10:00:00+00","2026-08-25 11:00:00+00")'
 * into date, startTime, and endTime strings.
 *
 * The stored digits ARE Cairo wall-clock time despite the +00 annotation
 * (formatTstzrange writes Cairo time with +00) — they are extracted
 * verbatim, never round-tripped through Date/toISOString.
 *
 * For post-midnight slots (e.g. 01:00 AM on the day after the booking date),
 * reconstructs the original user-selected booking date (operating session date).
 */
export function parseTstzrange(range: string): { date: string; startTime: string; endTime: string } {
  const bounds = matchRangeBounds(range);
  if (!bounds) {
    return { date: '', startTime: '00:00', endTime: '00:00' };
  }

  let dateStr = bounds.startDate;
  const [startH] = bounds.startTime.split(':').map(Number);
  // If start time is after midnight (00:00 - 05:59), the booking session date was yesterday
  if (startH < 6) {
    dateStr = addDaysToDateStr(dateStr, -1);
  }

  return { date: dateStr, startTime: bounds.startTime, endTime: bounds.endTime };
}

/**
 * Formats date, startTime, and endTime into a valid PostgreSQL TSTZRANGE string.
 *
 * Handles midnight crossover seamlessly:
 * - If startTime is in early morning (< 06:00), it belongs to the post-midnight session of date + 1 day.
 * - If endTime <= startTime (e.g. 23:00 to 01:00), the range spans across midnight into date + 1 day.
 */
export function formatTstzrange(date: string, startTime: string, endTime: string): string {
  const [startH] = startTime.split(':').map(Number);
  const [endH] = endTime.split(':').map(Number);

  let startDateStr = date;
  // Post-midnight start time (e.g., 01:00 for an operating session starting on `date`)
  if (startH < 6) {
    startDateStr = addDaysToDateStr(date, 1);
  }

  let endDateStr = startDateStr;
  // Midnight crossover range (e.g., 23:00 to 01:00 or 23:00 to 00:00)
  if (endH < startH || (endH === startH && endTime <= startTime)) {
    endDateStr = addDaysToDateStr(startDateStr, 1);
  }

  return `[${startDateStr} ${startTime}:00+00, ${endDateStr} ${endTime}:00+00)`;
}

// ── Profile ↔ User ─────────────────────────────

export function mapDbProfileToUser(profile: DbProfile): User {
  return {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    phone: profile.phone_number ?? '',
    avatar: profile.avatar_url ?? undefined,
    role: profile.role,
    createdAt: profile.created_at,
  };
}

export function mapUserToDbProfile(user: User): Partial<DbProfile> {
  return {
    id: user.id,
    full_name: user.name,
    email: user.email,
    phone_number: user.phone || null,
    avatar_url: user.avatar || null,
    role: user.role,
  };
}

// ── Court ↔ DbCourt ────────────────────────────

export function mapDbCourtToCourt(db: DbCourt): Court {
  return {
    id: db.id,
    name: db.name,
    sportType: db.sport_type,
    surface: db.surface,
    isIndoor: db.is_indoor,
    capacity: db.capacity,
    pricePerHour: Number(db.price_per_hour),
    rating: Number(db.rating ?? 5.0),
    reviewCount: db.review_count ?? 0,
    image: db.image_url,
    gallery: db.gallery_urls ?? [],
    description: db.description ?? '',
    features: db.features ?? [],
    rules: db.rules ?? [],
    status: db.status,
    workingHours: {
      open: db.working_hours_open.substring(0, 5),
      close: db.working_hours_close.substring(0, 5),
    },
    slotDurationMinutes: db.slot_duration_minutes,
    deletedAt: db.deleted_at ?? undefined,
  };
}

export function mapCourtToDbCourt(court: Court): Omit<DbCourt, 'created_at' | 'updated_at' | 'deleted_at'> {
  return {
    id: court.id,
    name: court.name,
    sport_type: court.sportType,
    surface: court.surface,
    is_indoor: court.isIndoor,
    capacity: court.capacity,
    price_per_hour: court.pricePerHour,
    rating: court.rating,
    review_count: court.reviewCount,
    image_url: court.image,
    gallery_urls: court.gallery,
    description: court.description || null,
    features: court.features,
    rules: court.rules,
    status: court.status,
    working_hours_open: `${court.workingHours.open}:00`,
    working_hours_close: `${court.workingHours.close}:00`,
    slot_duration_minutes: court.slotDurationMinutes || 60,
  };
}

// ── BlockedPeriod ↔ DbBlockedPeriod ────────────

export function mapDbBlockedPeriodToBlockedPeriod(db: DbBlockedPeriod): BlockedPeriod {
  const { date, startTime, endTime } = parseTstzrange(db.blocked_range);
  return {
    id: db.id,
    courtId: db.court_id,
    date,
    startTime,
    endTime,
    reason: db.reason,
    createdAt: db.created_at,
  };
}

// ── Booking ↔ DbBooking ────────────────────────

export function mapDbBookingToBooking(db: DbBooking, courtInfo?: { name: string; image: string; sportType: Court['sportType'] }): Booking {
  const { date, startTime, endTime } = parseTstzrange(db.booking_range);

  return {
    id: db.id,
    bookingNumber: db.booking_number,
    courtId: db.court_id,
    courtName: courtInfo?.name ?? 'Court',
    courtImage: courtInfo?.image ?? FALLBACK_COURT_IMAGE,
    sportType: courtInfo?.sportType ?? 'Padel',
    date,
    startTime,
    endTime,
    durationMinutes: db.duration_minutes,
    totalPrice: Number(db.total_price),
    status: db.status,
    bookingSource: db.booking_source,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    userId: db.user_id,
    userName: db.user_name,
    userEmail: db.user_email,
    userPhone: db.user_phone,
    selectedSlotIds: [],
  };
}

export function mapBookingToDbBooking(booking: Booking): Omit<DbBooking, 'created_at' | 'updated_at' | 'cancelled_at' | 'cancellation_reason'> {
  return {
    id: booking.id,
    booking_number: booking.bookingNumber,
    user_id: booking.userId,
    court_id: booking.courtId,
    booking_range: formatTstzrange(booking.date, booking.startTime, booking.endTime),
    duration_minutes: booking.durationMinutes,
    total_price: booking.totalPrice,
    status: booking.status,
    booking_source: booking.bookingSource,
    user_name: booking.userName,
    user_email: booking.userEmail,
    user_phone: booking.userPhone,
  };
}

// ── Payment ↔ DbPayment ────────────────────────

export function mapDbPaymentToPayment(db: DbPayment): Payment {
  return {
    paymentId: db.id,
    bookingId: db.booking_id,
    amount: db.amount,
    currency: db.currency as Payment['currency'],
    status: db.status,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    idempotencyKey: db.idempotency_key,
    failureReason: db.failure_reason ?? undefined,
    refundedAt: db.refunded_at ?? undefined,
    refundReason: db.refund_reason ?? undefined,
    refundedAmount: db.refunded_amount ?? undefined,
  };
}

export function mapPaymentToDbPayment(payment: Payment): Omit<DbPayment, 'created_at' | 'updated_at'> {
  return {
    id: payment.paymentId,
    booking_id: payment.bookingId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    payment_method: null,
    idempotency_key: payment.idempotencyKey,
    transaction_reference: null,
    failure_reason: payment.failureReason || null,
    refunded_at: payment.refundedAt || null,
    refund_reason: payment.refundReason || null,
    refunded_amount: payment.refundedAmount || null,
  };
}

// ── Notification ↔ DbNotification ──────────────

export function mapDbNotificationToNotification(db: DbNotification): Notification {
  return {
    id: db.id,
    userId: db.user_id,
    type: db.type as Notification['type'],
    title: db.title,
    message: db.message,
    isRead: db.is_read,
    relatedBookingId: db.related_booking_id ?? undefined,
    createdAt: db.created_at,
  };
}

export function mapNotificationToDbNotification(n: Notification): Omit<DbNotification, 'id' | 'created_at'> {
  return {
    user_id: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    is_read: n.isRead,
    related_booking_id: n.relatedBookingId ?? null,
    dedupe_key: null,
  };
}

// ── Sponsorship Request ↔ DbSponsorshipRequest ─

export function mapDbSponsorshipRequestToDomain(db: DbSponsorshipRequest): SponsorshipRequest {
  return {
    id: db.id,
    companyName: db.company_name,
    contactName: db.contact_name,
    email: db.email,
    phone: db.phone,
    targetType: db.target_type,
    targetId: db.target_id,
    proposedAmount: Number(db.proposed_amount),
    currency: db.currency,
    pricingType: db.pricing_type,
    requestedBenefits: db.requested_benefits ?? [],
    requestedPlacement: db.requested_placement ?? [],
    approvedBenefits: db.approved_benefits ?? [],
    message: db.message ?? undefined,
    status: db.status,
    isActive: db.is_active,
    startDate: db.start_date ?? undefined,
    endDate: db.end_date ?? undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

// ── Advertisement Space & Request Mappers ─────

export function mapDbAdvertisingSpaceToDomain(db: DbAdvertisingSpace): AdvertisingSpace {
  return {
    id: db.id,
    name: db.name,
    location: db.location,
    dimensions: db.dimensions,
    basePrice: Number(db.base_price),
    billingPeriod: db.billing_period as AdvertisingSpace['billingPeriod'],
    isAvailable: db.is_available,
    description: db.description ?? undefined,
  };
}

export function mapDbAdvertisementRequestToDomain(db: DbAdvertisementRequest): AdvertisementRequest {
  let startDate = '';
  let endDate = '';

  try {
    const cleaned = db.date_range.replace(/[\[\)"']/g, '');
    const parts = cleaned.split(',');
    startDate = parts[0] ?? '';
    endDate = parts[1] ?? '';
  } catch {
    // fallback
  }

  return {
    id: db.id,
    companyName: db.company_name,
    contactName: db.contact_name,
    email: db.email,
    phone: db.phone,
    advertisingSpaceId: db.advertising_space_id,
    startDate,
    endDate,
    proposedBudget: Number(db.proposed_budget),
    bannerReference: db.banner_reference ?? undefined,
    notes: db.notes ?? undefined,
    status: db.status,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

// ── Event ↔ DbEvent ───────────────────────────

export function mapDbEventToEvent(db: DbEvent): EventItem {
  return {
    id: db.id,
    title: db.title,
    description: db.description ?? '',
    // Never empty: events without a usable image_url (e.g. null in the DB)
    // previously produced <Image src=""> runtime errors. Resolves to an
    // allowed remote image or a sport-appropriate local asset.
    image: resolveEventImage(db.image_url, db.sport_type, db.title),
    date: db.event_date,
    time: db.start_time && db.end_time
      ? `${db.start_time} - ${db.end_time}`
      : db.start_time ?? '',
    location: db.location ?? '',
    sportType: db.sport_type,
    maxParticipants: db.max_participants ?? 0,
    currentParticipants: db.current_participants ?? 0,
    entryFee: Number(db.entry_fee ?? 0),
    organizer: db.organizer ?? '',
    registeredUsers: [],
  };
}

// ── FAQ ↔ DbFAQ ───────────────────────────────

export function mapDbFaqToFaq(db: DbFAQ): FAQItem {
  return {
    id: db.id,
    category: db.category as FAQItem['category'],
    question: db.question,
    answer: db.answer,
  };
}

// ── Testimonial ↔ DbTestimonial ───────────────

export function mapDbTestimonialToTestimonial(db: DbTestimonial): Testimonial {
  return {
    id: db.id,
    name: db.name,
    role: db.role,
    avatar: db.avatar_url ?? '',
    rating: db.rating,
    comment: db.comment,
    date: '',
  };
}
