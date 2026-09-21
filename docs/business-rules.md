# 📖 Business Rules

## Overview

This document defines the business logic, validation rules, booking flow, and system behavior for the K-HUB Sports Club Booking Platform.

These rules must always be enforced regardless of the user interface.

---

# Booking Status

Every booking can have one of the following statuses:

- Available
- Reserved
- Confirmed
- Expired
- Cancelled

Each status has specific behavior and validation rules.

---

# Time Slot Rules

## Available

The slot is free and can be booked.

Users can:

- Select the slot.
- Start the booking process.

---

## Reserved

The slot is temporarily locked by another user.

Reserved slots:

- Cannot be selected.
- Cannot be booked.
- Display a reservation indicator.

---

## Confirmed

The booking has been completed successfully.

Confirmed slots:

- Cannot be modified.
- Cannot be booked again.
- Are permanently unavailable for that date and time.

---

## Expired

Temporary reservation has expired.

The slot immediately returns to Available.

---

## Cancelled

The booking has been cancelled.

The slot becomes Available again according to the club cancellation policy.

---

# Booking Process

The booking process follows the sequence below:

Choose Court

↓

Choose Date

↓

Choose Available Time Slot

↓

Temporary Reservation

↓

User Authentication (If Required)

↓

Booking Confirmation

↓

Booking Saved

---

# Temporary Reservation

When a user selects an available slot:

- Slot status becomes Reserved.
- Reservation duration is exactly 10 minutes.
- Countdown timer starts immediately.
- No other user may reserve the same slot.
- Reservation belongs only to the current user.

---

# Reservation Extension

Users may extend their reservation only once.

Extension Rules:

- Maximum one extension.
- Extension duration is 5 minutes.
- Extension must occur before the reservation expires.
- No additional extensions are allowed.

---

# Reservation Expiration

If the countdown reaches zero:

- Reservation status becomes Expired.
- Slot becomes Available.
- Booking process is cancelled.
- Countdown stops.
- User must start booking again.

---

# Booking Confirmation

When booking is confirmed:

- Reservation converts into Confirmed.
- Countdown stops.
- Booking is stored.
- Slot becomes unavailable.

---

# Booking Validation

Before confirming a booking, the system validates:

- User is authenticated.
- Court exists.
- Date exists.
- Time exists.
- Slot is still available.
- Booking duration is valid.
- No conflicts exist.

If validation fails, booking must not be created.

---

# Duplicate Booking Prevention

The system must never allow:

- Two confirmed bookings for the same slot.
- Two reservations for the same slot.
- Overlapping bookings.

---

# Date Rules

Users cannot:

- Book past dates.
- Book unavailable dates.
- Book closed days.

---

# Time Rules

Users cannot:

- Book outside club working hours.
- Book invalid time ranges.
- Book overlapping time periods.

---

# Court Rules

A booking must always belong to:

- One Court
- One User

A court may have multiple bookings throughout the day, but never during the same time slot.

---

# Booking Duration Rules

Booking duration follows club policy.

Supported durations may include:

- 60 Minutes
- 90 Minutes
- 120 Minutes

Duration must remain configurable.

---

# User Rules

Guests:

- Cannot create bookings.

Authenticated users:

- Can create bookings.
- Can view booking history.
- Can cancel bookings according to club policy.

---

# Calendar Rules

The calendar must always display:

Available

Reserved

Confirmed

The calendar should update immediately whenever booking status changes.

---

# Live Availability

Availability must update in real time.

Changes include:

- New Reservation
- Booking Confirmation
- Reservation Expiration
- Booking Cancellation

Users should never need to refresh the page.

---

# Booking Summary

Before confirmation the system displays:

- Court Name
- Date
- Start Time
- End Time
- Duration
- Price

The user must review the summary before confirming.

---

# Notifications

The platform should notify users when:

- Reservation Started
- Reservation Extended
- Reservation Expired
- Booking Confirmed
- Booking Cancelled
- Login Required
- Booking Failed

---

# Error Handling

The platform must gracefully handle:

- Network Failure
- Invalid Booking
- Invalid Date
- Invalid Time
- Court Not Found
- Booking Conflict
- Session Expired

Users should always receive clear messages.

---

# Edge Cases

## Two Users Reserve the Same Slot

Only the first successful reservation is accepted.

The second user receives:

"This time slot is no longer available."

---

## Reservation Expires

Reservation automatically expires.

Slot becomes Available immediately.

---

## User Refreshes the Page

If reservation is still active:

- Countdown continues.
- Reservation remains active.

---

## User Closes Browser

Reservation remains active until timer expires.

---

## User Opens Multiple Tabs

Reservation belongs to the same authenticated user.

The booking state must remain synchronized across all open tabs.

---

## Internet Connection Lost

The platform should:

- Inform the user.
- Attempt to reconnect.
- Synchronize booking status after reconnecting.

---

## Browser Back Button

Going back should never create duplicate bookings.

---

## Midnight Crossing

Bookings cannot cross into unavailable operating hours unless explicitly supported by club rules.

---

## Server Validation

Every booking request must be validated on the server before confirmation.

Client-side validation alone is never sufficient.

---

# Business Constraints

The system must always guarantee:

- Data consistency.
- Booking integrity.
- No duplicate bookings.
- Accurate availability.
- Reliable reservation timing.

Business rules always take priority over UI behavior.

Any interface interacting with the booking system must respect these rules.
