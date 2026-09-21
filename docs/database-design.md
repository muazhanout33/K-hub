# 🗄️ Database Design Specification

## Overview

This document defines the official, production-ready PostgreSQL and Supabase database architecture for the **K-HUB Sports Club Booking Platform**.

It supersedes all prior database specifications. Every table, relationship, constraint, security policy, and indexing strategy defined in this document represents the authoritative database standard for the application.

---

## 1. Database Philosophy & Engine

- **Database Engine**: PostgreSQL 15+ (hosted on Supabase)
- **Primary Goals**: Data Integrity, High Concurrency Scalability, Strict Access Control (RLS), Simplicity, Maintainability.
- **Dynamic Availability Engine**: The platform avoids pre-generating static time-slot rows. Availability is calculated dynamically by comparing court operating hours against confirmed/reserved `bookings` and admin `blocked_periods`.
- **Database as Final Authority**: Double booking prevention and idempotency are strictly enforced at the PostgreSQL engine level via GiST `EXCLUDE` constraints and unique indexes.

---

## 2. Naming & Data Standards

- **Tables**: `snake_case`, plural nouns (`profiles`, `courts`, `bookings`, `payments`, `notifications`).
- **Columns**: `snake_case` (`user_id`, `created_at`, `price_per_hour`).
- **Identifiers**: PostgreSQL `gen_random_uuid()` for entity Primary Keys.
- **Timestamps**: `TIMESTAMPTZ` (UTC ISO standard).
- **Currencies**: Payments stored as integer amounts in the smallest currency unit (piastres for EGP: 1 EGP = 100 piastres) to avoid floating-point errors.

---

## 3. Entity Domain Architecture

### A. Authentication & User Profiles (`auth.users` + `public.profiles`)
- **Purpose**: Manage authentication securely through Supabase Auth while storing application-specific user metadata in a public profile table.
- **Ownership**: `profiles.id` is a 1:1 foreign key referencing `auth.users(id) ON DELETE CASCADE`.
- **Security**: Passwords and hash tokens remain isolated inside `auth.users`. User roles (`User`, `Admin`) and statuses (`Active`, `Inactive`, `Suspended`) are stored in `public.profiles`.
- **Automation**: An `on_auth_user_created` trigger automatically inserts a default profile upon registration.

### B. Courts & Maintenance (`public.courts` + `public.blocked_periods`)
- **`courts`**: Stores playable courts, sport types, capacity, pricing, operating hours (`working_hours_open`, `working_hours_close`), `slot_duration_minutes`, features, rules, and image galleries (`gallery_urls TEXT[]`).
- **`blocked_periods`**: Stores admin-defined maintenance closures. Enforces non-overlapping blocked ranges using PostgreSQL `EXCLUDE USING gist (court_id WITH =, blocked_range WITH &&)`.

### C. Bookings & Concurrency (`public.bookings`)
- **Purpose**: Stores active reservations and historical bookings.
- **Concurrency & Double Booking Protection**:
  Enforces a PostgreSQL `EXCLUDE` constraint with `btree_gist`:
  ```sql
  CONSTRAINT prevent_double_booking EXCLUDE USING gist (
      court_id WITH =,
      booking_range WITH &&
  ) WHERE (status IN ('Reserved', 'Confirmed'))
  ```
  - Prevents overlapping time ranges (`&&`) for active bookings (`Reserved` or `Confirmed`).
  - Automatically permits re-booking when a slot is `Cancelled` or `Expired`.

### D. Payments & Idempotency (`public.payments`)
- **Purpose**: Stores financial transactions and payment states.
- **Enforcement**:
  - `idempotency_key TEXT UNIQUE NOT NULL` guarantees idempotency and prevents double-charges.
  - Linked to `bookings(id) ON DELETE RESTRICT`.
  - Supports full refund audit trails (`refunded_at`, `refund_reason`, `refunded_amount`).

### E. Notifications (`public.notifications`)
- **Purpose**: User alert feed linked optionally to `related_booking_id`.

### F. Events & Registrations (`public.events` + `public.event_registrations`)
- **Purpose**: Club tournaments and activities. `event_registrations` enforces `UNIQUE(user_id, event_id)`.

### G. Sponsorships & Advertisements
- **`sponsors` & `sponsorship_requests`**: Stores active sponsors and business proposal requests.
- **`advertising_spaces` & `advertisement_requests`**: Stores commercial ad slots and proposal requests. `advertisement_requests` includes a date-range overlap constraint for active ad requests.

### H. CMS & Support
- **`faqs`**, **`testimonials`**, **`contact_submissions`**: Public content and user support submissions.

### I. System Settings (`public.system_settings`)
- **Purpose**: System configuration (cancellation windows, hold timers, club defaults).

---

## 4. Scalability & Indexing Strategy

To comfortably support 10,000+ users and high concurrent booking volume:

1. `bookings`: `GiST(court_id, booking_range)` for instantaneous availability overlap queries.
2. `bookings`: `B-Tree(user_id, status, created_at DESC)` for high-speed "My Bookings" user dashboard retrieval.
3. `payments`: `UNIQUE B-Tree(idempotency_key)` for O(1) double-submit rejection.
4. `notifications`: `B-Tree(user_id, is_read, created_at DESC)` for fast unread notifications counter.
5. `courts`: `B-Tree(sport_type, status)` for court listing filtering.

---

## 5. Row Level Security (RLS) Rules

All public tables enforce Row Level Security:

- **Profiles**: Users can read/update their own profile. Admins can view/manage all profiles. Users cannot escalate their own `role`.
- **Bookings**: Users can view, create, and cancel their own bookings (`auth.uid() = user_id`). Admins have full access.
- **Payments**: Users can view payments for their own bookings. Service role / Admins process payments.
- **Notifications**: Strictly isolated to the owning user (`auth.uid() = user_id`).
- **Courts, FAQs, Testimonials, Ad Spaces**: Public read access. Writes restricted to Admins.
- **Sponsorship & Ad Requests**: Public insert access for business visitors; Admin management access.

---

## 6. TypeScript Data Layer Mapping Boundary

Database `snake_case` column names map cleanly to application `camelCase` domain types via `src/lib/mappers.ts`:

- PostgreSQL `profiles` ↔ `User`
- PostgreSQL `courts` ↔ `Court`
- PostgreSQL `bookings` ↔ `Booking`
- PostgreSQL `payments` ↔ `Payment`
- PostgreSQL `notifications` ↔ `Notification`

Application features continue to work seamlessly without forcing database field names directly into the UI components.
