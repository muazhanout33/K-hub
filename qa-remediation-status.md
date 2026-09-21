# K-HUB — QA Remediation Status (Phases 0–4)

**Project:** `D:\k-hub-booking-platform` — Next.js 16.2.12 (App Router, Turbopack), TypeScript 5.9, React 19.2, Tailwind v4, Supabase
**Last updated:** 2026-08-29 (Africa/Cairo)
**Dev server:** `npm run dev --webpack` → `http://localhost:3000` (background process)
**QA script:** `tests/qa-overflow-layout.js` — 16 pages × 8 viewports, **never modified** (SHA256 `747557B1…C4AD6452`)

---

## 1. Phase Status

| Phase | Scope | Status | Key evidence |
|---|---|---|---|
| 0 | Baseline & Project Audit | ✅ DONE | `phase0-baseline-report.md`; 961 findings baseline |
| 0.5 | Source Recovery & Integrity | ✅ DONE | 12 files restored from `.next` source maps; tsc + build pass |
| 1 | Court Image Pipeline | ✅ PASS | 10 local assets + fallback; `/_next/image` 400→200; 0 deterministic broken images |
| 2 | Navbar & Global Overflow | ✅ PASS | 16 CRITICAL body-overflow → 0; drawer breakpoint lg→xl |
| 3 | Touch Targets & Content Fit | ✅ PASS | TOUCH 786 → 0; all targets ≥44px; About stats fit |
| 4 | Booking Mobile Layout | ✅ PASS | stepper fits all widths; ESCAPE 18 → 0 |
| 5 | Image aspect ratio / crop (court + event cards) | ⏸ PENDING | deferred by Phase 4 doc — needs Phase 5 instruction |
| 6/7 | Auth redirect (`/login` → 404) + middleware latency + cold-compile ERRORs | ⏸ PENDING | deferred — needs instruction |
| 8 | Full Validation & Regression | ⏸ PENDING | compare against this document |

## 2. QA Progression (same unmodified script)

| Metric | Phase 0 | Ph1 (Run C) | Ph2 (Run D) | Ph3 (Run E) | Ph4 (Run F) |
|---|---:|---:|---:|---:|---:|
| CRITICAL | 16 | 17 | 1 | 3 | 2 |
| HIGH | 131 | 101 | 99 | 60 | 79 |
| MEDIUM | 814 | 816 | 812 | 48 | 23 |
| TOTAL | 961 | 934 | 912 | 111 | 104 |
| TOUCH | 798 | 788 | 786 | **0** | 0 |
| OVERFLOW | 84 | 84 | 68 | 60 | 60 |
| IMAGE | 57 | 41 | 35 | 30 | 42 |
| ESCAPE | 22 | 20 | 22 | 18 | **0** |
| ERROR | — | 1 | 1 | 3 | 2 |

**Remaining finding classes (all classified):**
- OVERFLOW 60 = intentional scroll containers (Home court carousel, DaySelector date strip, LiveAvailability timeline) — leaf-walker artifacts, not page overflow (`body.scrollWidth === clientWidth` verified at 15 widths).
- IMAGE 30–42 = Phase 5 scope (aspect-ratio distortion + heavy crop on court/event cards, hero) plus **dev-optimizer timing artifacts**: the dev image optimizer serializes 6-image bursts (~8.4 s; ~1.2 s/image), so the QA's fixed 1200 ms sample window misses the last images after server start. Flags move between viewports each run; every URL verified HTTP 200; poll-based render 17/17. Production (`next start`) uses the compiled optimizer — dev-only artifact.
- ERROR 2–3 = dev cold-compile `page.goto` timeouts + the auth-guard redirect race (`useAuthGuard` → `router.replace('/login')` → **404**, real route is `/auth/login`) — Phase 6/7 scope.

## 3. Files Modified (source, cumulative)

| Phase | Files |
|---|---|
| 1 | `src/lib/mock-data.ts` (court images → `/images/courts/*.jpg`), `src/services/court.service.ts` (local `FALLBACK_COURT_IMAGE` + `normalizeCourtImage()`), `src/features/courts/CourtCard.tsx` (`sizes` prop) |
| 2 | `src/components/layout/Navbar.tsx` (nav/hamburger/drawer breakpoints `lg`→`xl`, lines 76/173/185) |
| 3 | `src/components/layout/Footer.tsx` (all interactives ≥44 px), `src/app/page.tsx` (View All `min-h-[44px]`), `src/app/contact/page.tsx` (tel links `py-3`), `src/app/auth/login/page.tsx` + `register/page.tsx` (switch links `py-3.5`), `src/app/globals.css` (stats mobile media query) |
| 4 | `src/features/booking/BookingSteps.tsx` (stepper `flex-wrap`), `src/features/booking/DaySelector.tsx` (month labels de-sticky) |

Assets added (Phase 1): `public/images/courts/` — padel-1, football-5v5, football-7v7, tennis-hard-1, tennis-clay, gallery-padel-2/3, gallery-football-2, gallery-tennis-2, court-fallback (all valid JPEG 1200×~800); `public/images/avatars/` — 3 unreferenced (inert, removable).
**Never modified:** Supabase, schema, RLS, auth impl, middleware, `useAuthGuard`, booking/pricing/payment/API logic, `SiteContainer`, `next.config.ts`, `tests/*`.

## 4. Known Environment Notes
- **No git repository** exists in the project — file-level inventory is used instead of `git diff`.
- **Do not run `npm run build` while `next dev` is running** — they share `.next` state; one such conflict crashed the dev server (restart: `npm run dev --webpack`).
- Unsplash is retained in `next.config.ts` `remotePatterns` + CSP deliberately: events (3) and avatars (5) still use `images.unsplash.com`; court images are fully local.
- Home/DaySelector share `DaySelector` (via `LiveAvailabilitySection`) — booking-layout fixes also apply to Home.

## 5. Handover / Run Instructions
```
npm install          # deps (node_modules present)
npm run dev --webpack   # dev server → http://localhost:3000
npm run build        # production build (do NOT run while dev is up)
npm run start        # serve production build
npx tsc --noEmit     # type check
node tests/qa-overflow-layout.js   # QA regression (needs dev server on :3000)
```
Environment config: `.env.local` (Supabase URL/anon key). Docs: `docs/` (architecture, ui-ux-guidelines, business-rules, database-design).

## 6. Next Steps
1. Await Phase 5 instruction (court/event image aspect ratio + hero crop).
2. Phase 6/7: fix `useAuthGuard` redirect target `/login` → `/auth/login`; review middleware latency on protected routes.
3. Phase 8: full regression vs this document; consider adding 1024–1121 px viewports and a warm-server QA protocol to the plan.
