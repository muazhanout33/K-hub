# K-HUB — Phase 0 Baseline & Project Audit Report

**Date:** 2026-08-28 (Africa/Cairo)
**Mode:** AUDIT ONLY — no source code modified
**Project root:** `D:\k-hub-booking-platform`
**Environment:** Next.js 16.2.12 (Turbopack), TypeScript 5.9, React 19.2.4, Tailwind v4, dev server on `http://localhost:3000` (`npm run dev --webpack`)

---

## 1. Documentation Found

Requested files at project root:

```
Found:
  (none at root — all documentation lives under docs/)

Missing:
  - k-hub-business-rules-implemented.md
  - technical-architecture.md
  - ui-ux-guidelines.md
  - database-design.md
```

Equivalent documentation exists under `docs/`:

```
Found (docs/):
  - technical-architecture.md
  - ui-ux-guidelines.md
  - database-design.md
  - business-rules.md   (covers the same domain as the missing k-hub-business-rules-implemented.md)
  - product-requirements.md
  - project-overview.md
  - 0001_supabase_schema.sql
  - 0002_grant_static_data.sql
```

**Frontend/mobile-relevant summary of existing docs (no fabrication):**

- `ui-ux-guidelines.md` — the contract for this remediation: mobile-first, white theme (`#FAFAFA` bg), primary green `#16A34A`, large rounded cards (radius 24px), premium SaaS feel; sidebar becomes a drawer on mobile, floating Book button, cards single-column, touch-friendly 52px button height, responsive behavior across all screen sizes.
- `technical-architecture.md` — feature-first Next.js App Router + TypeScript + Tailwind + shadcn/ui structure (`app/ components/ features/ hooks/ lib/ services/ types/`); presentation layer must stay free of business logic; responsive support across desktop/laptop/tablet/mobile with no functionality lost on smaller devices.
- `business-rules.md` — booking/availability rules; relevant to mobile QA only in that booking UI must expose the full flow (court → date → time → details → payment) without losing steps on small screens.
- `database-design.md` / schema SQL — `courts.image_url` column exists (source of court images); no local asset storage is defined (storage section of architecture doc says binary files should not live in the DB).

---

## 2. Component / File Inventory

| # | Responsibility | Exact path(s) |
|---|---|---|
| 1 | Court cards | `src/features/courts/CourtCard.tsx` |
| 2 | Home featured courts | `src/app/page.tsx` (Section 2, ~L180–205; horizontal snap carousel `min-w-[260px]` cards) |
| 3 | Courts page | `src/app/courts/page.tsx` (grid `md:grid-cols-2 lg:grid-cols-3`) |
| 4 | Booking stepper | `src/features/booking/BookingSteps.tsx` |
| 5 | Booking date selector | `src/features/booking/DaySelector.tsx` (also rendered on Home inside `LiveAvailabilitySection`) |
| 6 | About statistics | `src/app/about/page.tsx` + `.stats-bar` / `.stat-number` in `src/app/globals.css` |
| 7 | Contact phone links | `src/app/contact/page.tsx` (`tel:01097747738`, `tel:01031882128`) |
| 8 | Login/Register links | `src/app/auth/login/page.tsx` (L102 “Register Here”), `src/app/auth/register/page.tsx` (L159 “Sign In Here”) |
| 9 | Shared footer | `src/components/layout/Footer.tsx` |
| 10 | Sticky horizontal components | `DaySelector.tsx` month labels (sticky left-0); `LiveAvailabilitySection.tsx` timeline (`overflow-x-auto`, `min-w-[580px]`) |
| 11 | Notifications page | `src/app/notifications/page.tsx` (guard: `useAuthGuard`) |
| 12 | My Bookings page | `src/app/bookings/page.tsx` (guard: `useAuthGuard`) |
| 13 | Image configuration | `next.config.ts` (`images.remotePatterns` → `images.unsplash.com` only; CSP `img-src 'self' https://images.unsplash.com data: blob:`) |
| 14 | `next.config.*` | `next.config.ts` (also: security headers, CSP) |
| 15 | QA script | `tests/qa-overflow-layout.js` (16 pages × 8 viewports; NOT modified) |

Related: `src/hooks/useAuthGuard.ts`, `src/middleware.ts`, `src/lib/supabase/middleware.ts`, `src/services/court.service.ts` (Supabase → `MOCK_COURTS` fallback + `FALLBACK_COURT_IMAGE`), `src/lib/mock-data.ts` (Unsplash URLs), `src/components/layout/Navbar.tsx`, `src/components/layout/SiteContainer.tsx`.

---

## 3. Baseline TypeScript

Command: `npx tsc --noEmit`

**Result: PASS (exit code 0, zero errors/warnings).**

---

## 4. Baseline Build

Command: `npm run build` (Next.js 16.2.12, Turbopack), run twice to confirm exit code.

**Result: PASS — build completes successfully.**
- ✓ Compiled successfully (~27–44s)
- ✓ TypeScript check passed (finished in ~20–43s)
- ✓ 24/24 static pages generated
- ✓ Full route table emitted (16 static pages + 3 dynamic + proxy/middleware)

Warning (non-fatal):
- `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` — `src/middleware.ts` should be renamed to `src/proxy.ts` in a future cleanup; does not affect the build.

Note on exit code: first invocation reported shell exit code 1 solely because PowerShell wraps the stderr deprecation warning as `NativeCommandError`; re-run with stderr redirected to a file returned `TRUE_EXIT_CODE: 0`. Build genuinely passes.

Routes confirmed in build: `/`, `/about`, `/admin`, `/advertise`, `/api/bookings`, `/api/courts`, `/api/courts/[id]`, `/auth/login`, `/auth/register`, `/book`, `/book/confirmation`, `/book/details`, `/book/payment`, `/bookings`, `/contact`, `/courts`, `/courts/[id]`, `/events`, `/membership`, `/notifications`, `/profile`, `/sponsors`, `/sponsors/apply`.

**There is NO `/login` route** (see Group 10 — the auth guard redirects there).

---

## 5. Baseline QA Output

Command: `node tests/qa-overflow-layout.js` (16 pages × 8 viewports: 320×568, 360×640, 375×812, 390×844, 414×896, 430×932, 768×1024, 1024×768).

Two runs were executed. Full output saved at `.openclaw/tmp/qa-baseline-output.txt`.

**Run 1 (cold dev server — first compile of every route):** captured CRITICAL page errors that are compile-latency artifacts:
- `page.goto: Timeout 30000ms exceeded` on Court Detail, Booking (no court), About, Contact, Login @ 320×568
- `Execution context was destroyed… navigation` on My Bookings @ 320×568 and @ 360×640
- Run was killed at the 15-min exec timeout before reaching the summary (missing 1024×768 tail).

**Run 2 (warm server — authoritative baseline):** completed, exit 0.

```
VISUAL QA SUMMARY
CRITICAL: 16   HIGH: 131   MEDIUM: 814   LOW: 0
Total issues: 961
By category: TOUCH 798 | OVERFLOW 84 | IMAGE 57 | ESCAPE 22
```

Critical nuance: **all 16 CRITICAL findings are the same global 1024×768 body overflow** (16 pages × 16–17px). The Run-1 page errors did NOT reproduce in Run 2 (see Group 10 for classification). The bulk of findings (798) are touch-target violations on shared components (footer links), which the script reports once per page/viewport.

---

## 6. Finding Groups

### Group 1 — Broken Images
- **Severity:** HIGH (flagged) / mixed real vs artifact
- **Affected pages:** Courts, Home, Booking (with court)
- **Affected viewports:** all 8 (varies per run)
- **Exact numeric evidence:**
  - Deterministic: `Booking (with court)` — `/_next/image?url=%2Fimages%2Fcourts%2Fpadel-1.jpg…` returns **HTTP 400** at every viewport (8/8). `public/images/` does not exist — verified (`NO public/images DIR`).
  - Unsplash URLs (e.g. `photo-1554068865`, `photo-1529900748604`) flagged as broken on Home @375/430/768 and Courts @320/360 in run 2 — but direct probe shows the same `<img>` elements load with `naturalWidth=374–375` after 4s. These are **load-timing artifacts**: the QA samples `naturalWidth` after a fixed 1200ms; the dev image optimizer’s first fetch from Unsplash regularly exceeds 1.2s. Flagged viewports differ between runs → confirms timing variance, not deterministic breakage.
  - Direct `/_next/image` fetch of a warm Unsplash URL: HTTP 200, 33,910 bytes.
- **Likely root cause:** (a) real: court images reference local paths that don’t exist (`public/images` absent) — nothing to serve; (b) artifact: dev-mode optimizer latency on cold Unsplash fetches against a fixed 1200ms QA sample window.
- **Shared component:** `CourtCard` (image slot), Booking summary image.
- **Files involved:** `src/features/courts/CourtCard.tsx`, `src/features/booking/BookingWidget.tsx`, `next.config.ts`, `src/lib/mock-data.ts`, `src/services/court.service.ts`.

### Group 2 — Home Court Card Overflow
- **Severity:** HIGH (script) — mostly scroll-container flags, no body-level overflow on mobile
- **Affected pages:** Home
- **Affected viewports:** 360×640, 375×812, 390×844, 414×896, 430×932
- **Exact numeric evidence:** leaf elements extend beyond viewport: `<IMG>` +159px, `<H3> "Emirates Pitch 5v5"` +159px/144/129/105/89px (viewport-width dependent), badges +23..95px, price +27px. These are cards #2–#4 of the carousel at `min-w-[260px] max-w-[320px]`.
- **Likely root cause:** Home section 2 is a horizontal snap carousel: `flex gap-5 overflow-x-auto snap-x snap-mandatory -mx-6 px-6 lg:grid lg:grid-cols-4` with `shrink-0` cards. Cards intentionally extend past the viewport; the QA walker reports any leaf whose `rect.right > viewport` regardless of clipping by an `overflow-x-auto` ancestor. Not a real page overflow (body.scrollWidth == clientWidth on mobile).
- **Shared component:** `CourtCard` (+ carousel wrapper in `src/app/page.tsx`).
- **Files involved:** `src/app/page.tsx`, `src/features/courts/CourtCard.tsx`.

### Group 3 — Image Aspect Ratio
- **Severity:** MEDIUM (script) — real cropping, no distortion
- **Affected pages:** Courts, Home (hero), Events
- **Affected viewports:** all ≥360
- **Exact numeric evidence:**
  - Courts: “Champions Stadium 7v7” ratioDiff=0.38 at 6 viewports (natural 1024×598 ≈ 1.71, rendered box 225×169 ≈ 1.33).
  - Home hero “K-HUB Outdoor Court”: ratioDiff 0.30 @360, 0.51 @768.
  - Events: 3 cards ratioDiff 0.32 @430, 0.46 @768.
  - Heavy crop: Home @768 “Pro Padel Center Arena 1” natural 768×512 → display 218×164; Courts @1024 1024×682 → 225×168.
- **Likely root cause:** fixed-ratio image boxes (`aspect-[4/3]` in CourtCard; hero fixed heights `h-[260px] sm:h-[360px] lg:h-[440px] xl:h-[480px]`) with `object-cover` against 3:2/16:9 Unsplash sources → systematic cropping, worst on 16:9 sources (ratioDiff 0.38–0.51).
- **Shared component:** `CourtCard`, hero image block, event cards.
- **Files involved:** `src/features/courts/CourtCard.tsx`, `src/app/page.tsx`, `src/app/events/page.tsx`.

### Group 4 — Booking Stepper (+ date selector overflow)
- **Severity:** HIGH (script) / MEDIUM (real UX)
- **Affected pages:** Booking (with court) — stepper; Booking + Home — DaySelector
- **Affected viewports:** 320×568 → 430×932
- **Exact numeric evidence:**
  - Stepper: “Payment” label overflows +39px @414, +63 @390, +78 @375, +93 @360, +133 @320; “Your Details” +2..42px; step circle “04” +4..74px.
  - DaySelector cells: “Sun/30/Aug” +14px @320; “Mon/31” +56–95px @360; “Tue/1/Sep” +174–183px @430; month label “September 2026” +134–150px.
- **Likely root cause:** `BookingSteps` is `flex overflow-x-auto flex-nowrap` with 4 `shrink-0 whitespace-nowrap` items (total ≈ 480–560px) — wider than every tested phone → horizontal scroll; the QA reports the off-screen leaves. `DaySelector` is the same pattern (`overflow-x-auto`, `min-w-[72px]` buttons). Real UX consequence: step 4 (Payment) is off-screen and the stepper must scroll on ≤430px; date cells scroll by design.
- **Shared component:** `BookingSteps`, `DaySelector` (via `BookingWidget`; `DaySelector` also on Home via `LiveAvailabilitySection`).
- **Files involved:** `src/features/booking/BookingSteps.tsx`, `src/features/booking/DaySelector.tsx`, `src/features/booking/BookingWidget.tsx`.

### Group 5 — About Stats Overflow
- **Severity:** HIGH (script) / LOW (visual)
- **Affected pages:** About
- **Affected viewports:** 360×640
- **Exact numeric evidence:** `stat-number` “10,000+” +10px, label “Active Members” +10px, “4.95 ★” +10px, “Customer Rating” +10px (4 findings).
- **Likely root cause:** `.stats-bar` is a 2-column grid (`repeat(2,1fr)`) with `.stat-number` at `font-size: 2rem; font-weight: 900` and item padding `24px 16px`; at 360px the content box per item ≈ 124px, and “10,000+” at 2rem extrabold exceeds it → 10px overflow, clipped/hidden by the bar’s `overflow: hidden`.
- **Shared component:** none (page-local CSS) — but `.stats-bar` lives in `globals.css` shared stylesheet.
- **Files involved:** `src/app/about/page.tsx`, `src/app/globals.css`.

### Group 6 — Contact Phone Link Touch Targets
- **Severity:** HIGH
- **Affected pages:** Contact
- **Affected viewports:** 360×640 → 430×932 (every mobile viewport; also flagged @360+ in run 2)
- **Exact numeric evidence:** “0109 774 7738” 142×20px; “0103 188 2128” 142×20px (both `A[href^="tel:"]`).
- **Likely root cause:** `<a class="text-muted text-sm…">` with no padding/block sizing — 20px hit area ≈ text line-height; far below the 40–44px guidance.
- **Shared component:** none (page-local).
- **Files involved:** `src/app/contact/page.tsx`.

### Group 7 — Login/Register Link Touch Targets
- **Severity:** HIGH
- **Affected pages:** Login, Register
- **Affected viewports:** all mobile (320–430)
- **Exact numeric evidence:** “Register Here” 80×15px (login page); “Sign In Here” 71×15px (register page).
- **Likely root cause:** inline `<Link>` with `text-xs` and no padding — 15px hit area.
- **Shared component:** none (page-local).
- **Files involved:** `src/app/auth/login/page.tsx`, `src/app/auth/register/page.tsx`.

### Group 8 — Footer Touch Targets
- **Severity:** MEDIUM (bulk of the 798 TOUCH findings)
- **Affected pages:** every page with the shared footer (16 pages)
- **Affected viewports:** all mobile (320–430)
- **Exact numeric evidence:** “Browse Courts” 98×32px, “Book a Court” 86×32px, “Membership Plans” 123×32px, “Official Sponsors” 113×32px, “Tournaments & Events” 148×32px, “About K-HUB” 88×32px, “Contact & Location” 126×32px, “Support & FAQs” 104×32px (8 links × 32px tall = 32px < 40px). Also Home “View All” 70×35px.
- **Likely root cause:** footer links use `py-1.5` (6px) + `text-sm` (20px line) → 32px height; “View All” uses `py-2` → 35px.
- **Shared component:** **Footer** — one fix removes ~800 duplicated findings.
- **Files involved:** `src/components/layout/Footer.tsx`, `src/app/page.tsx` (View All).

### Group 9 — Sticky Escape (DaySelector month labels)
- **Severity:** MEDIUM (script) / benign (design)
- **Affected pages:** Home (via LiveAvailabilitySection), Booking
- **Affected viewports:** all (1–2 findings per page/viewport; 22 total)
- **Exact numeric evidence:** probe at 360×640: two `sticky left-0 z-10` month labels at left=49 (right=138) and left=462 (right=572, beyond viewport).
- **Likely root cause:** sticky month labels inside the horizontal calendar scroll row; when the row is scrolled (autoScrollToToday), labels of months outside the viewport sit at negative/positive offsets. The QA flags any `[class*="sticky"]` element whose rect leaves the viewport — this is correct sticky-in-scroll behavior, not a defect.
- **Shared component:** `DaySelector`.
- **Files involved:** `src/features/booking/DaySelector.tsx`.

### Group 10 — Critical Page Errors
- **Severity:** CRITICAL in run 1; NOT REPRODUCED in run 2 (with one real defect)
- **Affected pages:** Court Detail, Booking (no court), About, Contact, Login (run-1 timeouts); My Bookings, Notifications, Profile (auth guard)
- **Affected viewports:** 320×568 (timeouts); all (auth guard)
- **Exact numeric evidence:** run 1: 4× `page.goto: Timeout 30000ms` + 2× `Execution context was destroyed… navigation`; run 2: zero page errors. `/login` returns **HTTP 404** (verified); the only login route is `/auth/login`.
- **Likely root cause (two distinct):**
  1. *Cold-compile latency (artifact):* `next dev --webpack` compiles each route on first request; with 30s goto timeouts and ~16 pages × 8 viewports of fresh visits, first-touch pages exceeded 30s in run 1. Warm run 2 had zero timeouts.
  2. *Real defect:* `useAuthGuard()` (used by /bookings, /notifications, /profile) calls `router.replace('/login')` after hydration when unauthenticated — but `/login` does not exist (404; real route is `/auth/login`). The client-side navigation during QA’s `page.evaluate` destroyed the execution context in run 1; in run 2 the evaluate completed before the effect fired. Users who hit these pages while logged out get redirected to a 404.
- **Shared component:** `useAuthGuard` hook (3 pages) + middleware.
- **Files involved:** `src/hooks/useAuthGuard.ts`, `src/app/bookings/page.tsx`, `src/app/notifications/page.tsx`, `src/app/profile/page.tsx`, `src/middleware.ts`, `src/lib/supabase/middleware.ts`.

### Additional finding not covered by the 10 groups — Global 1024×768 body overflow (CRITICAL ×16)
- **Severity:** CRITICAL (all 16 CRITICAL findings)
- **Affected pages:** every page
- **Affected viewports:** 1024×768 (and, by measurement, the whole ~1024–1121px band where the lg navbar is active)
- **Exact numeric evidence:** `body.scrollWidth=1040–1041` vs `clientWidth=1024` (overflow 16–17px) on all 16 pages. Diagnostic at 1024×768: SiteContainer content box = 864px (1024 − 2×80px `lg:px-20`); header row = logo 180px + nav (6 links, min-content ≈ 471px, already at `flex-1` minimum) + right controls 310px (`shrink-0`) = **961px > 864px** → right controls cluster sits at left=730 / right=1041, 17px past the viewport.
- **Likely root cause:** Navbar flex row cannot shrink below the sum of (logo 180 + nav links ~471 + right controls 310); the `shrink-0` right cluster (notification bell + Book Now + Register + avatar) is pushed past the right viewport edge at exactly the `lg` breakpoint. Because the row overflows its container without `overflow-x-hidden`, it inflates `document.body.scrollWidth` → horizontal page scroll on every route.
- **Shared component:** **Navbar**.
- **Files involved:** `src/components/layout/Navbar.tsx`, `src/components/layout/SiteContainer.tsx`.

---

## 7. Group 1 Risk Checkpoint — Images

- **Current image source pipeline:** `court.service.ts` → `getCourtsFromSupabase()` reads `public.courts.image_url` (via `mapDbCourtToCourt`); on error/empty falls back to `MOCK_COURTS` (all Unsplash URLs) — in this environment the app is serving the mock/Unsplash set. `FALLBACK_COURT_IMAGE` (Unsplash) covers courts with no `image_url`.
- **Is `next/image` used?** Yes — CourtCard (`fill`, `aspect-[4/3]`), Home hero (`fill`), event cards, logo, avatar.
- **Are external images used?** Yes — `images.unsplash.com` exclusively.
- **Current `next.config.*`:** `next.config.ts`; `images.remotePatterns = [{ protocol:'https', hostname:'images.unsplash.com' }]`; CSP `img-src 'self' https://images.unsplash.com data: blob:`; security headers for all routes.
- **Current `remotePatterns`:** Unsplash only.
- **Is Unsplash configured?** Yes (pattern + CSP both allow it). Direct optimizer fetch verified: HTTP 200 / 33,910 bytes for a warm Unsplash URL.
- **Do local court image paths exist?** **No** — `public/images/` does not exist. Any court whose `image_url` is a local path (e.g. the QA seed’s `/images/courts/padel-1.jpg`) returns HTTP 400 from `/_next/image` (verified).
- **Do `/_next/image` requests fail?** Deterministically only for non-existent local paths; Unsplash URLs are served 200 when warm. One probe anomaly: `fetch()` of already-warm optimizer URLs from the page context returned 400 (33B) while `<img>` tags loaded fine — flagged for Phase 1 investigation (dev optimizer concurrency/header behavior), not currently user-visible.
- **Risk statement:** single-vendor external hotlinking with no local fallback is the top availability risk; there is zero local asset pipeline, so any data change to local paths breaks images site-wide. Nothing changed in this phase.

## 8. Group 10 Risk Checkpoint — Critical Pages (Notifications / My Bookings)

- **Do they navigate/reload during QA?** Yes — client-side `router.replace('/login')` fires after Zustand hydration when unauthenticated; in cold runs this destroyed the QA execution context; in warm runs it fired after sampling.
- **Inspection summary:**
  - `router.push` / `router.replace`: `useAuthGuard` → `router.replace('/login')` on `/bookings`, `/profile`, `/notifications`.
  - `window.location`: none.
  - **middleware** (`src/middleware.ts` + `src/lib/supabase/middleware.ts`): only refreshes the Supabase session via `getUser()` for `/bookings`, `/profile`, `/notifications`, `/admin`, `/api/bookings*`; it does **not** redirect unauthenticated users. `getUser()` is a network call on every request to protected paths — source of slow first loads in cold QA.
  - **auth guards:** client-side only (`useAuthGuard`); pages are static (○) per build output, so protected-page HTML ships before the client redirect — a brief content flash for logged-out users.
  - **client effects:** hydration + effect redirect as described.
  - **redirects:** `router.replace('/login')` → **404** (route missing; only `/auth/login` exists). This is a real navigation defect.
  - **hydration:** `_hasHydrated` gates the redirect; OK.
  - **navigation events:** single client-side replace; no loops.
- **Risk statement:** unauthenticated visits to protected pages end on a 404; the guard target must be `/auth/login`. The middleware adds a Supabase `getUser()` round-trip on protected routes (latency, not correctness). Nothing modified in this phase.

---

## 9. Proposed Remediation Order

Safest → highest-leverage first (each phase is isolated by the plan):

1. **Phase 1 — Court Images Pipeline:** local/stable court images + graceful fallback; kills the only deterministic broken image and the Unsplash dependency risk. (Low risk: isolated to image sources + config.)
2. **Phase 6 — Shared Footer + Sticky Components:** footer link height 32→44px (removes ~800 duplicate findings), Navbar 1024px overflow band fix (removes all 16 CRITICALs), shared-component sweep. (Highest blast radius per change.)
3. **Phase 5 — About / Contact / Auth Touch Targets:** stats 10px overflow, `tel:` links 142×20→44px, auth switch links 71–80×15→44px.
4. **Phase 7 — Critical Navigation:** `useAuthGuard` default redirect `/login` → `/auth/login`; review middleware latency. (One-line core fix.)
5. **Phase 4 — Booking Mobile Layout:** stepper fits ≤430px (icon-only steps or smaller gaps), DaySelector polish; verify Booking flow end-to-end.
6. **Phase 2 — Court Cards & Home Overflow:** carousel card sizing/edge alignment (visual, non-blocking).
7. **Phase 3 — Image Aspect Ratio:** align card/hero aspect ratios with source ratios (3:2/16:9) to remove heavy cropping.
8. **Phase 8 — Full Validation & Regression:** re-run this same baseline and diff counts; add viewports 1024–1121px to the QA matrix.

## 10. Scope Confirmation

```
Files modified: NONE
Business logic modified: NO
Auth modified: NO
Supabase modified: NO
QA script modified: NO
```

- No `src/` file was edited; `tests/qa-overflow-layout.js` was run as-is.
- Diagnostic helper scripts were created under `.openclaw/tmp/` (read-only Playwright probes) and this report was written; neither touches application code, data, or infrastructure.
- Supabase, RLS, authentication, booking logic, pricing, payments, APIs, database schema, and business rules: untouched.
