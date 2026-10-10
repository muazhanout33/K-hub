# C1/C2 — Manual Booking Architecture & Database Design Audit

Read-only audit. Date: 2026-10-09. Baseline: `3d49304` (clean tree). Live DB: `bwwifvuerhxgjeoochnp.supabase.co` (B1 verification 2026-10-08 + repo evidence). No code, migrations, or data changed.

## 1. Current-state findings

| # | Fact | Evidence |
|---|------|----------|
| 1 | `bookings.user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT` — walk-in booking impossible without a profile row | `docs/0001_supabase_schema.sql:129`; live-verified NOT NULL (B1, §11 of admin baseline) |
| 2 | `profiles.id` is 1:1 with `auth.users(id) ON DELETE CASCADE` — every profile implies a real auth account | schema `:68-69` |
| 3 | `booking_source_enum` already has `'WALK_IN'` and `'ADMIN'`; app code hardcodes `'ONLINE'` and API rejects the others | schema `:40`; `booking.actions.ts:112`; `api/bookings/route.ts:156-159` (B2) |
| 4 | Denormalized contact snapshot already exists: `user_name`, `user_email`, `user_phone` NOT NULL on bookings — a walk-in customer can be described without an account | schema `:136-138` |
| 5 | Conflict protection is engine-level: GiST `prevent_double_booking` (court_id =, booking_range &&) WHERE status IN ('Reserved','Confirmed') — independent of `user_id` | schema `:147-150` |
| 6 | Immutability trigger: `user_id`, `court_id`, `total_price`, `booking_range` cannot change after insert (`IS DISTINCT FROM` handles NULL correctly: NULL IS DISTINCT FROM NULL = false) | schema `:409-434` |
| 7 | RLS INSERT `auth.uid() = user_id OR is_admin()`: non-admin inserting `user_id = NULL` evaluates NULL → denied; admin allowed. No policy change needed for nullable | schema `:547-548` |
| 8 | RLS SELECT `auth.uid() = user_id OR is_admin()`: NULL rows are invisible to normal users (NULL = uuid → NULL), visible to admins. Customer privacy preserved | schema `:544-545` |
| 9 | Cancel path: `booking.user_id === authData.user.id` → NULL !== id → falls through to admin role check. Walk-in bookings are admin-cancellable today with zero code change | `booking.actions.ts:192-204` |
| 10 | `notifications.user_id` is NOT NULL FK → walk-in bookings cannot receive customer notifications | schema `:176` |
| 11 | Client reads (`useSupabaseBookings`, `GET /api/bookings`) filter `user_id=eq.<me>` → walk-in rows never leak to customers; admin reads (`getBookingsForAdmin`) have no user filter | hooks/actions |
| 12 | Payments SELECT policy joins `b.user_id = auth.uid() OR is_admin()` → NULL-safe (payments currently mock-only anyway) | schema `:574-579` |
| 13 | L1 per-user cap (max 5 active) counts by `user_id` — NULL walk-ins would bypass; action is the only enforcement point | `booking.actions.ts:82-95` |
| 14 | `expireStaleBookingsAction` has no user filter → works for NULL rows unchanged | `booking.actions.ts:425-445` |
| 15 | App code has **no service-role client** (anon+cookies only; service role only in `scripts/`) | `src/lib/supabase/*` |

## 2. Approaches compared

### A — Create a real auth account per walk-in (service role `auth.admin.createUser`)
- Mechanism: server action uses service-role key to create `auth.users` row (+ trigger creates profile), sets `user_id` to it.
- **Consequences (explicit):** phantom accounts the customer cannot control (no password; reset-link emails to addresses they may not own); synthetic email needed because `profiles.email` is UNIQUE NOT NULL → collides if the real person later signs up with the same email (split-brain identity or UNIQUE violation); `handle_new_user` trigger fires, granting them a login surface if they obtain a reset link; service-role key must enter app runtime (expands secret blast radius beyond `scripts/`); welcome/notification emails target dead accounts; violates the audit constraint "do not assume a fake auth user is free" — it is not.
- Data integrity: OK. Customer history: exact. Security: **weakens** the auth model. Migration risk: none (no schema change). Maintainability: poor (account lifecycle mess).
- **Rejected.**

### B — Nullable `user_id` + denormalized contact snapshot (prior "Option D")
- Mechanism: `ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL`. Existing customer → `user_id = <profile id>`; walk-in → `user_id = NULL` + `user_name/user_email/user_phone`. `booking_source = 'WALK_IN'` server-derived. Default `status = 'Confirmed'`.
- Data integrity: strong (FK still enforced when present; exclusion constraint untouched). Customer history: exact for registered; heuristic (email/phone match on denormalized columns) for walk-ins. Security: **RLS already NULL-safe** (findings 7–12) — no policy changes; non-admins still cannot insert or see NULL rows. Migration risk: **minimal** — single `DROP NOT NULL`, no rewrite/backfill, table has 5 rows, MVCC-safe, instantly reversible (`SET NOT NULL` while no NULLs exist). Maintainability: excellent — one column change; `customers` table can still be added later on top.
- **Recommended.** Matches the Phase 1–2 approved decision (baseline §6.1–3) — this audit confirms it with policy-level evidence.

### C — Separate `customers` table for walk-ins (`bookings.customer_id` FK)
- Mechanism: new table with name/email/phone (+ RLS + admin CRUD); bookings carry either `user_id` or `customer_id`.
- Data integrity: good. Customer history: best for returning walk-ins (durable identity, upsert by phone). Security: needs new RLS surface. Migration risk: moderate (new table, new policies, dual-source joins everywhere). Maintainability: scope creep for MVP — every customer-facing query must union two sources; Admin Dashboard "customers" page becomes two-mode.
- **Deferred** — can be layered on B later (`customer_id` nullable, rows with `user_id IS NULL`) without reworking B.

### D — SECURITY DEFINER RPC / service-role insert path
- Implementation vehicle, not an identity model. Rejected for MVP: admin cookie session + existing `is_admin()` RLS already permits the insert (finding 7); an RPC would duplicate validation and add a PostgREST-exposed surface. Revisit only if client-side PostgREST admin writes become untenable.

## 3. Recommendation

**Approve B (Option D): nullable `user_id` + denormalized contact, `WALK_IN` source, `Confirmed` default.** It is the only approach that (1) requires no auth-model change, (2) needs zero RLS edits because the three booking policies are already NULL-correct, (3) is a one-line reversible migration, (4) preserves `prevent_double_booking` and the immutability trigger verbatim, and (5) was already approved in Phase 1–2 — this audit found no evidence against it.

## 4. Proposed design (for implementation after approval)

### Migration (new file `supabase/migrations/20261009000001_make_bookings_user_id_nullable.sql`)
```sql
ALTER TABLE public.bookings ALTER COLUMN user_id DROP NOT NULL;
-- FK stays: REFERENCES profiles(id) ON DELETE RESTRICT (applies only when user_id IS NOT NULL)
```
No other schema change. No RLS change. No backfill. Update hand-written `src/types/database.types.ts`: `DbBooking.user_id: string | null`; `Booking.userId: string | null`; `mapDbBookingToBooking` already passes through (`mappers.ts:253`).

### Server action: `createManualBookingAction` (new, in `booking.actions.ts` or `manual-booking.actions.ts`)
Gate: `requireUserSession` + `getUserRole === 'Admin'` (A3 pattern — fail closed).
Payload: `{ courtId, date, startTime, endTime, durationMinutes, customer: { existingUserId } | { name, email?, phone } }`.
Behavior:
1. Validate payload (below). If `existingUserId`: load profile, must exist (and `status <> 'Suspended'` — recommend reject Suspended, decision to confirm).
2. Court exists/Available-or-Starts-Sour; `isSlotPast` (same rule as online); blocked-period `ov` check; `formatTstzrange`; **price recomputed server-side** via `calculateBookingPrice` (never trust payload).
3. Insert with `user_id = existingUserId ?? null`, `user_name/email/phone` snapshot (from profile when existing; from payload for walk-in), `booking_source = 'WALK_IN'`, `status = 'Confirmed'`, fresh `booking_number`.
4. Handle `23P01`/`prevent_double_booking` → 409-style friendly conflict (same as online path).
5. Notification: insert `new_booking` notification **only when `user_id IS NOT NULL`** (notifications.user_id NOT NULL).
6. Skip L1 5-booking cap for manual bookings (front-desk flexibility; documented decision).

### Validation rules (manual action)
- `date` `YYYY-MM-DD`, `startTime`/`endTime` `HH:mm`; duration 60–240 min and consistent with start/end; within court working hours (reuse `validateBookingRequest` pieces).
- Walk-in: `name` required (trimmed, 2–100 chars), `phone` required (loose `^\+?[\d\s-]{7,20}$`), `email` optional (if present, format-checked; stored trimmed or `''` — column is TEXT NOT NULL with no CHECK, empty string is the established degenerate value, same as `api/bookings/route.ts:176`).
- `existingUserId` XOR walk-in object — never both, never neither.

### RLS considerations
- **No policy edits.** Documented invariants to encode as tests: non-admin cannot INSERT NULL user_id (WITH CHECK fails); walk-in rows invisible in user SELECT; admin SELECT/UPDATE/DELETE unaffected; user UPDATE of own booking still constrained by immutable-fields WITH CHECK + trigger.

### Existing-customer vs walk-in flows
- **Existing:** admin UI searches `profiles` by email/phone (admin can read all — B1 verified). Server action re-verifies profile existence + not Suspended. Snapshot copies name/email/phone at booking time (immutable later — matches online behavior).
- **Walk-in:** capture name/phone (+optional email) → `user_id NULL`. History: display-time heuristic — match bookings by normalized `user_email`/`user_phone` (no new table; note false positives on shared phone numbers; C's customers table is the durable fix, deferred).
- Wrong-customer mistakes: immutability trigger forbids reassignment — correct flow is admin-cancel + recreate (document in admin UI copy later).

## 5. Risks (accepted/mitigated)

| Risk | Severity | Mitigation |
|---|---|---|
| Walk-in history fragmented across NULL rows (phone typo = new identity) | Medium (product) | Heuristic display match now; customers table (approach C) later |
| `user_email = ''` degenerate values accumulate | Low | Optional-email policy; future CHECK with `''` allowed explicitly |
| L1 cap bypassed on manual path | Low | Admin-only action; documented |
| `booking_number` random 6-digit collision → unique violation | Low (pre-existing) | Same generator as online; consider retry loop in manual action |
| Payments not recorded for manual bookings | Known (payments mock-only platform-wide) | Out of scope; status='Confirmed' per approved decision |
| Live migration on production | Low | One-line `DROP NOT NULL`; takepg_dump backup first; instantly reversible while no NULLs (or after) |

## 6. Phased implementation plan (post-approval)

1. **P1 — Schema:** migration file `20261009000001_make_bookings_user_id_nullable.sql`; verify on local Supabase; apply to live (backup first); update `database.types.ts` + any `user_id: string` types (`DbBooking`, `Booking.userId`, cancel-action cast at `booking.actions.ts:181`).
2. **P2 — Action:** `createManualBookingAction` per §4; reuse pricing/timezone/mappers; no service role.
3. **P3 — Tests (required before rollout):** unit — payload validation matrix (walk-in required fields, duration bounds, Suspended reject); integration (mocked chain, A3-style) — role gate rejects User/anonymous, insert payload asserts `user_id: null | <id>`, `booking_source: 'WALK_IN'`, `status: 'Confirmed'`, price server-computed, 23P01 → friendly conflict, notification skipped for NULL; RLS-as-real-DB (extend `rls-boundary.test.ts` patterns) — NULL-insert denied for non-admin, walk-in row invisible to user SELECT, visible to admin; typecheck `tsc` + lint + build; existing 629-test suite green under 3 TZs.
4. **P4 — Admin UI** (`/admin/bookings` manual-create form + customer search) — separate task after this schema+action layer lands.

## 7. Exact next implementation step

Create `supabase/migrations/20261009000001_make_bookings_user_id_nullable.sql` (single `ALTER COLUMN user_id DROP NOT NULL`), update `src/types/database.types.ts` and the `booking.actions.ts:181` cast to `string | null`, and add the RLS/NULL unit+integration tests from P3 — **pending your approval; nothing executed yet.**
