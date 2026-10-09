# C5 — Timezone Canonicalization Audit

**Date:** 2026-10-09 · **Type:** read-only audit (no code/test/config/schema/migration changes) · **Baseline commit:** `196553d` (working tree unchanged at audit time)

---

## 1. Verdict

**Incorrect (mixed model).** The system does not use a single canonical timezone model. It is **Model B** for `tstzrange` columns (Cairo wall-clock digits annotated `+00`) and **Model C** overall (wall-clock ranges mixed with true-UTC metadata columns in the same row). Double-booking prevention is internally consistent and safe; cancellation-window and expiry enforcement are host-TZ dependent and wrong on non-Cairo hosts.

## 2. Implementation trace

| Concern | Location | Mechanism |
|---|---|---|
| Range write | `src/lib/mappers.ts:87-104` `formatTstzrange` | Builds `[YYYY-MM-DD HH:mm:ss+00, …)` from **wall-clock** digits; pure string concat, host-independent. All writers use it (app + all `scripts/phase9-*.mjs`, `scripts/test-double-booking.ts`, `scripts/seed-*`) |
| Range read | `src/lib/mappers.ts:55-78` `parseTstzrange` | Strips `+00`, `new Date(str)` (**host-local** parse), re-extracts via `toISOString()` (**UTC**) — two shifts that cancel only on UTC hosts |
| Cancellation window (server) | `src/app/actions/booking.actions.ts:206-229` | Strips `+00`, `new Date()` host-local parse vs `new Date()` true instant → host-dependent |
| Cancellation window (client) | `src/features/booking/useBookingStore.ts:24-34` | `cairoToday`/`cairoCurrentTime`/`toMinutes` wall-clock minutes → **correct on all hosts** |
| Expiry | `src/app/actions/booking.actions.ts:438-445` | `.lt('booking_range', [now,now])` is B-tree **lower-bound** ordering (probe-verified against live PostgREST 2026-10-09) → matched rows whose **start** had passed, expiring Reserved bookings ~2–3 h after their true start, not when their end passed; bound itself also true-UTC vs wall-clock digits |
| Cairo wall-clock helpers | `src/lib/timezone.ts:15-40,65-85` | `Intl.DateTimeFormat('Africa/Cairo')` → **correct on all hosts**; comment `:7` "UTC+2 (no DST)" is **factually wrong** since Egypt reinstated DST (Apr–Oct, UTC+3) |
| Calendar generation | `src/lib/dates.ts:97-148` | Host-local `new Date()` getters for month/day skeleton mixed with Cairo `getToday()` for `isToday` → deployment-dependent near midnight |
| Advertise min-date | `src/app/advertise/page.tsx:47` | `toISOString().split('T')[0]` → UTC date, not Cairo |
| Blocked periods display | `src/features/booking/BlockedPeriodsManager.tsx:56-62` | Strip `+00` + `new Date()` + local `getHours()` → digits round-trip on all hosts (local-parse + local-extract cancel out) — **currently safe** |
| My-bookings past split | `src/app/bookings/page.tsx:21-29` | `new Date(y,m-1,d,h,min)` host-local construction vs `new Date()` → treats wall-clock as host-local; correct only on Cairo hosts |
| Reservation timer | `src/features/booking/useReservationTimer.ts` | Epoch ms → TZ-independent ✓ |
| Pricing | `src/lib/pricing.ts` | TZ-free ✓ |
| SQL schema | `docs/0001_supabase_schema.sql:113,131,332-337,406-424` | `tstzrange` + exclusion constraint `court_id WITH =, booking_range WITH &&`; immutability trigger; no trigger rewrites ranges |

## 3. Verified data representation & unknowns

**Verified (code + live Supabase, service-role read-only probes):**
- `booking_range` stores Cairo wall-clock digits with `+00` (e.g. KH-135234 `["2026-09-21 22:00:00+00","2026-09-22 00:00:00+00")`, created 18:35Z). Metadata (`created_at`, `cancelled_at`) are true UTC instants → mixed within a row.
- `blocked_periods` empty; schema matches `docs/0001_supabase_schema.sql` (Phase B1, 16/16 tables).
- PostgREST `.lt('booking_range', …)` works on live data and applies range ordering (b-tree `<`, equivalent to upper < now for degenerate `[now,now]`).
- Roundtrip probe (`formatTstzrange→parseTstzrange`, run under `TZ=UTC` / `Africa/Cairo` / `America/New_York`): **OK on UTC, BAD on Cairo (−2 h) and NY (+5 h)**.
- Cancel-window probe at 1 h before true Cairo start: UTC host reports 3.00 h → **allows** (wrong); Cairo host 1.00 h → blocks (right); NY host 8.00 h → **allows** (wrong).
- Egypt DST via Node ICU: UTC+2 Jan/Apr-23, UTC+3 Jul/Apr-25/Oct-28, UTC+2 Oct-30 → transitions between Apr 23–25 and Oct 28–30 (last Fri Apr / last Thu Oct rule). `Africa/Cairo` Intl is authoritative.

**Unknowns (not verifiable in this audit):**
- Deployment host `TZ` (not assumed; fix below removes the dependency).
- DB RLS policy *definitions* (behavior verified in B1; definitions need DB password / Supabase PAT).

## 4. Findings

| # | Finding | Severity | Host-dependent? |
|---|---|---|---|
| F1 | `formatTstzrange` writes Cairo wall-clock as `+00` (Model B) — intentional per code comment `mappers.ts:57-58` | Design | No |
| F2 | `parseTstzrange` host-local parse + UTC extract → displays −2/+5 h shifts on non-UTC hosts | **High** | Yes (wrong on all non-UTC hosts) |
| F3 | Server cancel window (`booking.actions.ts:206-229`) host-dependent; on UTC/NY hosts allows cancelling until true start + 0–1 h (summer) | **High** | Yes (correct only on Cairo hosts) |
| F4 | Client `isWithinCancellationWindow` (correct wall-clock) **diverges** from server on non-Cairo hosts | Medium | Yes |
| F5 | Expiry `.lt(booking_range, [now,now])` compares the range **lower** bound (probe-verified 2026-10-09: b-tree ordering, matches rows that have STARTED) → Reserved bookings expired ~2–3 h after their true start (mid-booking for long slots), not at end as `docs/business-rules.md` intends; host-independent, deterministic | **High** | No (fixed: `.filter('booking_range','nxr',…)` = upper ≤ wall-clock now) |
| F6 | `expireStaleBookingsAction` has **no production UI caller** (`getBookingsForUser` itself uncalled; bookings page uses `useSupabaseBookings`); latent until wired | Info | — |
| F7 | `timezone.ts:7` / `dates.ts:4` comments claim "Cairo = UTC+2 (no DST)" — false since 2023 | Low (trap) | No |
| F8 | `dates.ts:97-148` `generateCalendarDays` mixes host-local getters with Cairo `getToday` → wrong month skeleton near midnight (21/22:00–00:00 Cairo on UTC hosts) | Medium | Yes |
| F9 | `advertise/page.tsx:47` UTC date instead of Cairo → off-by-one near midnight | Low | Yes |
| F10 | `BlockedPeriodsManager.tsx:56-62` local-parse + local-`getHours` → digits round-trip on all hosts; **currently safe** (fragile pattern though) | Info | No |
| F11 | `bookings/page.tsx:21-29` upcoming/past split treats wall-clock as host-local → wrong tab split on non-Cairo hosts | Medium | Yes |
| F12 | Exclusion constraint + all writers share one convention → double-booking detection internally consistent | Safe | No |
| F13 | DST edges (spring-forward nonexistent 00:00–00:59 hour; fall-back repeated hour) irrelevant under Model B; matter only if converting to true instants | Info | — |
| F14 | `toMinutes` pseudo-epoch (`y*366+m*31+d`) monotonic, TZ-free, adequate for current same-day uses | Info | No |
| F15 | Known flaky `src/lib/dates.test.ts:63` (memory: "must NOT fix") is exactly this bug family | Low | Yes |

## 5. Canonical architecture (recommended)

**Keep Model B — Cairo wall-clock canonical, no backfill** (matches previously approved decision #4). All comparisons happen in **wall-clock space**; no `Date` object ever round-trips a stored range. Host `TZ` becomes irrelevant.

1. **`parseTstzrange`**: extract digits by regex from the stored string (no `Date`, no `toISOString`).
2. **Cancel window**: compare wall-clock minutes — `toMinutes(cairoToday(), cairoCurrentTime())` vs slot wall-clock (same math the client already does); enforce identical constant client/server.
3. **Expiry**: build the comparison range from Cairo wall-clock now (`cairoToday`+`cairoCurrentTime` +`00`), same as stored convention → `.lt` fires at wall-clock end, i.e. on time. (Live probe verified PostgREST accepts this form.)
4. **`dates.ts` `generateCalendarDays` / advertise `todayISO` / `bookings/page.tsx` past-split**: derive "now" only from `cairoToday`/`cairoCurrentTime` helpers; never host-local getters or `toISOString().split`.
5. **Comments**: replace "UTC+2 (no DST)" with the real rule (DST Apr–Oct UTC+3, else UTC+2) and a "stored times are wall-clock" invariant note.
6. **Tests**: TZ matrix (UTC / Africa/Cairo / America/New_York) over mappers, cancel window, expiry, calendar generation; after refactor the pure string functions are host-independent by construction.

## 6. Minimal ordered implementation plan

1. `mappers.ts` — regex-based `parseTstzrange` (no `Date`); keep `formatTstzrange` unchanged.
2. `timezone.ts` — add `cairoWallClockNow(): { date, time }` (and a range-fragment helper for the expiry probe); fix the DST comment; same fix in `dates.ts:4`.
3. `booking.actions.ts` — rewrite cancel-window check (206-229) to wall-clock minutes via shared helper; rewrite expiry now-range (438-445) to wall-clock now; align error strings with client.
4. `useBookingStore.ts` — reuse the shared wall-clock window helper (delete duplicated logic).
5. `dates.ts:97-148`, `advertise/page.tsx:47`, `bookings/page.tsx:21-29` — Cairo-only "now" derivations.
6. Tests — new TZ-matrix unit tests; update `mappers.test.ts` roundtrips; leave `dates.test.ts:63` decision to the chosen model (it becomes deterministic after step 5).
7. No schema/migration/seed changes; no historical data touched.

## 7. Test matrix

| Case | TZ=UTC | TZ=Africa/Cairo | TZ=America/New_York |
|---|---|---|---|
| `format→parse` roundtrip (incl. midnight-crossover 22:00→00:00) | ✓ must pass | ✓ | ✓ |
| Cancel: 2 h 1 s before start → allowed | ✓ | ✓ | ✓ |
| Cancel: 1 h 59 m before start → `CANCELLATION_TOO_LATE` | ✓ | ✓ | ✓ |
| Cancel: after true start → blocked | ✓ | ✓ | ✓ |
| Expiry: end+1 s → Reserved matches `.lt`; end−1 s → no match | ✓ | ✓ | ✓ |
| `generateCalendarDays` first day = Cairo today (probe 22:30 Cairo = 19:30/20:30 UTC prev day) | ✓ | ✓ | ✓ |
| Client/server window agreement (same fixture) | ✓ | ✓ | ✓ |
| DST samples: slot on Apr 24 (spring-forward) & Oct 29 (fall-back) roundtrip + window | ✓ | ✓ | ✓ |

## 8. Migration / data-safety assessment

- **No migration required.** Storage format is unchanged (wall-clock `+00`). Historical rows stay untouched — no blind 2–3 h shifts.
- Fixing the *comparison* side automatically makes stored data "correct" in the wall-clock model; nothing to backfill.
- Exclusion constraint semantics unchanged; double-booking protection unaffected.
- The only behavior changes are: cancel window becomes correct on non-Cairo hosts (stricter there), expiry now fires when the stored wall-clock end has passed (`nxr`, upper ≤ now — replacing the old lower-bound filter that expired bookings ~2–3 h after their start), and displays stop shifting.

## 9. Decisions needing human approval

1. **Confirm Model B (wall-clock canonical, no backfill)** — vs Model A (convert to true instants + backfill; larger, riskier; not recommended).
2. **Cancel semantics**: wall-clock 2 h before slot start, strict `>` (client already does this; server will now match). Confirm `CANCELLATION_WINDOW_HOURS = 2` stays.
3. **Expiry semantics**: fire when Cairo wall-clock now > wall-clock end (on time). Confirm.
4. **DST edge policy**: accept wall-clock labels for the nonexistent (00:00–00:59 on spring-forward day) and repeated (fall-back) hours — no special handling. Confirm.
5. **Fix the currently-flaky `dates.test.ts:63`** as part of step 5 (it becomes deterministic) — previously frozen pending this audit.
6. Deployment host TZ remains unset/unassumed; post-fix it no longer matters.

## 10. Files likely to change

| File | Change |
|---|---|
| `src/lib/mappers.ts` | `parseTstzrange` → regex digit extraction |
| `src/lib/timezone.ts` | add `cairoWallClockNow` (+ range helper); fix DST comment |
| `src/lib/dates.ts` | fix comment; `generateCalendarDays` Cairo-only now |
| `src/app/actions/booking.actions.ts` | cancel window + expiry now-range → wall-clock |
| `src/features/booking/useBookingStore.ts` | share window helper with server |
| `src/app/advertise/page.tsx` | `todayISO` → `cairoToday()` |
| `src/app/bookings/page.tsx` | past-split → Cairo wall-clock |
| `src/lib/mappers.test.ts`, `src/lib/timezone.test.ts`, new `*.tz-matrix.test.ts` | TZ-matrix coverage |

**No changes:** schema, migrations, seeds, RLS, middleware, admin code (admin slices only *read* bookings; they benefit from the mapper fix automatically via `mapDbBookingToBooking`).

---

*Audit rules observed: read-only throughout; no deployment-host-TZ assumption; verified facts separated from assumptions; no secrets exposed; no cancel/expiry policy invented (existing `CANCELLATION_WINDOW_HOURS = 2` and expire-at-end intent from `docs/business-rules.md:115-145,320-360` preserved).*
