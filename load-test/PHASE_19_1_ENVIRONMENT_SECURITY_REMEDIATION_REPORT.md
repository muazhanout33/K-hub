# Phase 19.1 — Environment Security Findings Remediation Report

**Date:** 2026-08-28  
**Auditor:** OpenCode AI Agent  
**Scope:** Remediate all Phase 19 Environment Audit findings — hardcoded fallbacks + missing security headers  
**No feature/logic/DB changes** — only security hardening

---

## 1. Summary

| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| Hardcoded fallback URLs in scripts | MEDIUM | ✅ Fixed | Removed all `|| 'default'` fallbacks; env-only with guard validation |
| Missing security headers in `next.config.ts` | MEDIUM | ✅ Fixed | Added 6 HTTP security headers via `async headers()` |
| Supabase anon key in `.next/` build output | LOW | ⏭️ Intentional | `NEXT_PUBLIC_*` = public by design. Service-role key NOT leaked. Safe. |
| Service-role key in scripts only | LOW | ⏭️ Verified | Not in `.env.example`, not in build output, not in git |
| No `.git` directory | INFO | ⏭️ Documented | Project has no Git history; cannot audit historical commits |

**Final Verdict:** ✅ PASS — All actionable findings remediated. No regressions.

---

## 2. Files Modified

### 2.1 `next.config.ts` — Security Headers (rewritten)

Added 6 HTTP security headers via Next.js `async headers()`:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | See §2.1.1 | Prevents XSS, data injection, clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking (frame embedding) |
| `X-XSS-Protection` | `1; mode=block` | Defense-in-depth for legacy browsers |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables unnecessary browser features |

**Header application:** `async headers()` with `source: '/(.*)'` — applies to all routes including API.

#### 2.1.1 Content Security Policy Breakdown

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' https://images.unsplash.com data: blob:;
frame-src https://www.google.com;
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none'
```

**Rationale for `unsafe-inline` / `unsafe-eval`:**
- `unsafe-inline` scripts/styles required by Next.js hydration and Tailwind CSS runtime
- `unsafe-eval` required by Next.js Turbopack bundler in dev mode
- No analytics, no tracking scripts, no third-party JS — this is the safest practical config

**External resources permitted:**
| Resource | Directive | Justification |
|----------|-----------|---------------|
| `images.unsplash.com` | `img-src` | Court/hero images in `mock-data.ts` |
| `fonts.googleapis.com` | `style-src` | Google Fonts CSS import in `globals.css` |
| `fonts.gstatic.com` | `font-src` | Google Fonts font files |
| `www.google.com` | `frame-src` | Google Maps embed on `/contact` page |
| `*.supabase.co` | `connect-src` | API calls + WebSocket realtime |

**Intentionally omitted:**
- `HSTS` — Would break local HTTP development on `localhost:3000`
- `Strict-DSP` — Not yet supported by all browsers; `frame-src` + `frame-ancestors` sufficient

---

### 2.2 `scripts/test-double-booking.ts` — Hardcoded Fallbacks Removed

**Before:**
```ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'default';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'default';
const testEmail = process.env.TEST_USER_EMAIL || 'default@test.com';
const testPassword = process.env.TEST_USER_PASSWORD || 'defaultpassword';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'default';
```

**After:**
```ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const testEmail = process.env.TEST_USER_EMAIL ?? '';
const testPassword = process.env.TEST_USER_PASSWORD ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const testCourtId = process.env.TEST_COURT_ID ?? '';
```

**Guard validation (all 6 vars):**
```ts
if (!supabaseUrl || !supabaseAnonKey || !testEmail || !testPassword || !supabaseServiceKey || !testCourtId) {
  console.error('❌ Missing env vars. Copy .env.example → .env.local and fill all 6 values.');
  process.exit(1);
}
```

---

### 2.3 `scripts/seed-courts.mjs` — Hardcoded URL Removed

**Before:**
```js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bwwifvuerhxgjeoochnp.supabase.co';
```

**After:**
```js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL in .env.local');
  process.exit(1);
}
```

---

### 2.4 `scripts/audit-rls.mjs` — Hardcoded Project Ref Removed

**Before:**
```js
const PROJECT_REF = 'bwwifvuerhxgjeoochnp';
```

**After:**
```js
const PROJECT_REF = SUPABASE_URL.match(/https?:\/\/([a-z]+)\.supabase\.co/)?.[1];
if (!PROJECT_REF) {
  console.error('❌ Cannot extract project ref from SUPABASE_URL');
  process.exit(1);
}
```

**Guard added:** Validates all 4 env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`) before proceeding.

---

## 3. Regression Results

| Check | Result | Notes |
|-------|--------|-------|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors | No output = clean |
| Next.js build (`npm run build`) | ✅ 24 routes | Same routes as baseline |
| Playwright desktop + mobile | ✅ 54/54 PASS | 1.3m total |
| Runtime: Home `/` | ✅ HTTP 200 | Full HTML rendered, correct `<title>` |
| Runtime: Courts `/courts` | ✅ HTTP 200 | Full HTML rendered |
| Runtime: API `/api/courts` | ✅ HTTP 200 | Valid JSON with 6 court records |
| Dev server restart | ✅ Running | Port 3000, confirmed HTTP 200 |

---

## 4. Security Headers Verified

Tested via `curl -I` on all 4 routes — all 6 headers present on every response:

| Route | HTTP Status | CSP | XCTO | XFO | XSS | Referrer | Permissions |
|-------|-------------|-----|------|-----|-----|----------|-------------|
| `/` | 200 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/courts` | 200 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/contact` | 200 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/api/health` | 404 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 5. What Was NOT Changed

| Item | Reason |
|------|--------|
| `.env.local` actual values | Never expose secrets |
| Supabase client files (`server.ts`, `client.ts`, `middleware.ts`) | Already use `NEXT_PUBLIC_*` correctly; no hardcoded fallbacks |
| `src/middleware.ts` | No env vars; only calls `updateSession` |
| Database schema, RLS policies, functions | Out of scope for Phase 19.1 |
| Feature logic, UI components | Out of scope for Phase 19.1 |
| HSTS header | Would break local HTTP development on localhost:3000 |

---

## 6. Recommendations for Future Phases

1. **Phase 20 (optional):** Add `Strict-Transport-Security` header when deploying to production HTTPS
2. **Phase 21 (optional):** Add `Content-Security-Policy-Report-Only` to collect violation reports before enforcing
3. **Phase 22 (optional):** Consider replacing `unsafe-eval` with Next.js production build (Turbopack dev only)
4. **Phase 23 (optional):** Rotate the Supabase anon key if it was ever committed to Git history (project has no `.git` — low risk)

---

**Phase 19.1 Status:** ✅ COMPLETE — All 6 steps finished. No outstanding items.
