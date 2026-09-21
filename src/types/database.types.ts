/**
 * Raw PostgreSQL / Supabase Database Row Types & Enums for K-HUB Platform.
 * Mirrors the exact column names (snake_case) defined in docs/0001_supabase_schema.sql.
 */

export type UserRoleEnum = 'Guest' | 'User' | 'Admin';
export type UserStatusEnum = 'Active' | 'Inactive' | 'Suspended';
export type SportTypeEnum = 'Football' | 'Tennis' | 'Padel';
export type CourtStatusEnum = 'Available' | 'Booked' | 'Starts Soon' | 'Maintenance';
export type BookingStatusEnum = 'Reserved' | 'Confirmed' | 'Expired' | 'Cancelled';
export type BookingSourceEnum = 'ONLINE' | 'WALK_IN' | 'ADMIN';
export type PaymentStatusEnum = 'Pending' | 'Paid' | 'Failed' | 'Cancelled' | 'Refunded';
export type SponsorshipTargetEnum = 'Club' | 'Court' | 'FacilityArea';
export type SponsorshipPricingEnum = 'OneTime' | 'PerMonth' | 'PerSeason';
export type SponsorshipStatusEnum = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export type AdvertisementStatusEnum = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface DbProfile {
  id: string; // UUID references auth.users(id)
  full_name: string;
  email: string;
  phone_number: string | null;
  avatar_url: string | null;
  role: UserRoleEnum;
  status: UserStatusEnum;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  emergency_contact: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbCourt {
  id: string;
  name: string;
  sport_type: SportTypeEnum;
  surface: string;
  is_indoor: boolean;
  capacity: number;
  price_per_hour: number;
  rating: number;
  review_count: number;
  image_url: string;
  gallery_urls: string[];
  description: string | null;
  features: string[];
  rules: string[];
  status: CourtStatusEnum;
  working_hours_open: string; // "07:00:00"
  working_hours_close: string; // "00:00:00"
  slot_duration_minutes: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbBlockedPeriod {
  id: string;
  court_id: string;
  blocked_range: string; // PostgreSQL TSTZRANGE
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface DbBooking {
  id: string;
  booking_number: string;
  user_id: string;
  court_id: string;
  booking_range: string; // PostgreSQL TSTZRANGE
  duration_minutes: number;
  total_price: number;
  status: BookingStatusEnum;
  booking_source: BookingSourceEnum;
  user_name: string;
  user_email: string;
  user_phone: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
}

export interface DbPayment {
  id: string;
  booking_id: string;
  amount: number; // Smallest unit (piastres)
  currency: string;
  status: PaymentStatusEnum;
  payment_method: string | null;
  idempotency_key: string;
  transaction_reference: string | null;
  failure_reason: string | null;
  refunded_at: string | null;
  refund_reason: string | null;
  refunded_amount: number | null;
  created_at: string;
  updated_at: string;
}

export interface DbNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  related_booking_id: string | null;
  dedupe_key: string | null;
  created_at: string;
}

export interface DbEvent {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  sport_type: SportTypeEnum;
  max_participants: number;
  current_participants: number;
  entry_fee: number;
  organizer: string;
  created_at: string;
  updated_at: string;
}

export interface DbEventRegistration {
  id: string;
  user_id: string;
  event_id: string;
  registered_at: string;
}

export interface DbSponsor {
  id: string;
  company_name: string;
  logo: string;
  tagline: string | null;
  offer: string | null;
  discount_code: string | null;
  website: string | null;
  category: string | null;
  created_at: string;
}

export interface DbSponsorshipRequest {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  target_type: SponsorshipTargetEnum;
  target_id: string;
  proposed_amount: number;
  currency: string;
  pricing_type: SponsorshipPricingEnum;
  requested_benefits: string[];
  requested_placement: string[];
  approved_benefits: string[];
  message: string | null;
  status: SponsorshipStatusEnum;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAdvertisingSpace {
  id: string;
  name: string;
  location: string;
  dimensions: string;
  base_price: number;
  billing_period: string;
  is_available: boolean;
  description: string | null;
  created_at: string;
}

export interface DbAdvertisementRequest {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  advertising_space_id: string;
  date_range: string; // PostgreSQL DATERANGE
  proposed_budget: number;
  banner_reference: string | null;
  notes: string | null;
  status: AdvertisementStatusEnum;
  created_at: string;
  updated_at: string;
}

export interface DbFAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  display_order: number;
  created_at: string;
}

export interface DbTestimonial {
  id: string;
  name: string;
  role: string;
  avatar_url: string | null;
  rating: number;
  comment: string;
  created_at: string;
}

export interface DbContactSubmission {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  created_at: string;
}

export interface DbSystemSetting {
  key: string;
  value: unknown; // JSONB
  description: string | null;
  updated_at: string;
}

/** Complete Supabase Database Schema Definition */
export interface Database {
  public: {
    Tables: {
      profiles: { Row: DbProfile; Insert: Omit<DbProfile, 'created_at' | 'updated_at'> & Partial<DbProfile>; Update: Partial<DbProfile>; Relationships: [] };
      courts: { Row: DbCourt; Insert: Omit<DbCourt, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> & Partial<DbCourt>; Update: Partial<DbCourt>; Relationships: [] };
      blocked_periods: { Row: DbBlockedPeriod; Insert: Omit<DbBlockedPeriod, 'id' | 'created_at'> & Partial<DbBlockedPeriod>; Update: Partial<DbBlockedPeriod>; Relationships: [] };
      bookings: { Row: DbBooking; Insert: Omit<DbBooking, 'id' | 'created_at' | 'updated_at' | 'cancelled_at' | 'cancellation_reason'> & Partial<DbBooking>; Update: Partial<DbBooking>; Relationships: [] };
      payments: { Row: DbPayment; Insert: Omit<DbPayment, 'id' | 'created_at' | 'updated_at'> & Partial<DbPayment>; Update: Partial<DbPayment>; Relationships: [] };
      notifications: { Row: DbNotification; Insert: Omit<DbNotification, 'id' | 'created_at'> & Partial<DbNotification>; Update: Partial<DbNotification>; Relationships: [] };
      events: { Row: DbEvent; Insert: Omit<DbEvent, 'id' | 'created_at' | 'updated_at'> & Partial<DbEvent>; Update: Partial<DbEvent>; Relationships: [] };
      event_registrations: { Row: DbEventRegistration; Insert: Omit<DbEventRegistration, 'id' | 'registered_at'> & Partial<DbEventRegistration>; Update: Partial<DbEventRegistration>; Relationships: [] };
      sponsors: { Row: DbSponsor; Insert: Omit<DbSponsor, 'id' | 'created_at'> & Partial<DbSponsor>; Update: Partial<DbSponsor>; Relationships: [] };
      sponsorship_requests: { Row: DbSponsorshipRequest; Insert: Omit<DbSponsorshipRequest, 'id' | 'created_at' | 'updated_at'> & Partial<DbSponsorshipRequest>; Update: Partial<DbSponsorshipRequest>; Relationships: [] };
      advertising_spaces: { Row: DbAdvertisingSpace; Insert: Omit<DbAdvertisingSpace, 'id' | 'created_at'> & Partial<DbAdvertisingSpace>; Update: Partial<DbAdvertisingSpace>; Relationships: [] };
      advertisement_requests: { Row: DbAdvertisementRequest; Insert: Omit<DbAdvertisementRequest, 'id' | 'created_at' | 'updated_at'> & Partial<DbAdvertisementRequest>; Update: Partial<DbAdvertisementRequest>; Relationships: [] };
      faqs: { Row: DbFAQ; Insert: Omit<DbFAQ, 'id' | 'created_at'> & Partial<DbFAQ>; Update: Partial<DbFAQ>; Relationships: [] };
      testimonials: { Row: DbTestimonial; Insert: Omit<DbTestimonial, 'id' | 'created_at'> & Partial<DbTestimonial>; Update: Partial<DbTestimonial>; Relationships: [] };
      contact_submissions: { Row: DbContactSubmission; Insert: Omit<DbContactSubmission, 'id' | 'created_at'> & Partial<DbContactSubmission>; Update: Partial<DbContactSubmission>; Relationships: [] };
      system_settings: { Row: DbSystemSetting; Insert: DbSystemSetting; Update: Partial<DbSystemSetting>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
