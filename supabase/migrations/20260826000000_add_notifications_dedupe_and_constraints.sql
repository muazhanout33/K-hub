-- Migration: Add dedupe_key, CHECK constraints, and indexes to notifications table
-- Phase 9: Duplicate protection via dedupe_key unique index
-- Phase 10: Content validation CHECK constraints on type, title, message

-- 1. Add dedupe_key column (nullable initially for existing rows)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255);

-- 2. Unique index on dedupe_key (partial: only non-null values)
-- This prevents duplicate notifications for the same event (e.g., booking_confirmed:booking-id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- 3. CHECK constraint: type must be a known value
ALTER TABLE notifications
  ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'booking_confirmed', 'booking_cancelled', 'booking_expired',
    'booking_reminder', 'booking_time_changed',
    'payment_successful', 'payment_refunded',
    'subscription_expiring', 'promo_offer',
    'court_full', 'checkout_stuck',
    'new_subscription', 'new_booking', 'info'
  ));

-- 4. CHECK constraint: title must be non-empty after trimming
ALTER TABLE notifications
  ADD CONSTRAINT chk_notifications_title_not_empty
  CHECK (length(trim(title)) > 0);

-- 5. CHECK constraint: message must be non-empty after trimming
ALTER TABLE notifications
  ADD CONSTRAINT chk_notifications_message_not_empty
  CHECK (length(trim(message)) > 0);

-- 6. CHECK constraint: title max 255 chars
ALTER TABLE notifications
  ADD CONSTRAINT chk_notifications_title_length
  CHECK (length(title) <= 255);

-- 7. CHECK constraint: message max 2000 chars
ALTER TABLE notifications
  ADD CONSTRAINT chk_notifications_message_length
  CHECK (length(message) <= 2000);
