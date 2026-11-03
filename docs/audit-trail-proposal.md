# Audit-Trail Proposal — K-HUB (document only, NOT applied)

**Status:** Proposal. **No schema, RLS, trigger, or function changes have been made to the live database.** Applying anything below requires explicit user approval and a staged migration.

## 1. Problem statement

K-HUB currently has no durable, append-only record of security-relevant mutations. State changes (customer status updates, booking cancellations, payment lifecycle transitions, notification sends/deletes, court archive/delete) are only observable indirectly — by diffing the live table or by reading application logs on a specific server. Gaps observed during this session's review:

- **No attribution history.** `profiles.status` can be flipped (Active/Inactive/Suspended) by an admin, but there is no record of *who* flipped it, *when*, or *from what value*.
- **No change history on mutable rows.** Bookings have an immutability trigger for protected fields, but cancelled/staff-adjacent fields can still change without any trail.
- **Notification admin-sends and deletes are untraceable.** A hard `DELETE` on notifications leaves no residue by design (immutability trigger prevents UPDATE-faking, but deletion itself vanishes).
- **Incident investigation is impossible after the fact.** During this session, the payment idempotency-collision flake required reconstructing behavior from unit tests; with an audit trail, the exact request sequence would have been queryable in Supabase directly.

## 2. Design goals

1. **Append-only.** Even admins cannot UPDATE or DELETE audit rows — enforced by RLS (no policies granting those ops) rather than by a trigger.
2. **DB-level capture, not app-level.** Triggers capture changes made by *any* path (server actions, service-role scripts, SQL console, future integrations), so an app refactor cannot silently bypass auditing.
3. **Self-contained functions.** All trigger functions are `SECURITY DEFINER` with `SET search_path = public, pg_temp` (existing codebase convention — `is_admin()`, `handle_updated_at()`).
4. **Cheap on hot paths.** JSONB diffs of changed columns only, no reflection-heavy before-images, no synchronous side effects.

## 3. Schema (migration sketch)

```sql
CREATE TABLE public.audit_log (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    actor_id      uuid        NULL REFERENCES public.profiles(id),
    -- auth.uid() at statement time; NULL for service-role/worker paths
    actor_role    text        NULL,      -- role copied at write time (denormalized, tamper-evident-ish)
    action        text        NOT NULL,  -- 'insert' | 'update' | 'delete' | 'status_change' | ...
    table_name    text        NOT NULL,  -- e.g. 'profiles', 'bookings'
    row_id        uuid        NULL,      -- PK of the affected row (nullable for composite cases)
    changed       jsonb       NOT NULL DEFAULT '{}'
                  -- { column: { from, to } } only for columns that actually changed
);

CREATE INDEX idx_audit_log_table_time ON public.audit_log (table_name, created_at DESC);
CREATE INDEX idx_audit_log_actor_time ON public.audit_log (actor_id, created_at DESC);

-- RLS: read for admins only; NO insert/update/delete policies for user roles
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view audit log" ON public.audit_log
    FOR SELECT USING (public.is_admin());
-- Deliberately NO insert policy: service_role/DEFINER functions bypass RLS;
-- anon/authenticated roles get nothing, so app users can never write audit rows.
```

## 4. Capture strategy

### 4a. Generic UPDATE-diff trigger (core piece)

```sql
CREATE OR REPLACE FUNCTION public.fn_write_audit_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    diff jsonb := '{}'::jsonb;
    col  text;
    old_v text; new_v text;
BEGIN
    FOR col IN SELECT jsonb_object_keys(to_jsonb(NEW)) LOOP
        -- Skip volatile columns that add noise
        CONTINUE WHEN col IN ('updated_at');
        old_v := NULLIF(to_jsonb(OLD)->>col, 'null'::text);
        new_v := NULLIF(to_jsonb(NEW)->>col, 'null'::text);
        IF old_v IS DISTINCT FROM new_v THEN
            diff := diff || jsonb_build_object(col,
                     jsonb_build_object('from', old_v, 'to', new_v));
        END IF;
    END LOOP;
    IF diff <> '{}'::jsonb THEN
        INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, changed)
        VALUES (auth.uid(), public.get_my_role(), 'update',
                TG_TABLE_NAME,
                (to_jsonb(NEW)->>'id')::uuid,
                diff);
    END IF;
    RETURN NEW;
END;
$$;
```

### 4b. Priority tables for rollout (phase 1)

| Table | Trigger events | Why first |
|---|---|---|
| `profiles` | UPDATE | Admin customer-status changes (`status`, `role` — privilege escalation attempts become visible) |
| `bookings` | UPDATE (+note on INSERT from server action already authenticated) | Cancellations, status transitions; complements the immutable-fields trigger |
| `payments` | INSERT, UPDATE | Payment lifecycle transitions (Pending→Paid→Refunded); would have made the idempotency-collision investigation trivial |
| `courts` | UPDATE, DELETE | Archive/delete decisions (court auditing is currently invisible) |
| `notifications` | INSERT, DELETE | Admin sends (attribution: which admin sent what) and deletes (the only trace a deletion ever happened) |

Blocked-periods and events can join phase 2 without redesign.

### 4c. DELETE capture

Same pattern: `FOR EACH ROW EXECUTE` on DELETE rows with `action='delete'` and a compact before-image (`to_jsonb(OLD)` restricted to id + business keys + status).

## 5. Retention & operations

- **Retention window:** 12 months suggested; a scheduled `DELETE FROM audit_log WHERE created_at < now() - interval '12 months'` (service-role/pg_cron) is the only sanctioned delete path. Need explicit decision: Supabase free tier has no pg_cron — a n8n scheduled job or a Supabase Edge Function cron can run it monthly.
- **Proxy actor:** server actions run as the authenticated user, so `auth.uid()` is correct for user-initiated flows. For any service-role batch path, set an explicit `actor_id IS NULL` + `action='system'` convention.
- **Explore/AI-access:** the table is Admin-readable through the normal app/REST path; the `audit_log` view JSON should be added to the API inventory later.

## 6. Risks / things to decide before applying

1. **Row volume.** Notifications INSERT is high-frequency (auth-era welcome + booking notifications per booking). Phase 1 could capture notifications with a `WHERE NEW.type <> 'system'` filter or defer notifications INSERT auditing until volume is measured.
2. **`auth.uid()` inside SECURITY DEFINER trigger** reads the JWT's ctx, not the function owner — this is the right behavior, but must be verified with a live probe after the migration (as done in this session for other policies).
3. **Existing `handle_updated_at()`** triggers coexist fine; the audit function keys off `TG_TABLE_NAME` so one function deploys everywhere.
4. **Schema-lens impact.** New table changes the 16-table inventory; future inspection runs must re-baseline.
5. **No backfill.** Historical changes (already-made status flips) cannot be retro-audited; the trail starts at deploy time.

## 7. What this proposal does NOT include

- No migration files were created under `supabase/migrations/`.
- No `GRANT`, policy, trigger, or function objects touched on the live database.
- No schema inspection scripts left behind (temp inspect scripts deleted).
- No app-server changes for writing to `audit_log` directly (triggers are the only writer).
