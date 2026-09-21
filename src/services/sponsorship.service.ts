import {
  SponsorshipRequest,
  SponsorshipResult,
  SponsorshipTargetType,
  SponsorshipPricingType,
} from '@/types';
import { CLUB_TARGET_ID, FACILITY_AREAS } from '@/lib/sponsorship-data';

// ──────────────────────────────────────────────
// MOCK DATA — single source of truth for sponsorship requests
// Managed via useSponsorshipStore — do not access this array directly from UI.
// ──────────────────────────────────────────────

const SPONSORSHIP_REQUESTS: SponsorshipRequest[] = [];

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

function generateId(): string {
  return `spnreq-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ──────────────────────────────────────────────
// TARGET VALIDATION
// ──────────────────────────────────────────────

/**
 * Validates that a (targetType, targetId) pair references a real entity.
 *
 * Club         → targetId must equal CLUB_TARGET_ID
 * Court        → targetId must exist in Supabase courts table
 * FacilityArea → targetId must be in FACILITY_AREAS
 *
 * Returns null on success, or an error string describing the failure.
 */
async function validateTarget(targetType: SponsorshipTargetType, targetId: string): Promise<string | null> {
  if (!targetId || targetId.trim().length === 0) {
    return 'Target ID is required.';
  }

  switch (targetType) {
    case 'Club':
      if (targetId !== CLUB_TARGET_ID) {
        return `Invalid club target ID. Expected '${CLUB_TARGET_ID}'.`;
      }
      break;

    case 'Court': {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data } = await supabase
        .from('courts')
        .select('id')
        .eq('id', targetId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!data) {
        return `Court '${targetId}' does not exist in the system.`;
      }
      break;
    }

    case 'FacilityArea':
      if (!FACILITY_AREAS.includes(targetId)) {
        return `Facility area '${targetId}' is not available. Valid areas: ${FACILITY_AREAS.join(', ')}.`;
      }
      break;

    default:
      return `Unknown target type: ${targetType}.`;
  }

  return null;
}

// ──────────────────────────────────────────────
// CREATE SPONSORSHIP REQUEST
// ──────────────────────────────────────────────

export interface CreateSponsorshipRequestInput {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  targetType: SponsorshipTargetType;
  targetId: string;
  proposedAmount: number;
  currency?: string;
  pricingType: SponsorshipPricingType;
  requestedBenefits: string[];
  requestedPlacement: string[];
  message?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Creates a new SponsorshipRequest in Pending status.
 *
 * Validates (in order):
 *  1. Required fields: companyName, contactName, phone
 *  2. Email format
 *  3. Target type + target ID validity (see validateTarget)
 *  4. proposedAmount is a positive number
 *  5. pricingType is provided
 *
 * Returns SponsorshipResult with the created request or an error.
 * Components must call this via useSponsorshipStore — never directly.
 */
export async function createSponsorshipRequest(data: CreateSponsorshipRequestInput): Promise<SponsorshipResult> {
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

  // ── Validation 3: target ──
  if (!data.targetType) {
    return { success: false, error: 'Sponsorship target type is required.' };
  }
  const targetError = await validateTarget(data.targetType, data.targetId);
  if (targetError) {
    return { success: false, error: targetError };
  }

  // ── Validation 4: proposed amount ──
  if (!data.proposedAmount || !isFinite(data.proposedAmount) || data.proposedAmount <= 0) {
    return { success: false, error: 'Proposed amount must be a positive number.' };
  }

  // ── Validation 5: pricing type ──
  if (!data.pricingType) {
    return { success: false, error: 'Pricing type is required.' };
  }

  // ── Create request ──
  const ts = nowISO();
  const request: SponsorshipRequest = {
    id: generateId(),
    companyName,
    contactName,
    email,
    phone,
    targetType: data.targetType,
    targetId: data.targetId,
    proposedAmount: data.proposedAmount,
    currency: data.currency || 'EGP',
    pricingType: data.pricingType,
    requestedBenefits: data.requestedBenefits ?? [],
    requestedPlacement: data.requestedPlacement ?? [],
    approvedBenefits: [], // always empty in Phase 6 — no dashboard to set it
    message: data.message?.trim() || undefined,
    status: 'Pending',
    isActive: false, // never active without approval — enforced here
    startDate: data.startDate || undefined,
    endDate: data.endDate || undefined,
    createdAt: ts,
    updatedAt: ts,
  };

  SPONSORSHIP_REQUESTS.unshift(request);

  return { success: true, request };
}

// ──────────────────────────────────────────────
// QUERY FUNCTIONS
// ──────────────────────────────────────────────

/**
 * Returns only Approved + isActive requests for the public /sponsors page.
 *
 * In Phase 6 this will always return [] (nothing can be approved without
 * a dashboard — that is the correct expected default state).
 */
export function getPublicSponsors(): SponsorshipRequest[] {
  return SPONSORSHIP_REQUESTS.filter(
    (r) => r.status === 'Approved' && r.isActive === true
  );
}

/**
 * Returns all sponsorship requests.
 * Used by useSponsorshipStore to sync its persisted state into this
 * in-memory array after rehydration from localStorage.
 */
export function getAllSponsorshipRequests(): SponsorshipRequest[] {
  return [...SPONSORSHIP_REQUESTS];
}

/**
 * Replaces the in-memory array with the store's rehydrated data.
 * Called once by useSponsorshipStore after persist.rehydrate() completes.
 * This keeps the service-layer array in sync with persisted state.
 */
export function syncSponsorshipRequests(requests: SponsorshipRequest[]): void {
  SPONSORSHIP_REQUESTS.length = 0;
  for (const r of requests) {
    SPONSORSHIP_REQUESTS.push(r);
  }
}
