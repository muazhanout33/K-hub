# SECURITY HARDENING PLAN — Phase 22.19.1

## Overview
Based on inspection of the current K-HUB Sports Club codebase, this plan identifies security gaps and specifies the minimal safe fix for each.

**Generated**: Phase 22.19.1 TASK 1 Audit Complete  
**Baseline**: 68/68 security tests passing (Phase 22.19)

---

## Findings Table

| Area | Current State | Finding | Proposed Fix | Risk |
|------|--------------|---------|--------------|------|
| **HSTS** | No `Strict-Transport-Security` header in `next.config.ts` (lines 17-24) | Browsers won't enforce HTTPS, vulnerable to SSL stripping | Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` header. Production-only (skip dev). | Low — header only, no behavior change |
| **Admin 500** | `useAdminGuard` hook (`src/hooks/useAdminGuard.ts`) is client-side only. `/admin` page (`src/app/admin/page.tsx`) has no server-side role enforcement. Middleware only refreshes session. | When a non-admin user's session is valid but RLS denies admin data, the page throws unhandled error → HTTP 500 | Wrap admin data fetch in try/catch, return safe 403-style response. Show user-friendly "Access Denied" instead of 500. | Low — error handling only |
| **Booking Rate Limit** | No rate limiting on `POST /api/bookings` (`src/app/api/bookings/route.ts`). Supabase RLS + EXCLUDE constraint prevent abuse. | An authenticated user could flood booking creation. No app-level throttle. | Add simple in-memory rate limit (Map<IP, count>) — 10 bookings per 5 min per IP. Skip if no risk tolerance. | Low — additive only |
| **Notification Auth** | `notification.actions.ts` accepts `userId` from caller with NO auth check. `contact.actions.ts` is anonymous INSERT (by design). | Notification server actions trust caller-supplied userId. RLS is only barrier. If RLS is misconfigured, any user could create notifications for any user. | No change needed — this is the intended design per the original architecture. RLS is the correct defense layer. | N/A |
| **CSP** | `script-src 'self' 'unsafe-inline' 'unsafe-eval'` in `next.config.ts` line 8 | `unsafe-inline` and `unsafe-eval` weaken CSP. However, Next.js requires both for hydration and inline scripts. | No change — `unsafe-inline` is required by Next.js 16. `unsafe-eval` is required by React 19. Removing either breaks the app. Document as accepted risk. | N/A |
| **CSRF** | No explicit CSRF tokens. Server Actions use Next.js built-in CSRF protection (Origin header check). API routes use Supabase JWT auth. | Low risk — Supabase JWT auth is not vulnerable to CSRF. Server Actions have built-in protection. | No change needed. Document as acceptable. | N/A |
| **XSS** | No `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, `new Function`, `document.write` found in `src/`. React auto-escapes all JSX output. | No XSS sinks found. React's default escaping is sufficient defense. | No change needed. Document as clean. | N/A |
| **Cookie Session** | Supabase cookies are NOT HttpOnly — by design. JS client reads JWT for API Authorization headers. | This is documented behavior in `@supabase/ssr`. The JWT contains only user identity, not sensitive data. RLS is the actual defense. | No change needed. Document as accepted design. | N/A |
| **Contact Rate Limit** | `contact.actions.ts` allows anonymous INSERT to `contact_submissions` table. | Could be abused for spam. Supabase RLS allows anonymous insert by design. | No change — contact form spam is low-risk. Could add rate limit later if needed. | N/A |

---

## Implementation Plan (Priority Order)

### 1. HSTS Header (Quick Win)
**File**: `next.config.ts`  
**Change**: Add `Strict-Transport-Security` to `headers()` array. Production only (check `NODE_ENV`).

### 2. Admin 500 Fix (User Impact)
**File**: `src/app/admin/page.tsx`  
**Change**: Wrap data fetch in try/catch. Display "Access Denied" toast instead of crashing. Return null gracefully.

### 3. Booking Rate Limit (Defense in Depth)
**File**: `src/app/api/bookings/route.ts`  
**Change**: Add simple in-memory rate limiter using `Map<string, { count: number; resetAt: number }>`. 10 requests per 5 min per IP. Return 429 if exceeded.

### 4. Documentation (Accept Risks)
**Files**: `SECURITY-HARDENING-22-19-1.md` final report  
**Action**: Document accepted risks: CSP `unsafe-inline`/`unsafe-eval`, cookie not HttpOnly, notification auth design.

---

## Files to Modify

| File | Change | Risk Level |
|------|--------|------------|
| `next.config.ts` | Add HSTS header (production only) | Low |
| `src/app/admin/page.tsx` | Add try/catch + safe error display | Low |
| `src/app/api/bookings/route.ts` | Add rate limiter (optional) | Low |
| `SECURITY-HARDENING-22-19-1.md` | Final report | None |

## Files NOT Modified (Documented as Acceptable)

| File | Reason |
|------|--------|
| `src/middleware.ts` | Session refresh only — correct design |
| `src/hooks/useAdminGuard.ts` | Client-side guard — page.tsx handles error display |
| `src/app/actions/notification.actions.ts` | RLS is correct defense layer |
| `src/app/actions/contact.actions.ts` | Anonymous insert by design |
| `src/lib/supabase/server.ts` | No changes needed |
| `src/lib/supabase/client.ts` | No changes needed |
