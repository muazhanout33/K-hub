import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Booking, BookingResult, CancellationResult, CancellationPolicy, Court, TimeSlot } from '@/types';
import { getInitialBookings, parseHour, areSlotsConsecutive } from '@/services/booking.service';
import { getToday, MAX_BOOKING_HOURS } from '@/lib/dates';
import { validateBookingRequest } from '@/lib/availability';
import { isBookingFullyPast, isSlotCancellable, addDaysToDateString, CANCELLATION_WINDOW_HOURS } from '@/lib/timezone';
import { useBlockedPeriodStore } from '@/features/booking/useBlockedPeriodStore';
import { usePaymentStore } from '@/features/payment/usePaymentStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { createBookingAction, cancelBookingAction, confirmBookingStatusAction, expireStaleBookingsAction, getBookingStatusAction } from '@/app/actions/booking.actions';
import { calculateBookingPrice } from '@/lib/pricing';

// ── Cancellation Policy ──
/** Default cancellation window: 2 hours before slot start. */
const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  cancellationWindowHours: CANCELLATION_WINDOW_HOURS,
};

/**
 * The stored wall-clock start of a booking slot.
 * Post-midnight starts (00:00-05:59) belong to the next calendar day —
 * mirrors formatTstzrange, which writes them to date + 1.
 */
function slotStartWallClock(booking: Booking): { date: string; time: string } {
  const startHour = Number(booking.startTime.split(':')[0]);
  return startHour < 6
    ? { date: addDaysToDateString(booking.date, 1), time: booking.startTime }
    : { date: booking.date, time: booking.startTime };
}

/**
 * Client pre-check: can this booking be cancelled per the policy window?
 * Uses the same Cairo wall-clock helper as the server action
 * (isSlotCancellable) — the server remains authoritative.
 */
function isWithinCancellationWindow(booking: Booking, policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY): boolean {
  const start = slotStartWallClock(booking);
  return isSlotCancellable(start.date, start.time, policy.cancellationWindowHours);
}

// ── Booking time comparison helpers ──

/**
 * Checks if a booking's time slot has fully passed (Africa/Cairo timezone).
 */
function isBookingPast(b: Booking): boolean {
  return isBookingFullyPast(b.date, b.endTime);
}

// ── Centralized price calculation ──
/**
 * Single source of truth for booking price.
 * Returns price in EGP (integer).
 * Payment domain converts to smallest unit (piastres) when creating Payment.amount.
 */
export { calculateBookingPrice } from '@/lib/pricing';

/**
 * Drop any durable pending confirmation when the user changes their
 * selection — a stale confirmation must never hijack a new flow.
 * (`?.` keeps this safe when the payment store is mocked in tests.)
 */
function clearPendingConfirmation(): void {
  usePaymentStore.getState().clearConfirmation?.();
}

export type BookingStep = 1 | 2 | 3 | 4 | 5;

/**
 * Returns all slot IDs that are booked for a given court+date.
 * Used to derive availability dynamically from confirmed bookings.
 */
function getBookedSlotIds(
  courtId: string,
  date: string,
  bookings: Booking[]
): Set<string> {
  const ids = new Set<string>();
  for (const b of bookings) {
    if (b.courtId === courtId && b.date === date && b.status === 'Confirmed') {
      for (const slotId of b.selectedSlotIds) {
        ids.add(slotId);
      }
    }
  }
  return ids;
}

interface BookingStoreState {
  selectedCourt: Court | null;
  selectedDate: string;
  selectedSlots: TimeSlot[];
  bookingStep: BookingStep;

  reservationStartTime: number | null;
  reservationExpiresAt: number | null;
  hasExtendedReservation: boolean;

  userName: string;
  userEmail: string;
  userPhone: string;

  bookings: Booking[];
  /** Increments each time MAX_BOOKING_HOURS is exceeded in toggleSlot. */
  maxHoursReachedTick: number;
  /** Whether a cancellation request is in flight — prevents duplicate clicks. */
  isCancelling: boolean;
  /** Whether Zustand has rehydrated from localStorage. */
  _hasHydrated: boolean;

  selectCourt: (court: Court) => void;
  selectDate: (date: string) => void;
  setSelectedDateOnly: (date: string) => void;
  toggleSlot: (slot: TimeSlot) => void;
  clearSelectedSlots: () => void;
  setBookingStep: (step: BookingStep) => void;
  setUserDetails: (details: { userName: string; userEmail: string; userPhone: string }) => void;
  startTemporaryReservation: () => void;
  extendReservation: () => boolean;
  clearReservation: () => void;
  confirmBooking: () => Promise<BookingResult>;
  confirmBookingAfterPayment: (bookingId: string) => Promise<BookingResult>;
  cancelBooking: (bookingId: string) => Promise<CancellationResult>;
  resetBookingFlow: () => void;
  /** Returns bookings owned by userId. Admin sees all when isAdmin=true. */
  getBookingsForUser: (userId: string, isAdmin: boolean) => Booking[];
  /** Auto-expires Reserved bookings whose end time has passed. Returns count of expired. */
  autoExpireReservedBookings: () => Promise<number>;
}

export const useBookingStore = create<BookingStoreState>()(
  persist(
    (set, get) => ({
      selectedCourt: null,
      selectedDate: getToday(),
      selectedSlots: [],
      bookingStep: 2 as BookingStep,
      reservationStartTime: null,
      reservationExpiresAt: null,
      hasExtendedReservation: false,
      userName: '',
      userEmail: '',
      userPhone: '',
      bookings: getInitialBookings(),
      maxHoursReachedTick: 0,
      isCancelling: false,
      _hasHydrated: false,

      selectCourt: (court) => {
        // A new selection invalidates any pending confirmation attempt —
        // it must never hijack a different booking's flow.
        clearPendingConfirmation();
        set({ selectedCourt: court, selectedSlots: [] });
      },

      selectDate: (date) => {
        clearPendingConfirmation();
        set({ selectedDate: date, selectedSlots: [] });
      },

      setSelectedDateOnly: (date) => {
        clearPendingConfirmation();
        set({ selectedDate: date, selectedSlots: [] });
      },

      toggleSlot: (slot) => {
        const { selectedSlots, selectedCourt, selectedDate, bookings } = get();
        if (!selectedCourt) return;

        // Store performs the final validation — never trust the UI slot status
        const bookedIds = getBookedSlotIds(selectedCourt.id, selectedDate, bookings);
        if (bookedIds.has(slot.id)) return;

        // Check if slot is blocked
        const blockedPeriods = useBlockedPeriodStore.getState().getBlockedPeriodsForCourtDate(selectedCourt.id, selectedDate);
        if (blockedPeriods.some((bp) => bp.date === selectedDate && slot.startTime >= bp.startTime && slot.startTime < bp.endTime)) {
          return;
        }

        const isCurrentlySelected = selectedSlots.some((s) => s.id === slot.id);

        if (isCurrentlySelected) {
          const sorted = [...selectedSlots].sort(
            (a, b) => parseHour(a.startTime) - parseHour(b.startTime)
          );
          const isAtEdge =
            slot.id === sorted[0].id || slot.id === sorted[sorted.length - 1].id;
          if (!isAtEdge) return;
          clearPendingConfirmation();
          set({ selectedSlots: sorted.filter((s) => s.id !== slot.id) });
          return;
        }

        if (selectedSlots.length === 0) {
          clearPendingConfirmation();
          set({ selectedSlots: [slot] });
          return;
        }

        const testSlots = [...selectedSlots, slot];
        if (areSlotsConsecutive(testSlots)) {
          // Enforce MAX_BOOKING_HOURS limit
          const durationHours = testSlots.length;
          if (durationHours > MAX_BOOKING_HOURS) {
            set({ maxHoursReachedTick: get().maxHoursReachedTick + 1 });
            return;
          }
          clearPendingConfirmation();
          set({ selectedSlots: testSlots });
        }
      },

      clearSelectedSlots: () => set({ selectedSlots: [] }),

      setBookingStep: (step) => set({ bookingStep: step }),

      setUserDetails: (details) =>
        set({
          userName: details.userName,
          userEmail: details.userEmail,
          userPhone: details.userPhone,
        }),

      startTemporaryReservation: () => {
        const now = Date.now();
        const tenMinutesMs = 10 * 60 * 1000;
        set({
          reservationStartTime: now,
          reservationExpiresAt: now + tenMinutesMs,
          hasExtendedReservation: false,
        });
      },

      extendReservation: () => {
        const { reservationExpiresAt, hasExtendedReservation } = get();
        if (hasExtendedReservation || !reservationExpiresAt) return false;

        const fiveMinutesMs = 5 * 60 * 1000;
        set({
          reservationExpiresAt: reservationExpiresAt + fiveMinutesMs,
          hasExtendedReservation: true,
        });
        return true;
      },

      clearReservation: () => {
        set({
          selectedSlots: [],
          reservationStartTime: null,
          reservationExpiresAt: null,
          hasExtendedReservation: false,
        });
      },

      confirmBooking: async (): Promise<BookingResult> => {
        const {
          selectedCourt,
          selectedDate,
          selectedSlots,
          userName,
          userEmail,
          userPhone,
          bookings,
        } = get();

        if (!selectedCourt) {
          return { success: false, error: 'No court selected. Please select a court first.' };
        }
        if (selectedSlots.length === 0) {
          return { success: false, error: 'No time slots selected. Please select at least one time slot.' };
        }
        if (!userName || !userEmail) {
          return { success: false, error: 'Please fill in your name and email before confirming.' };
        }

        // Idempotent re-entry: if a confirmation is already pending for an
        // existing booking (retry after refresh/redirect), reuse that
        // booking instead of creating a duplicate reservation.
        const pending = usePaymentStore.getState().pendingConfirmation;
        if (pending?.bookingId) {
          const existing = get().bookings.find((b) => b.id === pending.bookingId);
          if (
            existing &&
            (existing.status === 'Reserved' || existing.status === 'Confirmed')
          ) {
            return { success: true, booking: existing };
          }
          if (!existing) {
            // Not in the local store (e.g. cleared storage / other device):
            // ask the server before ever creating a second booking.
            const fetched = await getBookingStatusAction(pending.bookingId);
            if (fetched.success && fetched.booking) {
              if (
                fetched.booking.status === 'Reserved' ||
                fetched.booking.status === 'Confirmed'
              ) {
                const recovered = fetched.booking;
                set({
                  bookings: [
                    recovered,
                    ...get().bookings.filter((b) => b.id !== recovered.id),
                  ],
                });
                return { success: true, booking: recovered };
              }
              // Server says cancelled/expired/deleted — safe to start fresh.
              clearPendingConfirmation();
            } else {
              // Could not verify (network/auth). Never risk a duplicate
              // booking for a possibly-paid reservation — fail retryably.
              return {
                success: false,
                error:
                  fetched.error ||
                  'Unable to verify your pending booking. Please try again.',
              };
            }
          } else {
            // Cancelled / Expired locally — start fresh.
            clearPendingConfirmation();
          }
        }

        const sorted = [...selectedSlots].sort(
          (a, b) => parseHour(a.startTime) - parseHour(b.startTime)
        );

        const firstSlot = sorted[0];
        const lastSlot = sorted[sorted.length - 1];
        const durationMinutes = selectedSlots.length * 60;
        const totalPrice = calculateBookingPrice(selectedCourt.pricePerHour, durationMinutes);

        // Call Server Action to persist in Supabase
        const result = await createBookingAction({
          courtId: selectedCourt.id,
          date: selectedDate,
          startTime: firstSlot.startTime,
          endTime: lastSlot.endTime,
          durationMinutes,
          totalPrice,
          userName,
          userEmail,
          userPhone,
        });

        if (result.success && result.booking) {
          const newBooking = result.booking;
          newBooking.courtName = selectedCourt.name;
          newBooking.courtImage = selectedCourt.image;
          newBooking.sportType = selectedCourt.sportType;
          newBooking.selectedSlotIds = sorted.map((s) => s.id);

          set({
            bookings: [newBooking, ...bookings],
            // selectedSlots intentionally KEPT: if payment/confirmation
            // fails, the retry UI must still show what the user picked.
            // Cleared on flow success (payment page) and resetBookingFlow.
            reservationStartTime: null,
            reservationExpiresAt: null,
            hasExtendedReservation: false,
            bookingStep: 4,
          });

          // Durable confirmation op: survives refresh/redirect so the
          // payment page can recover and retry confirm-only (never ask
          // the user to pay twice, never create a duplicate booking).
          usePaymentStore.getState().beginConfirmation?.(newBooking.id);

          return { success: true, booking: newBooking };
        }

        return result;
      },

      /**
       * Promotes a Reserved booking to Confirmed after payment succeeds.
       *
       * Idempotent: a booking that is ALREADY confirmed (e.g. a previous
       * retry actually succeeded server-side, or a second click raced)
       * is treated as success — never surfaced as an error, never
       * prompting the user to pay again.
       */
      confirmBookingAfterPayment: async (bookingId: string): Promise<BookingResult> => {
        // M1: Persist status change to Supabase
        const serverResult = await confirmBookingStatusAction(bookingId);
        const alreadyConfirmed =
          !serverResult.success &&
          /booking is already confirmed\./i.test(serverResult.error ?? '');

        if (!serverResult.success && !alreadyConfirmed) {
          return serverResult;
        }

        const { bookings } = get();
        const local = bookings.find((b) => b.id === bookingId);

        let confirmed: Booking | undefined;

        if (local) {
          // Prefer the local (richer: courtName/courtImage/selectedSlotIds)
          // entry, merged with whatever the server returned.
          confirmed = {
            ...(serverResult.booking ?? {}),
            ...local,
            status: 'Confirmed' as const,
            updatedAt: new Date().toISOString(),
          };
        } else if (serverResult.booking) {
          confirmed = {
            ...serverResult.booking,
            status: 'Confirmed' as const,
          };
        } else {
          // "Already confirmed" with no local copy (refresh/other device):
          // recover the booking from the server instead of failing.
          const fetched = await getBookingStatusAction(bookingId);
          if (fetched.success && fetched.booking) {
            confirmed = fetched.booking;
          }
        }

        if (!confirmed) {
          return {
            success: false,
            error: serverResult.error || 'Failed to confirm booking.',
          };
        }

        const updatedBookings = local
          ? bookings.map((b) => (b.id === bookingId ? confirmed! : b))
          : [confirmed, ...bookings];
        set({ bookings: updatedBookings });
        return { success: true, booking: confirmed };
      },

      cancelBooking: async (bookingId: string): Promise<CancellationResult> => {
        const { bookings, isCancelling } = get();

        // Prevent duplicate concurrent requests
        if (isCancelling) {
          return { success: false, error: 'Cancellation already in progress.' };
        }

        const booking = bookings.find((b) => b.id === bookingId);

        if (!booking) {
          return { success: false, error: 'Booking not found.' };
        }

        // Quick client-side pre-check: skip server if already cancelled/expired locally
        if (booking.status === 'Cancelled' || booking.status === 'Expired') {
          return { success: false, error: `Booking is already ${booking.status.toLowerCase()}.` };
        }

        set({ isCancelling: true });

        try {
          // Call Server Action (enforces 2-hour rule server-side)
          const result = await cancelBookingAction(bookingId);

          if (result.success && result.booking) {
            const updatedBookings = bookings.map((b) =>
              b.id === bookingId
                ? { ...b, status: 'Cancelled' as const, updatedAt: new Date().toISOString() }
                : b
            );
            set({ bookings: updatedBookings, isCancelling: false });
            return { success: true, booking: updatedBookings.find((b) => b.id === bookingId)! };
          }

          set({ isCancelling: false });
          return result;
        } catch (err) {
          set({ isCancelling: false });
          return { success: false, error: err instanceof Error ? err.message : 'Failed to cancel booking.' };
        }
      },

      getBookingsForUser: (userId: string, isAdmin: boolean): Booking[] => {
        const { autoExpireReservedBookings } = get();
        // Auto-expire stale Reserved bookings before returning
        autoExpireReservedBookings();
        const freshBookings = get().bookings;
        // Admin sees all bookings, regular user sees only their own
        return isAdmin ? freshBookings : freshBookings.filter((b) => b.userId === userId);
      },

      autoExpireReservedBookings: async (): Promise<number> => {
        // M2: Persist stale reservation expiry to Supabase
        await expireStaleBookingsAction();

        // Also update local store
        const { bookings } = get();
        let expiredCount = 0;
        const updatedBookings = bookings.map((b) => {
          if (b.status === 'Reserved' && isBookingPast(b)) {
            expiredCount++;
            return { ...b, status: 'Expired' as const, updatedAt: new Date().toISOString() };
          }
          return b;
        });
        if (expiredCount > 0) {
          set({ bookings: updatedBookings });
        }
        return expiredCount;
      },

      resetBookingFlow: () => {
        // A fresh flow must not inherit a stale confirmation attempt.
        clearPendingConfirmation();
        set({
          selectedCourt: null,
          selectedDate: getToday(),
          selectedSlots: [],
          bookingStep: 2,
          reservationStartTime: null,
          reservationExpiresAt: null,
          hasExtendedReservation: false,
          userName: '',
          userEmail: '',
          userPhone: '',
        });
      },
    }),
    {
      name: 'khub-booking-storage',
      version: 5,
      migrate: (persisted: unknown, version: number) => {
        const old = persisted as Record<string, unknown>;
        if (version < 2) {
          return { ...old, bookings: getInitialBookings(), selectedSlots: [] };
        }
        // v2 → v3: stamp userId on legacy bookings that have empty userId
        if (version < 3 && Array.isArray(old.bookings)) {
          const migrated = (old.bookings as Record<string, unknown>[]).map((b) => ({
            ...b,
            userId: b.userId ?? '',
          }));
          return { ...old, bookings: migrated };
        }
        // v3 → v4: stamp updatedAt on legacy bookings that lack it
        if (version < 4 && Array.isArray(old.bookings)) {
          const migrated = (old.bookings as Record<string, unknown>[]).map((b) => ({
            ...b,
            updatedAt: b.updatedAt ?? b.createdAt ?? new Date().toISOString(),
          }));
          return { ...old, bookings: migrated };
        }
        // v4 → v5: stamp bookingSource on legacy bookings that lack it
        if (version < 5 && Array.isArray(old.bookings)) {
          const migrated = (old.bookings as Record<string, unknown>[]).map((b) => ({
            ...b,
            bookingSource: b.bookingSource ?? 'ONLINE',
          }));
          return { ...old, bookings: migrated };
        }
        return persisted;
      },
      partialize: (state) => ({
        bookings: state.bookings,
        reservationStartTime: state.reservationStartTime,
        reservationExpiresAt: state.reservationExpiresAt,
        hasExtendedReservation: state.hasExtendedReservation,
        bookingStep: state.bookingStep,
        selectedCourt: state.selectedCourt,
        selectedDate: state.selectedDate,
        selectedSlots: state.selectedSlots,
        userName: state.userName,
        userEmail: state.userEmail,
        userPhone: state.userPhone,
      }),
      skipHydration: true,
    }
  )
);
