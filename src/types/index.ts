export type SportType = 'Football' | 'Tennis' | 'Padel';

export type CourtStatus = 'Available' | 'Booked' | 'Starts Soon' | 'Maintenance';

/**
 * Display state of a time slot on the schedule grid.
 * Used by TimeSlot.status — what the UI shows.
 */
export type SlotStatus = 'Available' | 'Booked' | 'Reserved' | 'Blocked' | 'Past';

/**
 * Lifecycle state of a booking record.
 * Used by Booking.status — what happened to the reservation.
 */
export type BookingStatus = 'Reserved' | 'Confirmed' | 'Expired' | 'Cancelled';

/**
 * Origin of a booking record.
 * All sources are treated equally by the availability engine.
 */
export type BookingSource = 'ONLINE' | 'WALK_IN' | 'ADMIN';

// ── Payment Domain ──

/**
 * Lifecycle state of a payment record.
 * Enforced by the Payment Service state machine — Components must never set these directly.
 */
export type PaymentStatus = 'Pending' | 'Paid' | 'Failed' | 'Cancelled' | 'Refunded';

/**
 * Currency code (ISO 4217). Amount stored as integer in smallest unit.
 * EGP → piastres (1 EGP = 100 piastres). All existing prices are whole EGP,
 * so amount = pricePerHour × durationHours × 100.
 */
export type PaymentCurrency = 'EGP';

export interface Payment {
  paymentId: string;
  bookingId: string;
  /** Amount in smallest currency unit (piastres for EGP) */
  amount: number;
  currency: PaymentCurrency;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  /** Present only when status is 'Failed' */
  failureReason?: string;
  /** Present only when status is 'Refunded' */
  refundedAt?: string;
  refundReason?: string;
  refundedAmount?: number;
}

export interface PaymentResult {
  success: boolean;
  payment?: Payment;
  error?: string;
}

export interface RefundResult {
  success: boolean;
  payment?: Payment;
  error?: string;
}

/**
 * Working hours for a court.
 * If close < open, the court operates past midnight (e.g. open "09:00", close "02:00").
 * Times are in HH:mm format in Africa/Cairo timezone.
 */
export interface WorkingHours {
  open: string;  // HH:mm
  close: string; // HH:mm
}

export interface Court {
  id: string;
  name: string;
  sportType: SportType;
  surface: string;
  isIndoor: boolean;
  capacity: number;
  pricePerHour: number;
  rating: number;
  reviewCount: number;
  image: string;
  gallery: string[];
  description: string;
  features: string[];
  rules: string[];
  status: CourtStatus;
  /** Court-specific working hours. Defaults to { open: "07:00", close: "00:00" } if not set. */
  workingHours: WorkingHours;
  /** Slot duration in minutes. Defaults to 60. */
  slotDurationMinutes: number;
}

/**
 * Admin-defined blocked period for a court.
 * Slots within this range must not appear as Available.
 */
export interface BlockedPeriod {
  id: string;
  courtId: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
  reason: string;
  createdAt: string;
}

export interface TimeSlot {
  id: string;
  courtId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  price: number;
  status: SlotStatus;
  reservedUntil?: number; // timestamp
  reservedByUserId?: string;
}

export interface Booking {
  id: string;
  bookingNumber: string;
  courtId: string;
  courtName: string;
  courtImage: string;
  sportType: SportType;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalPrice: number;
  status: BookingStatus;
  /** Origin of the booking — ONLINE, WALK_IN, or ADMIN. */
  bookingSource: BookingSource;
  createdAt: string;
  updatedAt: string;
  /** Owning user ID — used for ownership filtering. Empty string for legacy bookings. */
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  selectedSlotIds: string[];
}

/**
 * Configurable cancellation policy.
 * Default: 2-hour window before slot start time.
 */
export interface CancellationPolicy {
  /** Hours before slot start that cancellation is allowed. */
  cancellationWindowHours: number;
}

export interface BookingResult {
  success: boolean;
  booking?: Booking;
  error?: string;
}

export interface CancellationResult {
  success: boolean;
  booking?: Booking;
  refund?: {
    refunded: boolean;
    refundId?: string;
    error?: string;
  };
  error?: string;
}

/**
 * Membership plan — future feature.
 * Type kept for UI page compatibility only.
 * No active booking logic references this type.
 */
export interface MembershipPlan {
  id: string;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  popular?: boolean;
  features: string[];
  color: string;
}

export interface Sponsor {
  id: string;
  companyName: string;
  logo: string;
  tagline: string;
  offer: string;
  discountCode: string;
  website: string;
  category: string;
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  image: string;
  date: string;
  time: string;
  location: string;
  sportType: SportType;
  maxParticipants: number;
  currentParticipants: number;
  entryFee: number;
  organizer: string;
  registeredUsers: string[];
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  avatar: string;
  rating: number;
  comment: string;
  date: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: 'General' | 'Booking' | 'Membership' | 'Cancellation';
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  role: 'Guest' | 'User' | 'Admin';
  createdAt: string;
}

// ── Notifications ──

export type NotificationType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_expired'
  | 'booking_reminder'
  | 'booking_time_changed'
  | 'payment_successful'
  | 'payment_refunded'
  | 'subscription_expiring'
  | 'promo_offer'
  | 'court_full'
  | 'checkout_stuck'
  | 'new_subscription'
  | 'new_booking'
  | 'info';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  relatedBookingId?: string;
  createdAt: string;
}

// ── Sponsorship Domain ──

export type SponsorshipTargetType = 'Club' | 'Court' | 'FacilityArea';

export type SponsorshipPricingType = 'OneTime' | 'PerMonth' | 'PerSeason';

/**
 * Lifecycle state of a sponsorship request.
 * Only 'Pending' is ever created in Phase 6 — Approved/Rejected/Cancelled
 * require a future Owner Dashboard phase.
 */
export type SponsorshipStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface SponsorshipRequest {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  /** Club, a specific Court, or a Facility Area. */
  targetType: SponsorshipTargetType;
  /** Must be validated at creation time against CLUB_TARGET_ID, MOCK_COURTS, or FACILITY_AREAS. */
  targetId: string;
  /** Amount for the selected pricingType (e.g. 20000 + PerMonth = 20,000/month). */
  proposedAmount: number;
  currency: string;
  pricingType: SponsorshipPricingType;
  /** Free-text list of benefits the company requests (stored only — not implemented). */
  requestedBenefits: string[];
  /** Structured placement intent (stored for future Owner Dashboard). */
  requestedPlacement: string[];
  /** Always empty in Phase 6 — set by Owner Dashboard in a future phase. */
  approvedBenefits: string[];
  message?: string;
  status: SponsorshipStatus;
  /** Always false in Phase 6 — set true only after approval + start date by future dashboard. */
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SponsorshipResult {
  success: boolean;
  request?: SponsorshipRequest;
  error?: string;
}

// ── Advertisement Domain ──

/**
 * A physical or digital advertising surface that the club offers commercially.
 * isAvailable = true means the space is on the market.
 * Whether a specific date range is free is determined separately by overlap check.
 */
export interface AdvertisingSpace {
  id: string;
  name: string;
  /** Human-readable location string, e.g. "Emirates Pitch 5v5 – Wall A" */
  location: string;
  dimensions: string;
  basePrice: number;
  billingPeriod: 'Month' | 'Season' | 'Year';
  /** true = commercially offered; false = not for sale (disabled state). */
  isAvailable: boolean;
  description?: string;
}

export type AdvertisementStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface AdvertisementRequest {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  advertisingSpaceId: string;
  startDate: string;
  endDate: string;
  proposedBudget: number;
  /** URL or text placeholder — no real file upload in Phase 6. */
  bannerReference?: string;
  notes?: string;
  status: AdvertisementStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdvertisementRequestResult {
  success: boolean;
  request?: AdvertisementRequest;
  error?: string;
}
