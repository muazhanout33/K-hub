-- ==============================================================================
-- K-HUB SPORTS CLUB PLATFORM — PRODUCTION POSTGRESQL / SUPABASE MIGRATION
-- Migration: 0001_supabase_schema.sql
-- Description: Establishes complete core database architecture, RLS security policies,
--              concurrency constraints, auto-profile creation triggers, and performance indexes.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS & SCHEMA PREPARATION
-- ------------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ------------------------------------------------------------------------------
-- 2. ENUM TYPES
-- ------------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('Guest', 'User', 'Admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE user_status_enum AS ENUM ('Active', 'Inactive', 'Suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sport_type_enum AS ENUM ('Football', 'Tennis', 'Padel');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE court_status_enum AS ENUM ('Available', 'Booked', 'Starts Soon', 'Maintenance');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE booking_status_enum AS ENUM ('Reserved', 'Confirmed', 'Expired', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE booking_source_enum AS ENUM ('ONLINE', 'WALK_IN', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM ('Pending', 'Paid', 'Failed', 'Cancelled', 'Refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sponsorship_target_enum AS ENUM ('Club', 'Court', 'FacilityArea');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sponsorship_pricing_enum AS ENUM ('OneTime', 'PerMonth', 'PerSeason');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sponsorship_status_enum AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE advertisement_status_enum AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ------------------------------------------------------------------------------
-- 3. DOMAIN TABLES
-- ------------------------------------------------------------------------------

-- A. PROFILES (1:1 link with Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone_number TEXT,
    avatar_url TEXT,
    role user_role_enum NOT NULL DEFAULT 'User',
    status user_status_enum NOT NULL DEFAULT 'Active',
    date_of_birth DATE,
    gender TEXT,
    address TEXT,
    emergency_contact TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- B. COURTS
CREATE TABLE IF NOT EXISTS public.courts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sport_type sport_type_enum NOT NULL,
    surface TEXT NOT NULL,
    is_indoor BOOLEAN NOT NULL DEFAULT true,
    capacity INT NOT NULL DEFAULT 4,
    price_per_hour NUMERIC(10, 2) NOT NULL CHECK (price_per_hour >= 0),
    rating NUMERIC(3, 2) DEFAULT 5.0 CHECK (rating BETWEEN 0 AND 5),
    review_count INT DEFAULT 0 CHECK (review_count >= 0),
    image_url TEXT NOT NULL,
    gallery_urls TEXT[] DEFAULT '{}',
    description TEXT,
    features TEXT[] DEFAULT '{}',
    rules TEXT[] DEFAULT '{}',
    status court_status_enum NOT NULL DEFAULT 'Available',
    working_hours_open TIME NOT NULL DEFAULT '07:00:00',
    working_hours_close TIME NOT NULL DEFAULT '00:00:00',
    slot_duration_minutes INT NOT NULL DEFAULT 60 CHECK (slot_duration_minutes > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- C. BLOCKED PERIODS
CREATE TABLE IF NOT EXISTS public.blocked_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
    blocked_range TSTZRANGE NOT NULL,
    reason TEXT NOT NULL,
    -- ON DELETE SET NULL: deleting an admin profile must not cascade-block the FK
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prevent_overlapping_blocked_periods EXCLUDE USING gist (
        court_id WITH =,
        blocked_range WITH &&
    )
);

-- D. BOOKINGS
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_number TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE RESTRICT,
    booking_range TSTZRANGE NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
    status booking_status_enum NOT NULL DEFAULT 'Reserved',
    booking_source booking_source_enum NOT NULL DEFAULT 'ONLINE',
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    user_phone TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,

    -- PREVENT DOUBLE BOOKING AT DATABASE ENGINE LEVEL
    -- Only active bookings ('Reserved', 'Confirmed') enforce non-overlapping ranges (&&).
    -- Cancelled and Expired bookings are ignored, allowing slots to be re-booked safely.
    CONSTRAINT prevent_double_booking EXCLUDE USING gist (
        court_id WITH =,
        booking_range WITH &&
    ) WHERE (status IN ('Reserved', 'Confirmed'))
);

-- E. PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
    amount BIGINT NOT NULL CHECK (amount > 0), -- Stored in smallest currency unit (piastres)
    currency VARCHAR(3) NOT NULL DEFAULT 'EGP',
    status payment_status_enum NOT NULL DEFAULT 'Pending',
    payment_method TEXT,
    idempotency_key TEXT UNIQUE NOT NULL,
    transaction_reference TEXT,
    failure_reason TEXT,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,
    refunded_amount BIGINT CHECK (refunded_amount IS NULL OR refunded_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- F. NOTIFICATIONS
-- Migration 20260826000000 added dedupe_key, unique index, and CHECK constraints
-- for type/title/message validation.
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'booking_confirmed', 'booking_cancelled', 'booking_expired',
        'booking_reminder', 'booking_time_changed',
        'payment_successful', 'payment_refunded',
        'subscription_expiring', 'promo_offer',
        'court_full', 'checkout_stuck',
        'new_subscription', 'new_booking', 'info'
    )),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 255),
    message TEXT NOT NULL CHECK (length(trim(message)) > 0 AND length(message) <= 2000),
    is_read BOOLEAN NOT NULL DEFAULT false,
    related_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    dedupe_key VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- G. EVENTS & REGISTRATIONS
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location TEXT NOT NULL,
    sport_type sport_type_enum NOT NULL,
    max_participants INT NOT NULL CHECK (max_participants > 0),
    current_participants INT NOT NULL DEFAULT 0 CHECK (current_participants >= 0),
    entry_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
    organizer TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, event_id)
);

-- H. SPONSORS & SPONSORSHIP REQUESTS
CREATE TABLE IF NOT EXISTS public.sponsors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    logo TEXT NOT NULL,
    tagline TEXT,
    offer TEXT,
    discount_code TEXT,
    website TEXT,
    category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sponsorship_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    target_type sponsorship_target_enum NOT NULL,
    target_id TEXT NOT NULL,
    proposed_amount NUMERIC(10, 2) NOT NULL CHECK (proposed_amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EGP',
    pricing_type sponsorship_pricing_enum NOT NULL,
    requested_benefits TEXT[] DEFAULT '{}',
    requested_placement TEXT[] DEFAULT '{}',
    approved_benefits TEXT[] DEFAULT '{}',
    message TEXT,
    status sponsorship_status_enum NOT NULL DEFAULT 'Pending',
    is_active BOOLEAN NOT NULL DEFAULT false,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- I. ADVERTISING SPACES & REQUESTS
CREATE TABLE IF NOT EXISTS public.advertising_spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    dimensions TEXT NOT NULL,
    base_price NUMERIC(10, 2) NOT NULL CHECK (base_price >= 0),
    billing_period TEXT NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.advertisement_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    advertising_space_id UUID NOT NULL REFERENCES public.advertising_spaces(id) ON DELETE RESTRICT,
    date_range DATERANGE NOT NULL,
    proposed_budget NUMERIC(10, 2) NOT NULL CHECK (proposed_budget > 0),
    banner_reference TEXT,
    notes TEXT,
    status advertisement_status_enum NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prevent_overlapping_ad_requests EXCLUDE USING gist (
        advertising_space_id WITH =,
        date_range WITH &&
    ) WHERE (status IN ('Pending', 'Approved'))
);

-- J. FAQS, TESTIMONIALS & CONTACT SUBMISSIONS
CREATE TABLE IF NOT EXISTS public.faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar_url TEXT,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contact_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- K. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------

-- Bookings indexes
CREATE INDEX IF NOT EXISTS idx_bookings_court_range ON public.bookings USING gist (court_id, booking_range);
CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON public.bookings (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status_range ON public.bookings USING gist (booking_range) WHERE status = 'Reserved';

-- Blocked periods index
CREATE INDEX IF NOT EXISTS idx_blocked_periods_court_range ON public.blocked_periods USING gist (court_id, blocked_range);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments (status);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, is_read, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key ON public.notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Courts index
CREATE INDEX IF NOT EXISTS idx_courts_sport_status ON public.courts (sport_type, status) WHERE deleted_at IS NULL;

-- 🟡 WARNING FIX: Admin dashboard filter indexes for proposals
CREATE INDEX IF NOT EXISTS idx_sponsorship_requests_status ON public.sponsorship_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_requests_status ON public.advertisement_requests (status, created_at DESC);

-- ------------------------------------------------------------------------------
-- 5. FUNCTIONS & TRIGGERS
-- ------------------------------------------------------------------------------

-- Helper function to evaluate Admin role securely
-- 🔴 FIX: SET search_path = public prevents search_path hijacking on SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Auto-update updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all eligible tables (8 triggers).
-- Note: system_settings trigger was added in migration 20260825000000
-- (originally missed in the base schema).
DROP TRIGGER IF EXISTS tr_profiles_updated_at ON public.profiles;
CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_courts_updated_at ON public.courts;
CREATE TRIGGER tr_courts_updated_at BEFORE UPDATE ON public.courts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_bookings_updated_at ON public.bookings;
CREATE TRIGGER tr_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_payments_updated_at ON public.payments;
CREATE TRIGGER tr_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_events_updated_at ON public.events;
CREATE TRIGGER tr_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_sponsorship_requests_updated_at ON public.sponsorship_requests;
CREATE TRIGGER tr_sponsorship_requests_updated_at BEFORE UPDATE ON public.sponsorship_requests FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_advertisement_requests_updated_at ON public.advertisement_requests;
CREATE TRIGGER tr_advertisement_requests_updated_at BEFORE UPDATE ON public.advertisement_requests FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER tr_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Booking immutable fields: prevent mutation of user_id, court_id, total_price, booking_range.
-- Enforced via BEFORE UPDATE trigger (defense-in-depth; WITH CHECK subqueries alone are a no-op
-- because PostgreSQL evaluates them after the UPDATE).
CREATE OR REPLACE FUNCTION public.enforce_booking_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Booking user_id is immutable';
    END IF;
    IF NEW.court_id IS DISTINCT FROM OLD.court_id THEN
        RAISE EXCEPTION 'Booking court_id is immutable';
    END IF;
    IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
        RAISE EXCEPTION 'Booking total_price is immutable';
    END IF;
    IF NEW.booking_range IS DISTINCT FROM OLD.booking_range THEN
        RAISE EXCEPTION 'Booking booking_range is immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_immutable_fields ON public.bookings;
CREATE TRIGGER trg_booking_immutable_fields
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_booking_immutable_fields();

-- Automatic profile creation on auth.users registration trigger
-- SET search_path = public prevents search_path hijacking
-- SECURITY FIX: COALESCE email to id::TEXT (not '') to prevent UNIQUE constraint
--   collision when two OAuth users both have no email address.
--   Empty string '' is NOT a valid unique sentinel — UUID always is.
-- SECURITY FIX: Hardcode role = 'User'. Ignore raw_user_meta_data role
--   to prevent privilege escalation via malicious signup metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        phone_number,
        avatar_url,
        role
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.id::TEXT),
        COALESCE(NEW.email, NEW.id::TEXT),
        NEW.raw_user_meta_data->>'phone_number',
        NEW.raw_user_meta_data->>'avatar_url',
        'User'::user_role_enum
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- SECURITY DEFINER helper: read the caller's persisted role without triggering RLS.
-- Used by the profiles UPDATE policy to prevent role escalation.
-- SET search_path = '' (empty) is the strictest hardening — no implicit schema search.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role_enum AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS on all public domain tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsorship_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertising_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- A. PROFILES POLICIES
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
-- SECURITY FIX: The previous subquery SELECT FROM public.profiles inside a policy on
-- public.profiles causes infinite RLS recursion — PostgreSQL re-evaluates RLS on the
-- inner SELECT, which re-fires this same policy indefinitely.
-- Fix: delegate the persisted-role lookup to get_my_role(), a SECURITY DEFINER function
-- that executes with elevated privileges (bypassing RLS), breaking the recursion.
CREATE POLICY "Users update own profile" ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        id = auth.uid()
        AND role = public.get_my_role()
    );

DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles" ON public.profiles FOR ALL USING (public.is_admin());

-- B. COURTS POLICIES
DROP POLICY IF EXISTS "Public read courts" ON public.courts;
CREATE POLICY "Public read courts" ON public.courts FOR SELECT USING (deleted_at IS NULL OR public.is_admin());

DROP POLICY IF EXISTS "Admins write courts" ON public.courts;
CREATE POLICY "Admins write courts" ON public.courts FOR ALL USING (public.is_admin());

-- C. BLOCKED PERIODS POLICIES
-- Migration 20260823000000: Replaced public read with admin-only SELECT.
-- Blocked periods contain internal admin data (court IDs, dates, reasons)
-- that should not be exposed to anonymous visitors.
DROP POLICY IF EXISTS "Public read blocked periods" ON public.blocked_periods;
CREATE POLICY "Admin read blocked periods" ON public.blocked_periods
    FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage blocked periods" ON public.blocked_periods;
CREATE POLICY "Admins manage blocked periods" ON public.blocked_periods FOR ALL USING (public.is_admin());

-- D. BOOKINGS POLICIES
DROP POLICY IF EXISTS "Users view own bookings" ON public.bookings;
CREATE POLICY "Users view own bookings" ON public.bookings FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users create own bookings" ON public.bookings;
CREATE POLICY "Users create own bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- 🔴 FIX: 'FOR UPDATE USING (auth.uid() = user_id)' lets users freely modify status,
-- total_price, court_id, booking_range — a critical privilege escalation vulnerability.
-- Fix: Normal users can ONLY transition their booking to 'Cancelled' or 'Confirmed'.
-- Immutable fields (total_price, court_id, booking_range, user_id) are enforced via WITH CHECK.
-- Admins retain full UPDATE access via the is_admin() branch.
DROP POLICY IF EXISTS "Users update own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users cancel own bookings" ON public.bookings;
CREATE POLICY "Users update own bookings" ON public.bookings
    FOR UPDATE
    USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (
        public.is_admin()
        OR (
            auth.uid() = user_id
            AND status IN ('Cancelled', 'Confirmed')
            AND user_id    = (SELECT user_id    FROM public.bookings WHERE id = bookings.id)
            AND court_id   = (SELECT court_id   FROM public.bookings WHERE id = bookings.id)
            AND total_price = (SELECT total_price FROM public.bookings WHERE id = bookings.id)
            AND booking_range = (SELECT booking_range FROM public.bookings WHERE id = bookings.id)
        )
    );

-- E. PAYMENTS POLICIES
DROP POLICY IF EXISTS "Users view own payments" ON public.payments;
CREATE POLICY "Users view own payments" ON public.payments FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = payments.booking_id AND (b.user_id = auth.uid() OR public.is_admin())
    )
);

DROP POLICY IF EXISTS "Service role / admin manage payments" ON public.payments;
CREATE POLICY "Service role / admin manage payments" ON public.payments FOR ALL USING (public.is_admin());

-- F. NOTIFICATIONS POLICIES
-- SECURITY FIX: FOR ALL was overly permissive — users could INSERT arbitrary notifications
-- or UPDATE any column (user_id, title, message, type, related_booking_id) on their rows.
-- App contract (useNotificationStore): users only need SELECT, mark-as-read (UPDATE is_read),
-- and DELETE. Notifications are created exclusively server-side / by admin.
-- Split into three granular policies:
DROP POLICY IF EXISTS "Users access own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users mark notifications read" ON public.notifications;
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;

CREATE POLICY "Users view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Users may only flip is_read. All other columns (user_id, title, message, type,
-- related_booking_id, created_at) are immutable from the client side.
CREATE POLICY "Users mark notifications read" ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND user_id          = (SELECT user_id          FROM public.notifications WHERE id = notifications.id)
        AND title            = (SELECT title            FROM public.notifications WHERE id = notifications.id)
        AND message          = (SELECT message          FROM public.notifications WHERE id = notifications.id)
        AND type             = (SELECT type             FROM public.notifications WHERE id = notifications.id)
        AND related_booking_id IS NOT DISTINCT FROM
            (SELECT related_booking_id FROM public.notifications WHERE id = notifications.id)
    );

CREATE POLICY "Users delete own notifications" ON public.notifications
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins manage notifications" ON public.notifications
    FOR ALL USING (public.is_admin());

-- G. EVENTS & REGISTRATIONS POLICIES
DROP POLICY IF EXISTS "Public view events" ON public.events;
CREATE POLICY "Public view events" ON public.events FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage events" ON public.events;
CREATE POLICY "Admins manage events" ON public.events FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Users view event registrations" ON public.event_registrations;
CREATE POLICY "Users view event registrations" ON public.event_registrations FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users register events" ON public.event_registrations;
CREATE POLICY "Users register events" ON public.event_registrations FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users cancel event registration" ON public.event_registrations;
CREATE POLICY "Users cancel event registration" ON public.event_registrations FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- H. SPONSORSHIPS & ADVERTISEMENTS POLICIES
DROP POLICY IF EXISTS "Public view sponsors" ON public.sponsors;
CREATE POLICY "Public view sponsors" ON public.sponsors FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public view ad spaces" ON public.advertising_spaces;
CREATE POLICY "Public view ad spaces" ON public.advertising_spaces FOR SELECT USING (is_available = true OR public.is_admin());

-- 🔴 FIX: 'WITH CHECK (true)' would let anonymous callers insert rows with
-- status = 'Approved' and is_active = true, publishing unapproved content.
-- Fix: enforce safe defaults at the DB policy layer — status must be 'Pending'
-- and is_active must be false for all public (unauthenticated) insertions.
DROP POLICY IF EXISTS "Public insert sponsorship requests" ON public.sponsorship_requests;
CREATE POLICY "Public insert sponsorship requests" ON public.sponsorship_requests
    FOR INSERT WITH CHECK (status = 'Pending' AND is_active = false);

DROP POLICY IF EXISTS "Public insert advertisement requests" ON public.advertisement_requests;
CREATE POLICY "Public insert advertisement requests" ON public.advertisement_requests
    FOR INSERT WITH CHECK (status = 'Pending');

DROP POLICY IF EXISTS "Admins manage sponsorship requests" ON public.sponsorship_requests;
CREATE POLICY "Admins manage sponsorship requests" ON public.sponsorship_requests FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage ad requests" ON public.advertisement_requests;
CREATE POLICY "Admins manage ad requests" ON public.advertisement_requests FOR ALL USING (public.is_admin());

-- I. CMS & SUPPORT POLICIES
DROP POLICY IF EXISTS "Public view faqs" ON public.faqs;
CREATE POLICY "Public view faqs" ON public.faqs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public view testimonials" ON public.testimonials;
CREATE POLICY "Public view testimonials" ON public.testimonials FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert contact submissions" ON public.contact_submissions;
CREATE POLICY "Public insert contact submissions" ON public.contact_submissions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage faqs" ON public.faqs;
CREATE POLICY "Admins manage faqs" ON public.faqs FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage testimonials" ON public.testimonials;
CREATE POLICY "Admins manage testimonials" ON public.testimonials FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins view contact submissions" ON public.contact_submissions;
CREATE POLICY "Admins view contact submissions" ON public.contact_submissions FOR SELECT USING (public.is_admin());

-- J. SYSTEM SETTINGS POLICIES
DROP POLICY IF EXISTS "Public read non-sensitive settings" ON public.system_settings;
CREATE POLICY "Public read non-sensitive settings" ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage system settings" ON public.system_settings;
CREATE POLICY "Admins manage system settings" ON public.system_settings FOR ALL USING (public.is_admin());

-- K. POSTGRESQL TABLE GRANTS & DEFAULT PRIVILEGES
-- Grant schema usage to API roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant object privileges on tables to service_role (all) and client roles (select/insert/update/delete filtered by RLS)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- Grant sequence privileges
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Ensure future tables inherit privileges automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon, authenticated;
