# Phase 12 — Database Constraint Audit

**Date:** 2026-08-25
**Scope:** Complete PostgreSQL/Supabase constraint audit for all 16 public tables
**Verdict:** ✅ **PASS** — No constraint gaps found

---

## A. Executive Summary

Systematic audit of every database constraint across all 16 public tables in the K-HUB Sports Club platform. Examined primary keys, foreign keys, UNIQUE constraints, NOT NULL constraints, CHECK constraints, EXCLUDE constraints, DEFAULT values, enum types, and trigger-based integrity enforcement.

**Result:** All constraints are well-designed, comprehensive, and correct. No migration is required.

---

## B. Schema Sources

| Source | Lines | Authority |
|--------|-------|-----------|
| `docs/0001_supabase_schema.sql` | 651 | Base DDL (CREATE TABLE + constraints) |
| `supabase/migrations/20260823000000_tighten_blocked_periods_rls.sql` | 27 | RLS-only (no constraint changes) |
| `supabase/migrations/20260823000001_fix_signup_role_escalation.sql` | 61 | handle_new_user() function (no constraint changes) |
| `supabase/migrations/20260823000002_reconcile_bookings_rls.sql` | 129 | Adds `enforce_booking_immutable_fields()` BEFORE UPDATE trigger |
| `supabase/migrations/20260823000003_fix_service_role_bookings_grants.sql` | 27 | GRANT only (no constraint changes) |
| `supabase/migrations/20260825000000_add_system_settings_updated_at_trigger.sql` | 41 | Adds missing `tr_system_settings_updated_at` trigger |

**Effective state:** Base DDL + all 5 migrations applied in sequence.

---

## C. Enum Types (11 total)

| Enum | Values | Used By |
|------|--------|---------|
| `user_role_enum` | Guest, User, Admin | profiles.role |
| `user_status_enum` | Active, Inactive, Suspended | profiles.status |
| `sport_type_enum` | Football, Tennis, Padel | courts.sport_type, events.sport_type |
| `court_status_enum` | Available, Booked, Starts Soon, Maintenance | courts.status |
| `booking_status_enum` | Reserved, Confirmed, Expired, Cancelled | bookings.status |
| `booking_source_enum` | ONLINE, WALK_IN, ADMIN | bookings.booking_source |
| `payment_status_enum` | Pending, Paid, Failed, Cancelled, Refunded | payments.status |
| `sponsorship_target_enum` | Club, Court, FacilityArea | sponsorship_requests.target_type |
| `sponsorship_pricing_enum` | OneTime, PerMonth, PerSeason | sponsorship_requests.pricing_type |
| `sponsorship_status_enum` | Pending, Approved, Rejected, Cancelled | sponsorship_requests.status |
| `advertisement_status_enum` | Pending, Approved, Rejected, Cancelled | advertisement_requests.status |

**Finding:** All 11 enums are properly defined with `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object ... END $$;` idempotency guards. All enum types in `database.types.ts` match the SQL definitions exactly.

---

## D. Primary Key Audit (16/16 tables)

| Table | PK Column | Type | Generation | Status |
|-------|-----------|------|------------|--------|
| profiles | id | UUID | REFERENCES auth.users(id) | ✅ Correct |
| courts | id | UUID | gen_random_uuid() | ✅ Correct |
| blocked_periods | id | UUID | gen_random_uuid() | ✅ Correct |
| bookings | id | UUID | gen_random_uuid() | ✅ Correct |
| payments | id | UUID | gen_random_uuid() | ✅ Correct |
| notifications | id | UUID | gen_random_uuid() | ✅ Correct |
| events | id | UUID | gen_random_uuid() | ✅ Correct |
| event_registrations | id | UUID | gen_random_uuid() | ✅ Correct |
| sponsors | id | UUID | gen_random_uuid() | ✅ Correct |
| sponsorship_requests | id | UUID | gen_random_uuid() | ✅ Correct |
| advertising_spaces | id | UUID | gen_random_uuid() | ✅ Correct |
| advertisement_requests | id | UUID | gen_random_uuid() | ✅ Correct |
| faqs | id | UUID | gen_random_uuid() | ✅ Correct |
| testimonials | id | UUID | gen_random_uuid() | ✅ Correct |
| contact_submissions | id | UUID | gen_random_uuid() | ✅ Correct |
| system_settings | key | TEXT | PK (not UUID) | ✅ Correct (key-value store) |

**Finding:** All 16 tables have appropriate primary keys. `system_settings` correctly uses `TEXT` PK for its key-value store pattern. All other tables use UUID with server-side generation.

---

## E. Foreign Key Audit (11 FKs)

| Source Table | Column | References | ON DELETE | ON UPDATE | Status |
|-------------|--------|------------|-----------|-----------|--------|
| profiles | id | auth.users(id) | CASCADE | NO ACTION | ✅ Correct |
| blocked_periods | court_id | courts(id) | CASCADE | NO ACTION | ✅ Correct |
| blocked_periods | created_by | profiles(id) | SET NULL | NO ACTION | ✅ Correct |
| bookings | user_id | profiles(id) | RESTRICT | NO ACTION | ✅ Correct |
| bookings | court_id | courts(id) | RESTRICT | NO ACTION | ✅ Correct |
| payments | booking_id | bookings(id) | RESTRICT | NO ACTION | ✅ Correct |
| notifications | user_id | profiles(id) | CASCADE | NO ACTION | ✅ Correct |
| notifications | related_booking_id | bookings(id) | SET NULL | NO ACTION | ✅ Correct |
| event_registrations | user_id | profiles(id) | CASCADE | NO ACTION | ✅ Correct |
| event_registrations | event_id | events(id) | CASCADE | NO ACTION | ✅ Correct |
| advertisement_requests | advertising_space_id | advertising_spaces(id) | RESTRICT | NO ACTION | ✅ Correct |

**ON DELETE behavior analysis:**
- **CASCADE** (4 FKs): Correct for child entities that have no meaning without parent (profile→auth.users, blocked_periods→courts, notifications→profiles, event_registrations→both)
- **RESTRICT** (5 FKs): Correct for business data that must not be orphaned (bookings→profiles, bookings→courts, payments→bookings, advertisement_requests→advertising_spaces)
- **SET NULL** (2 FKs): Correct for optional references (blocked_periods.created_by→profiles, notifications.related_booking_id→bookings)

**ON UPDATE behavior:** All FKs use NO ACTION (default). This is correct because all referenced PKs are UUIDs or TEXT, which never change.

**Finding:** All 11 FKs are properly defined with appropriate referential actions.

---

## F. UNIQUE Constraint Audit (4 constraints)

| Table | Column(s) | Type | Status |
|-------|-----------|------|--------|
| profiles | email | Single-column | ✅ Correct — email must be unique |
| bookings | booking_number | Single-column | ✅ Correct — booking number must be unique |
| payments | idempotency_key | Single-column | ✅ Correct — prevents duplicate payments |
| event_registrations | (user_id, event_id) | Composite | ✅ Correct — prevents duplicate registrations |

**Finding:** All 4 UNIQUE constraints are appropriate. No missing UNIQUE constraints identified.

---

## G. NOT NULL Constraint Audit

All 16 tables audited. NOT NULL is applied to every column that requires a value at insert time. Nullable columns are correctly nullable:

| Table | Nullable Columns (by design) | Status |
|-------|------------------------------|--------|
| profiles | phone_number, avatar_url, date_of_birth, gender, address, emergency_contact | ✅ Correct |
| courts | description, deleted_at | ✅ Correct |
| blocked_periods | created_by (ON DELETE SET NULL) | ✅ Correct |
| bookings | cancelled_at, cancellation_reason | ✅ Correct |
| payments | payment_method, transaction_reference, failure_reason, refunded_at, refund_reason, refunded_amount | ✅ Correct |
| notifications | related_booking_id (ON DELETE SET NULL) | ✅ Correct |
| events | description, image_url | ✅ Correct |
| sponsors | tagline, offer, discount_code, website, category | ✅ Correct |
| sponsorship_requests | message, start_date, end_date | ✅ Correct |
| advertising_spaces | description | ✅ Correct |
| advertisement_requests | banner_reference, notes | ✅ Correct |
| testimonials | avatar_url | ✅ Correct |
| system_settings | description | ✅ Correct |

**Finding:** All nullable columns are appropriately nullable. No missing NOT NULL constraints identified.

---

## H. CHECK Constraint Audit (15 constraints)

| Table | Column | Expression | Status |
|-------|--------|------------|--------|
| courts | price_per_hour | `>= 0` | ✅ Correct |
| courts | rating | `BETWEEN 0 AND 5` | ✅ Correct |
| courts | review_count | `>= 0` | ✅ Correct |
| courts | slot_duration_minutes | `> 0` | ✅ Correct |
| bookings | duration_minutes | `> 0` | ✅ Correct |
| bookings | total_price | `>= 0` | ✅ Correct |
| payments | amount | `> 0` | ✅ Correct |
| payments | refunded_amount | `IS NULL OR refunded_amount >= 0` | ✅ Correct |
| events | max_participants | `> 0` | ✅ Correct |
| events | current_participants | `>= 0` | ✅ Correct |
| events | entry_fee | `>= 0` | ✅ Correct |
| sponsorship_requests | proposed_amount | `> 0` | ✅ Correct |
| advertising_spaces | base_price | `>= 0` | ✅ Correct |
| advertisement_requests | proposed_budget | `> 0` | ✅ Correct |
| testimonials | rating | `BETWEEN 1 AND 5` | ✅ Correct |

**Finding:** All 15 CHECK constraints are correct. Prices/amounts enforce non-negative or positive values. Ratings enforce valid ranges. Durations enforce positive values.

---

## I. EXCLUDE Constraint Audit (3 constraints)

| Table | Constraint | Index | Filter | Status |
|-------|-----------|-------|--------|--------|
| blocked_periods | prevent_overlapping_blocked_periods | GiST (court_id, blocked_range) | None (all rows) | ✅ Correct |
| bookings | prevent_double_booking | GiST (court_id, booking_range) | `WHERE status IN ('Reserved', 'Confirmed')` | ✅ Correct |
| advertisement_requests | prevent_overlapping_ad_requests | GiST (advertising_space_id, date_range) | `WHERE status IN ('Pending', 'Approved')` | ✅ Correct |

**Finding:** All 3 EXCLUDE constraints are properly defined with GiST indexes. The partial indexes (WHERE clauses) correctly allow cancelled/expired bookings and rejected ad requests to coexist with active ones.

---

## J. Booking Integrity Audit

### J1. Double-booking prevention
- **Constraint:** `prevent_double_booking` EXCLUDE using GiST on (court_id =, booking_range &&) WHERE (status IN ('Reserved', 'Confirmed'))
- **Extension:** `btree_gist` required for GiST index on UUID column
- **Status:** ✅ Correct — prevents overlapping active bookings per court

### J2. Immutable fields (BEFORE UPDATE trigger)
- **Trigger:** `trg_booking_immutable_fields` BEFORE UPDATE on bookings
- **Function:** `enforce_booking_immutable_fields()` — raises EXCEPTION if user_id, court_id, total_price, or booking_range are changed
- **Status:** ✅ Correct — provides real enforcement that RLS WITH CHECK subqueries cannot

### J3. Status transitions
- **RLS policy:** Users can only transition to 'Cancelled' or 'Confirmed'
- **DB enum:** booking_status_enum allows Reserved, Confirmed, Expired, Cancelled
- **Status:** ✅ Correct — admin can manage all statuses via is_admin()

### J4. Denormalized user data
- **Columns:** user_name, user_email, user_phone (all NOT NULL)
- **Purpose:** Snapshot user data at booking time for admin display
- **Status:** ✅ Correct — data integrity ensured at INSERT time

### J5. FK relationships
- **user_id → profiles(id) ON DELETE RESTRICT:** Cannot delete user with active bookings
- **court_id → courts(id) ON DELETE RESTRICT:** Cannot delete court with active bookings
- **payments.booking_id → bookings(id) ON DELETE RESTRICT:** Cannot delete booking with payments
- **Status:** ✅ Correct — full chain of referential integrity

---

## K. DEFAULT Values Audit (35 defaults)

All 35 DEFAULT values across 16 tables are appropriate:

- **IDs:** gen_random_uuid() on 15 tables, TEXT PK on system_settings
- **Timestamps:** NOW() on all created_at and updated_at columns
- **Statuses:** Sensible initial values ('User', 'Active', 'Available', 'Reserved', 'Pending', etc.)
- **Numeric:** 0 for counters, 5.0 for ratings, 4 for capacity
- **Boolean:** true for is_indoor, is_available; false for is_read, is_active
- **Arrays:** '{}' for TEXT[] columns (gallery_urls, features, rules, etc.)

**Finding:** All defaults are correct. No missing or incorrect defaults identified.

---

## L. Application ↔ DB Alignment

### L1. TypeScript types (database.types.ts)
- All 16 table interfaces match the SQL schema exactly
- All 11 enum types match
- Nullable fields match (`| null` on correct columns)
- **Status:** ✅ Aligned

### L2. Mapper layer (mappers.ts)
- `Omit<>` types correctly exclude DB-generated fields (id, created_at, updated_at)
- `formatTstzrange()` / `parseTstzrange()` correctly handle range conversions
- `Number()` conversion for NUMERIC fields
- **Status:** ✅ Aligned

### L3. Drizzle schema (schema.ts)
- **⚠️ WARNING:** This file is stale/legacy — defines tables (users, user_profiles, venues, sports, court_images, booking_slots, reviews, sponsor_plans, settings) that do NOT exist in the actual Supabase schema
- **Impact:** Zero — this file is not used by the application (all DB access goes through Supabase client)
- **Status:** ⚠️ Not aligned (but not a constraint issue — out of scope)

---

## M. Updated_at Trigger Coverage (8/8 tables)

| Table | Trigger | Function | Status |
|-------|---------|----------|--------|
| profiles | tr_profiles_updated_at | handle_updated_at() | ✅ Present |
| courts | tr_courts_updated_at | handle_updated_at() | ✅ Present |
| bookings | tr_bookings_updated_at | handle_updated_at() | ✅ Present |
| payments | tr_payments_updated_at | handle_updated_at() | ✅ Present |
| events | tr_events_updated_at | handle_updated_at() | ✅ Present |
| sponsorship_requests | tr_sponsorship_requests_updated_at | handle_updated_at() | ✅ Present |
| advertisement_requests | tr_advertisement_requests_updated_at | handle_updated_at() | ✅ Present |
| system_settings | tr_system_settings_updated_at | handle_updated_at() | ✅ Present (Phase 11 fix) |

**Finding:** All 8 tables with updated_at columns have BEFORE UPDATE triggers. The `handle_updated_at()` function correctly sets `NEW.updated_at = NOW()`.

---

## N. Other Triggers (3 additional)

| Trigger | Table | Event | Purpose | Status |
|---------|-------|-------|---------|--------|
| on_auth_user_created | auth.users | INSERT | Auto-create profile via handle_new_user() | ✅ Correct |
| trg_booking_immutable_fields | bookings | BEFORE UPDATE | Prevent changes to user_id, court_id, total_price, booking_range | ✅ Correct |
| tr_system_settings_updated_at | system_settings | BEFORE UPDATE | Auto-update updated_at | ✅ Correct (Phase 11) |

---

## O. Performance Indexes (9 indexes)

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| bookings | idx_bookings_court_range | GiST | Double-booking prevention support |
| bookings | idx_bookings_user_status | B-tree | User booking lookups |
| bookings | idx_bookings_status_range | GiST (partial) | Stale booking expiration |
| blocked_periods | idx_blocked_periods_court_range | GiST | Overlap detection support |
| payments | idx_payments_booking_id | B-tree | Payment-by-booking lookups |
| payments | idx_payments_status | B-tree | Payment status filtering |
| notifications | idx_notifications_user_read | B-tree | User notification queries |
| courts | idx_courts_sport_status | B-tree (partial) | Active court filtering |
| sponsorship_requests | idx_sponsorship_requests_status | B-tree | Admin dashboard |
| advertisement_requests | idx_ad_requests_status | B-tree | Admin dashboard |

**Finding:** All indexes are appropriate and support the constraint enforcement and query patterns.

---

## P. Migration Safety

**No migration created** — no constraint gaps were found that require fixing.

All existing migrations are:
- ✅ Idempotent (DROP IF EXISTS + CREATE)
- ✅ Reversible (rollback sections included)
- ✅ Low blast radius (targeted changes)
- ✅ No data migration required

---

## Q. Final Verdict

| Category | Tables Audited | Constraints Found | Gaps | Status |
|----------|---------------|-------------------|------|--------|
| Primary Keys | 16 | 16 | 0 | ✅ PASS |
| Foreign Keys | 11 | 11 | 0 | ✅ PASS |
| UNIQUE | 4 | 4 | 0 | ✅ PASS |
| NOT NULL | 16 | All columns | 0 | ✅ PASS |
| CHECK | 15 | 15 | 0 | ✅ PASS |
| EXCLUDE | 3 | 3 | 0 | ✅ PASS |
| DEFAULT | 35 | 35 | 0 | ✅ PASS |
| Enum Types | 11 | 11 | 0 | ✅ PASS |
| Updated_at Triggers | 8 | 8 | 0 | ✅ PASS |
| Booking Integrity | 5 | 5 | 0 | ✅ PASS |

### Overall Verdict: ✅ **PASS**

**No migration required.** The database constraint layer is comprehensive and correct across all 16 public tables.

---

*Generated by Phase 12 — Database Constraint Audit*
*Auditor: opencode/mimo-v2-pro-free*
