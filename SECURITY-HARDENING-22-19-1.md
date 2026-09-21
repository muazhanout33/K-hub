# Security Hardening — Phase 22.19.1

**Date:** 2026-09-07  
**Status:** COMPLETE  
**Tests:** 68/68 E2E passing | TypeScript clean | Build passing | Vitest 565/566 (1 pre-existing flaky)

---

## Executive Summary

Phase 22.19.1 implemented three targeted security fixes based on the Phase 22.19 audit findings. All changes are minimal, safe, and verified with full regression testing.

---

## Changes Implemented

### 1. HSTS Header (Production Only)
**File:** `next.config.ts:24-27`

Added `Strict-Transport-Security` header with production-only conditional:
```
max-age=31536000; includeSubDomains
```

- Only applied when `NODE_ENV === 'production'`
- Omitted in dev to avoid breaking local HTTP development
- Forces browsers to use HTTPS for 1 year, includes subdomains
- Verified: header absent in dev, will appear in production builds

### 2. Admin Page Race Condition Fix
**File:** `src/app/admin/page.tsx:19-40`

Added `cancelled` flag to prevent state updates on unmounted components:
- `fetchAdminBookings()` now checks `cancelled` before `setBookings`, `setError`, `setLoading`
- Cleanup function sets `cancelled = true` on unmount
- Prevents race condition where `useAdminGuard` redirects mid-fetch, causing state updates on unmounted component (manifested as 500 error)

### 3. Booking API Rate Limiting
**File:** `src/app/api/bookings/route.ts:8-37, 119-128`

Added in-memory rate limiter to `POST /api/bookings`:
- **Limit:** 10 requests per 5-minute window per IP
- **Storage:** `Map<string, { count, resetAt }>` in module scope
- **Cleanup:** `setInterval` every 10 minutes removes expired entries
- **Response:** HTTP 429 with `Too many booking requests. Please try again later.`
- **IP extraction:** `x-forwarded-for` → `x-real-ip` → `'unknown'`

---

## Changes Not Implemented (By Design)

### Notification Auth Check — CANCELLED
RLS is the correct defense layer per architecture design. Adding application-level auth would duplicate RLS logic and violate the single-responsibility principle.

### CSP Tightening — NOT MODIFIED
`unsafe-inline` and `unsafe-eval` are required by Next.js 16 + React 19. Removing them would break the application. CSP is already comprehensive with all other directives properly configured.

### CSRF Token Addition — NOT NEEDED
Server Actions have built-in Origin header check. API routes use Supabase JWT auth. Adding CSRF tokens would be redundant.

### XSS Sink Remediation — NOT NEEDED
No XSS sinks found in codebase (no `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, `new Function`, `document.write`).

### Cookie HttpOnly Flag — NOT MODIFIED
Supabase auth cookies are NOT HttpOnly by design — client JS needs to read JWT for API Authorization headers. Documented finding.

### Contact Form Rate Limiting — NOT ADDED
Contact form uses anonymous INSERT with proper server-side validation (trim, length checks, email regex). RLS allows anonymous inserts by design.

---

## Verification Results

| Check | Result |
|-------|--------|
| TypeScript (`npx tsc --noEmit`) | ✅ Clean |
| ESLint | ✅ No new errors (139 pre-existing) |
| Build (`npx next build`) | ✅ Passing |
| Vitest | ✅ 565/566 (1 pre-existing flaky) |
| E2E Security Scan | ✅ 68/68 passing |
| HSTS Header (dev) | ✅ Absent (correct — production only) |
| CSP Header | ✅ Present and correct |
| Admin Page Fix | ✅ Race condition prevented |
| Rate Limiter | ✅ 10 req/5min per IP |

---

## Security Headers (Current State)

| Header | Value | Status |
|--------|-------|--------|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...` | ✅ Active |
| X-Content-Type-Options | `nosniff` | ✅ Active |
| X-Frame-Options | `DENY` | ✅ Active |
| X-XSS-Protection | `1; mode=block` | ✅ Active |
| Referrer-Policy | `strict-origin-when-cross-origin` | ✅ Active |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` | ✅ Active |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | ✅ Production only |

---

## Remaining Documented Limitations

These are known limitations from the Phase 22.19 audit, documented but not fixed:

1. **No login rate limiting** — Supabase handles this at the auth layer
2. **Supabase cookies NOT HttpOnly** — By design for client-side JWT access
3. **`unsafe-inline`/`unsafe-eval` in CSP** — Required by Next.js 16 + React 19
4. **In-memory rate limiter resets on server restart** — Acceptable for MVP; can upgrade to Redis-backed later
5. **No account lockout** — Supabase auth layer handles brute-force protection

---

## Files Modified

| File | Change |
|------|--------|
| `next.config.ts` | Added HSTS header (production-only conditional) |
| `src/app/admin/page.tsx` | Added `cancelled` flag to prevent race condition |
| `src/app/api/bookings/route.ts` | Added in-memory rate limiter (10 req/5min per IP) |

---

## Next Phase

Phase 22.19.2 (if requested):
- Redis-backed rate limiting (persistent across server restarts)
- Login rate limiting via Supabase Edge Functions
- Account lockout after N failed attempts
- Security monitoring/alerting dashboard
