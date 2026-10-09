# K-HUB Admin Dashboard — Phase 0–2 Audit Baseline

Status: Phases 0 (audit), 1 (UX/product spec), 2 (technical/Supabase/security audit) COMPLETE.
Phase 2 verdict: **NOT READY** — §12 checklist below must be executed before/alongside UI work.
This doc condenses the delivered chat reports so findings survive sessions. Date: 2026-10-08.

---

## 1. Stack & Architecture

- Next.js 16.2.12 App Router, React 19.2.4, TypeScript 5.9.3 strict
- Tailwind v4 (tokens in `src/app/globals.css`); shadcn `base-nova` but only 3 primitives: `Button`, `Badge`, `FilterChips` (built on `@base-ui/react`)
- Zustand ×7 stores, persisted, gated by `HydrationProvider` (`_hasHydrated`)
- Supabase JS 2.112.3 + `@supabase/ssr` 0.12.4 — anon key only in app code
- Vitest + Playwright; server actions are the primary write path
- Business time: Cairo / Africa-Cairo (UTC+2/+3)
- Supabase clients: `src/lib/supabase/*` (browser + server clients, `middleware.ts` session refresh)

## 2. Route Map (relevant)

- Approved admin routes (Phase 1): `/admin`, `/admin/bookings`, `/admin/bookings/[id]`, `/admin/calendar`, `/admin/courts`, `/admin/customers`, `/admin/messages` (read-only SHOULD)
- Existing: only `src/app/admin/page.tsx` exists (191 lines, client-guarded, off-system purple/blue/yellow colors — normalize to design tokens)
- `src/components/layout/Sidebar.tsx` exists but is unmounted/public — copy its visual DNA into a new `AdminSidebar`; do NOT reuse directly

## 3. AuthZ Reality

- DB is the real boundary: `profiles.role` enum (`Guest`/`User`/`Admin`) + `is_admin()` SECURITY DEFINER used in **24 of 35** RLS policies
- `useAdminGuard` (`src/hooks/useAdminGuard.ts`) is **client-only** (reads localStorage role) — UX layer only
- `src/middleware.ts:4-11` refreshes session for exact paths only (`/admin` but not `/admin/bookings`) — needs prefix matching for `/admin/*` and an auth redirect; role check still must live server-side
- **P0: server layout guard for `/admin/**` + per-action role re-check** (Phase 3 A1/A2/A3)

## 4. Database (repo evidence, ~1 month stale — live state verified separately)

- 16 tables, RLS on all; **35 base policies**; 12 migrations in `supabase/migrations/` (20260823000000 → 20260905010000) = live-DB truth source
- `docs/0001_supabase_schema.sql` = reference doc, never applied wholesale; `database.types.ts` is hand-written
- 11 enums, 11 indexes, 5 functions, 0 views, 0 app `.rpc()` calls
- Integrity: GiST `prevent_double_booking` (court_id + range) WHERE status IN ('Reserved','Confirmed'); `prevent_overlapping_blocked_periods`; `payments` table never written (mock payment only); `Expire` unreachable (`expireStaleBookingsAction` has no production caller)

## 5. Key Findings (file:line)

| # | Finding | Location |
|---|---------|----------|
| F1 | `getBookingsForCourtDate` ignores its `date` param | `src/lib/supabase/booking-queries.ts:16-25` |
| F2 | `createBookingAction` hardcodes `status='Reserved'`, `booking_source='ONLINE'`, derives `user_id` from session | `src/app/actions/booking.actions.ts:106-112` |
| F3 | Admin cancel obeys 2h window (reuse this logic) | `src/app/actions/booking.actions.ts:206-229` |
| F4 | Blocked-period check bypassed for non-admins by RLS | migrations policy set |
| F5 | `/api/bookings` trusts spoofable `x-supabase-user-id` header | `src/app/api/bookings/route.ts:50,121` |
| F6 | `/api/bookings` accepts `bookingSource:'ADMIN'` | `src/app/api/bookings/route.ts:177-179` |
| F7 | Timezone: Cairo wall-clock stored as `+00`; host-TZ-dependent `Date` parses break cancel/expiry on UTC hosts | `src/lib/mappers.ts:57-58,103` |
| F8 | Mock admin creds hardcoded in app code | `src/lib/mock-users.ts` |

## 6. Approved Decisions (Phase 1–2)

1. **Manual booking = Option D**: nullable `bookings.user_id` + denormalized contact fields; migration `ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL`
2. `booking_source='WALK_IN'`, server-derived (never client-supplied)
3. Manual booking default `status='Confirmed'`
4. **Timezone = wall-clock canonical model**: no backfill; all comparisons in Cairo wall-clock minutes; dual-TZ tests
5. **Admin auth = server layout guard + per-action role re-check + RLS** (client guard stays as UX only)
6. Pagination = offset, 25 rows/page; customer aggregates = PostgREST embedded count (Option A)
7. Courts: image = URL only (no Storage buckets); courts form persists only `Available | Maintenance`; `slot_duration_minutes` must stay 60
8. Court/availability math: reuse `src/lib/{mappers,timezone,dates,availability,pricing}.ts` — never rewrite

## 7. Design Language (for Admin UI)

- bg `#F8FAFC`, white cards, primary green `#16A34A`, Inter, radius 8–28px
- `.khub-input`, status pills (in `globals.css`), `SiteContainer` (1600px), sonner toasts, lucide icons
- Responsive: mobile drawer pattern as in public navbar

## 8. Phase 2 Verdict Reasons (why NOT READY)

Security: spoofable identity header (F5), client-only authz, mock creds (F8), `bookingSource` client-controlled (F6).
Correctness: F1 broken date filter, F7 timezone host-dependency, expiry unreachable.
Data: manual booking impossible (`user_id NOT NULL`, `docs/0001_supabase_schema.sql:129`), payments mock-only.
Coverage: tests don't cover admin role paths / RLS as exercised by admin queries; repo/live drift.

## 9. §12 Pre-UI Checklist (execution order)

| ID | Item | Kind |
|----|------|------|
| B1 | Verify live RLS/schema/functions (read-only) via `scripts/audit-rls.mjs:225-236` | verify |
| A1 | Server layout guard in `src/app/admin/layout.tsx` | code |
| A2 | Middleware `/admin/*` prefix matching + auth redirect | code |
| A3 | Per-action role re-check in every admin server action | code |
| A4 | Remove `src/lib/mock-users.ts` hardcoded creds | code |
| C5 | Timezone canonicalization (wall-clock minutes) | code |
| C1/C2 | Fix F2 (booking derivation) + manual-booking `user_id` migration | code+mig |
| B2 | Close F5/F6 (`/api/bookings` identity + bookingSource) | code |
| F1/F2 | Fix `getBookingsForCourtDate` date param; wire expiry or delete dead path | code |
| D1+B4 | Courts form constraints + slots | code |
| C4 | Pagination/limit strategy for admin lists | code |
| G1 | Tests: admin role, RLS-as-admin, timezone dual-TZ, double-booking | tests |
| H1 | Final regression: `tsc`, lint, Vitest, Playwright, build | verify |

## 10. Phase 3+ Plan

- Phase A: security/authz hardening (checklist A*, B*)
- Phase B: correctness fixes (C*)
- Phase C: admin shell (sidebar/topbar layout, design tokens)
- Phase D: feature slices, starting with `/admin/bookings`, then overview, calendar, courts, customers, messages
- Phase E: tests + regression (G1/H1)

## 11. B1 Live Verification Results (2026-10-08, read-only)

Run: PostgREST OpenAPI + access matrix + password-grant probes against `bwwifvuerhxgjeoochnp.supabase.co`.

- **Schema drift: NONE.** 16/16 live tables = `docs/0001_supabase_schema.sql` list, no extras, no missing.
- **`bookings.user_id` is NOT NULL on live** → confirms Option D migration is required for manual bookings.
- **Live RPC (PostgREST-exposed): `get_my_role`, `is_admin`** only (other repo functions are triggers/not exposed).
- **RLS behavior verified:**
  - anon: 401/42501 on bookings, profiles(rows 0), notifications, payments, blocked_periods, contact_submissions, event_registrations, sponsorship_requests, advertisement_requests, system_settings
  - anon: reads OK on public content tables (courts, events, faqs, testimonials, advertising_spaces, sponsors)
  - admin: all bookings (5), all profiles (26), all notifications (283)
  - user A: own only (3 bookings, 1 profile, 179 notifications)
- **`is_admin()` per identity:** admin=true, userA=false, anon=false.
- Still UNKNOWN: exact policy definitions/owners (needs DB password or Management API PAT), deploy `TZ`.

## 12. Phase 3 Progress Log

| ID | Item | Status (2026-10-08) |
|----|------|---------------------|
| A1 | Server admin layout guard | DONE — `src/app/admin/layout.tsx` (fail-closed, RLS-read role) |
| A2 | Middleware `/admin/*` prefix refresh | DONE — `src/middleware.ts` prefixes |
| A3 | Per-action role re-check | VERIFIED — already present in all admin actions |
| B1 | Live RLS/schema verification | DONE — no drift; behavior matches §11 |
| A4 | Remove mock admin creds from `src/` | DONE — moved to `scripts/fixtures/mock-users.ts` |
| B2 | `/api/bookings` identity + bookingSource | DONE — cookie-session identity only; `booking_source` forced `'ONLINE'` |
| C5 | Timezone wall-clock canonicalization | TODO |
| C1/C2 | Manual booking (`user_id` nullable + WALK_IN) | TODO |
| F1/F2 | `getBookingsForCourtDate` date bug; expiry wiring | TODO |
| D1/B4, C4, G1, H1 | courts form, pagination, tests, regression | TODO |

