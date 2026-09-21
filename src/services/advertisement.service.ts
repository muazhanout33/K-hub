import { AdvertisingSpace, AdvertisementRequest, AdvertisementRequestResult } from '@/types';
import { ADVERTISING_SPACES } from '@/lib/advertisement-data';

// ──────────────────────────────────────────────
// MOCK DATA — single source of truth for advertisement requests
// Managed via useAdvertisementStore — do not access this array directly from UI.
// ──────────────────────────────────────────────

const ADVERTISEMENT_REQUESTS: AdvertisementRequest[] = [];

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

function generateId(): string {
  return `adreq-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Checks whether two date ranges overlap.
 *
 * Uses the standard half-open interval test:
 *   rangeA.start < rangeB.end  AND  rangeA.end > rangeB.start
 *
 * ISO date strings (YYYY-MM-DD) compare correctly as plain strings.
 */
function datesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA < endB && endA > startB;
}

// ──────────────────────────────────────────────
// QUERY FUNCTIONS
// ──────────────────────────────────────────────

/**
 * Returns advertising spaces that are commercially offered (isAvailable = true).
 * Whether a specific date range is free is determined separately by overlap check.
 */
export function getAvailableAdvertisingSpaces(): AdvertisingSpace[] {
  return ADVERTISING_SPACES.filter((s) => s.isAvailable);
}

/** Returns a single advertising space by ID, or undefined if not found. */
export function getAdvertisingSpace(id: string): AdvertisingSpace | undefined {
  return ADVERTISING_SPACES.find((s) => s.id === id);
}

/** Returns all advertisement requests. Used by useAdvertisementStore for sync. */
export function getAllAdvertisementRequests(): AdvertisementRequest[] {
  return [...ADVERTISEMENT_REQUESTS];
}

/**
 * Replaces the in-memory array with the store's rehydrated data.
 * Called once by useAdvertisementStore after persist.rehydrate() completes.
 */
export function syncAdvertisementRequests(requests: AdvertisementRequest[]): void {
  ADVERTISEMENT_REQUESTS.length = 0;
  for (const r of requests) {
    ADVERTISEMENT_REQUESTS.push(r);
  }
}

// ──────────────────────────────────────────────
// CREATE ADVERTISEMENT REQUEST
// ──────────────────────────────────────────────

export interface CreateAdvertisementRequestInput {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  advertisingSpaceId: string;
  startDate: string;
  endDate: string;
  proposedBudget: number;
  bannerReference?: string;
  notes?: string;
}

/**
 * Creates a new AdvertisementRequest in Pending status.
 *
 * Validates (in order):
 *  1. Required fields: companyName, contactName, phone
 *  2. Email format
 *  3. advertisingSpaceId exists AND isAvailable = true
 *  4. startDate is provided
 *  5. endDate is provided AND strictly after startDate
 *  6. proposedBudget is a positive number
 *  7. No overlapping date range for the same space with status Pending or Approved
 *
 * Returns AdvertisementRequestResult with the created request or an error.
 * Components must call this via useAdvertisementStore — never directly.
 */
export function createAdvertisementRequest(
  data: CreateAdvertisementRequestInput
): AdvertisementRequestResult {
  const companyName = data.companyName?.trim();
  const contactName = data.contactName?.trim();
  const email = data.email?.trim().toLowerCase();
  const phone = data.phone?.trim();

  // ── Validation 1: required text fields ──
  if (!companyName) {
    return { success: false, error: 'Company name is required.' };
  }
  if (!contactName) {
    return { success: false, error: 'Contact name is required.' };
  }
  if (!phone) {
    return { success: false, error: 'Phone number is required.' };
  }

  // ── Validation 2: email format ──
  if (!email) {
    return { success: false, error: 'Email address is required.' };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  // ── Validation 3: space must exist and be commercially available ──
  if (!data.advertisingSpaceId) {
    return { success: false, error: 'An advertising space must be selected.' };
  }
  const space = getAdvertisingSpace(data.advertisingSpaceId);
  if (!space) {
    return {
      success: false,
      error: `Advertising space '${data.advertisingSpaceId}' does not exist.`,
    };
  }
  if (!space.isAvailable) {
    return {
      success: false,
      error: `"${space.name}" is not currently available for advertising. Please choose a different space.`,
    };
  }

  // ── Validation 4: startDate required ──
  if (!data.startDate) {
    return { success: false, error: 'Start date is required.' };
  }

  // ── Validation 5: endDate required and after startDate ──
  if (!data.endDate) {
    return { success: false, error: 'End date is required.' };
  }
  if (data.endDate <= data.startDate) {
    return {
      success: false,
      error: 'End date must be after start date.',
    };
  }

  // ── Validation 6: proposed budget must be positive ──
  if (!data.proposedBudget || !isFinite(data.proposedBudget) || data.proposedBudget <= 0) {
    return { success: false, error: 'Proposed budget must be a positive number.' };
  }

  // ── Validation 7: overlap check — mirrors court double-booking prevention ──
  // Rejected and Cancelled requests do NOT block new requests (same reasoning as
  // the court booking system where only Confirmed/Reserved bookings block slots).
  const overlapping = ADVERTISEMENT_REQUESTS.find(
    (r) =>
      r.advertisingSpaceId === data.advertisingSpaceId &&
      (r.status === 'Pending' || r.status === 'Approved') &&
      datesOverlap(data.startDate, data.endDate, r.startDate, r.endDate)
  );

  if (overlapping) {
    return {
      success: false,
      error: `This space already has a ${overlapping.status.toLowerCase()} request for overlapping dates (${overlapping.startDate} to ${overlapping.endDate}). Please choose different dates.`,
    };
  }

  // ── Create request ──
  const ts = nowISO();
  const request: AdvertisementRequest = {
    id: generateId(),
    companyName,
    contactName,
    email,
    phone,
    advertisingSpaceId: data.advertisingSpaceId,
    startDate: data.startDate,
    endDate: data.endDate,
    proposedBudget: data.proposedBudget,
    bannerReference: data.bannerReference?.trim() || undefined,
    notes: data.notes?.trim() || undefined,
    status: 'Pending',
    createdAt: ts,
    updatedAt: ts,
  };

  ADVERTISEMENT_REQUESTS.unshift(request);

  return { success: true, request };
}
