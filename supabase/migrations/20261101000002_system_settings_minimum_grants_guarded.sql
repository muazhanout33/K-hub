-- =============================================================================
-- Migration: 20261101000002_system_settings_minimum_grants_guarded
--
-- PURPOSE
--   Restore the MINIMUM table privileges that the settings admin feature
--   requires, now that public read is closed by 20261101000001:
--
--     - settings.actions.ts `getSettingsAction`  -> `.select().in('key', ...)`
--     - settings.actions.ts `updateSettingsAction` ->
--         `.upsert(..., { onConflict: 'key' })`
--         (supabase-js sends `Prefer: return=minimal,resolution=merge-duplicates`
--          -> PostgREST generates `INSERT ... ON CONFLICT (key) DO UPDATE`,
--          i.e. INSERT + UPDATE + read-the-row-nothing-returned minimalism)
--
--   => REQUIRED: SELECT, INSERT, UPDATE for authenticated.
--      NOT required / NOT granted: DELETE, TRUNCATE, REFERENCES, TRIGGER.
--      NOT granted: anon, PUBLIC. NO service-role changes (service_role
--      already satisfies the table and bypasses RLS).
--
--   RLS remains the authorization boundary: grants only enable the
--   mechanics; non-admin users remain blocked by the admin-only
--   is_admin()-gated policies (behaviorally verified at the end of this
--   migration, fail-closed).
--
-- TABLES/PRIVILEGES AFFECTED
--   public.system_settings only:
--     GRANT SELECT, INSERT, UPDATE               -> authenticated
--     REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER -> authenticated
--     REVOKE ALL                                 -> anon
--     REVOKE ALL                                 -> PUBLIC  (table-scoped ONLY;
--     no schema or unrelated-table privileges are touched. On Supabase the
--     default is no PUBLIC table grants, so this is a defensive no-op.)
--
-- PRECONDITIONS (all verified in-migration, fail-closed)
--   - Column public.system_settings."key" exists.
--   - A PRIMARY KEY or UNIQUE CONSTRAINT on exactly (key), or a UNIQUE
--     INDEX on exactly (key) exists -> required by ON CONFLICT (key).
--     Local DB ground truth: system_settings_pkey PRIMARY KEY (key).
--     Remote PK is NOT verifiable via REST (OpenAPI hides primaryKeys) ->
--     verified here at deployment time (read-only check).
--   - Migration 20261101000001 applied (admin-gated read surface).
--   - At least one profiles row with role='Admin' (behavioral probes).
--   - postgres is member of anon+authenticated (behavioral probes).
--
-- RISKS
--   - If the remote table lacks the unique key -> ABORT (no partial state),
--     because `ON CONFLICT (key)` would fail at runtime for admins.
--   - REVOKE DELETE/TRUNCATE/REFERENCES/TRIGGER from authenticated makes
--     the end state deterministic even if the remote previously held
--     non-minimal grants. None is used by any code path (verified across
--     src/), so this cannot break application behavior.
--   - Admin writes that used DELETE-based UX would break - none exist.
--
-- ROLLBACK
--     REVOKE SELECT, INSERT, UPDATE ON public.system_settings FROM authenticated;
--     (Fails closed: admins lose access = the pre-fix status quo.
--      Do NOT re-grant anon or PUBLIC.)
--
-- APPLICATION & REPAIR WORKFLOW
--   1. Preferred (automated via CLI):
--        npx supabase db push
--   2. Manual execution (via Supabase SQL Editor):
--        Run this file in the SQL Editor. Do NOT manually insert rows into
--        supabase_migrations.schema_migrations. Instead, sync the migration
--        history using the official Supabase CLI repair command:
--        npx supabase migration repair --status applied 20261101000002
--
-- VERIFICATION (post-deployment, read-only)
--   SELECT
--     has_table_privilege('authenticated', 'public.system_settings', 'SELECT') AS auth_sel,
--     has_table_privilege('authenticated', 'public.system_settings', 'INSERT') AS auth_ins,
--     has_table_privilege('authenticated', 'public.system_settings', 'UPDATE') AS auth_upd,
--     has_table_privilege('authenticated', 'public.system_settings', 'DELETE') AS auth_del,
--     has_table_privilege('anon', 'public.system_settings', 'SELECT') AS anon_sel,
--     has_table_privilege('public', 'public.system_settings', 'SELECT') AS public_sel;
--   Expected: auth_sel/auth_ins/auth_upd = t, auth_del/anon_sel/public_sel = f.
--   (has_table_privilege reports EFFECTIVE privileges, so a PUBLIC-level
--   grant would surface here as well.)
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_attnum  smallint;
  v_admin   uuid;
  v_probe_key  constant text := '__system_settings_guard_probe__';
  v_na_key     constant text := '__system_settings_probe_nonadmin__';
  v_count   bigint;
  v_rows    bigint;
  v_membership int;
BEGIN
  -- ── 0. Role membership sanity (fail-closed) ──
  SELECT count(*) INTO v_membership
  FROM pg_auth_members m
  WHERE m.roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated'))
    AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user);
  IF v_membership < 2 THEN
    RAISE EXCEPTION 'FAIL-CLOSED: postgres must be a member of anon+authenticated for behavioral verification (found % of 2)', v_membership;
  END IF;

  -- ── 1. Column + unique-key precondition for ON CONFLICT (key) ──
  SELECT a.attnum INTO v_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'public.system_settings'::regclass
    AND a.attname  = 'key'
    AND NOT a.attisdropped;

  IF v_attnum IS NULL THEN
    RAISE EXCEPTION 'FAIL-CLOSED: column public.system_settings."key" does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.system_settings'::regclass
      AND c.contype IN ('p', 'u')                     -- PK or UNIQUE constraint
      AND c.conkey = ARRAY[v_attnum]::smallint[]      -- exactly the single column (key)
      AND NOT c.condeferrable                         -- ON CONFLICT does not support deferrable constraints
  )
  AND NOT EXISTS (
    -- fallback: a bare UNIQUE INDEX on exactly (key) also satisfies PostgREST's
    -- ON CONFLICT requirement even though it is not a catalog constraint
    SELECT 1
    FROM pg_index ix
    WHERE ix.indrelid = 'public.system_settings'::regclass
      AND ix.indisunique
      AND ix.indnatts = 1
      AND ix.indkey[0] = v_attnum
      AND ix.indisvalid                               -- index must be valid and usable
      AND ix.indpred IS NULL                          -- ON CONFLICT (key) requires a non-partial index
      AND ix.indimmediate                             -- index must be non-deferrable
  ) THEN
    RAISE EXCEPTION 'FAIL-CLOSED: no valid, non-partial, non-deferrable PK/unique constraint/index on (key) - ON CONFLICT (key) upsert would fail for admins';
  END IF;
  RAISE NOTICE 'OK: valid unique key on (key) verified for ON CONFLICT';

  -- ── 2. Admin policies present and admin-gated (structural check; ──
  --       full behavioral proof happens in this same transaction) ──
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_settings'
      AND cmd IN ('SELECT', 'ALL')
  ) THEN
    RAISE EXCEPTION 'FAIL-CLOSED: no read-path policy on system_settings (apply 20261101000001 first)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_settings'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'FAIL-CLOSED: no write-path policy on system_settings';
  END IF;

  -- ── 3. Grants: exact minimum set ──
  GRANT SELECT, INSERT, UPDATE ON public.system_settings TO authenticated;

  REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.system_settings FROM authenticated;
  REVOKE ALL ON public.system_settings FROM anon;
  REVOKE ALL ON public.system_settings FROM PUBLIC;

  -- ── 4. Insert sentinel (as runner, bypassing RLS) for behavioral probes ──
  INSERT INTO public.system_settings (key, value, description)
  VALUES (v_probe_key, '{"seninel_guard": true}'::jsonb, NULL);

  -- ── 5. anon: no effective privileges at all (direct OR via PUBLIC) ──
  IF has_table_privilege('anon', 'public.system_settings', 'SELECT')
     OR has_table_privilege('anon', 'public.system_settings', 'INSERT')
     OR has_table_privilege('anon', 'public.system_settings', 'UPDATE')
     OR has_table_privilege('anon', 'public.system_settings', 'DELETE')
     OR has_table_privilege('anon', 'public.system_settings', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.system_settings', 'REFERENCES')
     OR has_table_privilege('anon', 'public.system_settings', 'TRIGGER') THEN
    RAISE EXCEPTION 'FAIL-CLOSED: anon retains effective privileges (direct or via PUBLIC)';
  END IF;
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    SELECT count(*) INTO v_count FROM public.system_settings;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := NULL;
  END;
  IF NOT (v_count IS NULL OR v_count = 0) THEN
    RAISE EXCEPTION 'FAIL-CLOSED: anon still reads system_settings (% rows)', v_count;
  END IF;
  RAISE NOTICE 'PASS: anon has no effective read (grant/RLS level)';
  EXECUTE 'RESET ROLE';

  -- ── 6. authenticated: exact privilege matrix (EFFECTIVE, incl. PUBLIC) ──
  IF NOT has_table_privilege('authenticated', 'public.system_settings', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.system_settings', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.system_settings', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL-CLOSED: authenticated lacks the required SELECT/INSERT/UPDATE';
  END IF;
  IF has_table_privilege('authenticated', 'public.system_settings', 'DELETE')
     OR has_table_privilege('authenticated', 'public.system_settings', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.system_settings', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.system_settings', 'TRIGGER') THEN
    RAISE EXCEPTION 'FAIL-CLOSED: authenticated retains privileges beyond the minimum set';
  END IF;
  IF has_table_privilege('public', 'public.system_settings', 'SELECT')
     OR has_table_privilege('public', 'public.system_settings', 'INSERT')
     OR has_table_privilege('public', 'public.system_settings', 'UPDATE')
     OR has_table_privilege('public', 'public.system_settings', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL-CLOSED: PUBLIC-level grant found on system_settings';
  END IF;
  RAISE NOTICE 'PASS: authenticated = SELECT/INSERT/UPDATE exactly (effective)';

  -- ── 7. NON-admin authenticated: RLS still the boundary ──
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}', true);

  SELECT count(*) INTO v_count FROM public.system_settings;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL-CLOSED: NON-admin reads % setting row(s) - RLS USING not enforced', v_count;
  END IF;
  RAISE NOTICE 'PASS: non-admin SELECT masked by USING (0 rows)';

  BEGIN
    INSERT INTO public.system_settings (key, value) VALUES (v_na_key, '{"x":1}'::jsonb);
    RAISE EXCEPTION 'FAIL-CLOSED: NON-admin INSERT succeeded (RLS WITH CHECK not enforced)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: non-admin INSERT denied by RLS WITH CHECK (42501)';
  END;

  -- ── 8. Admin authenticated: read + write path through real is_admin() ──
  EXECUTE 'RESET ROLE';
  SELECT id INTO v_admin
  FROM public.profiles
  WHERE role = 'Admin'
  ORDER BY created_at
  LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'FAIL-CLOSED: no profiles.role=Admin row found - cannot verify the admin read/write path';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    format('{"role":"authenticated","sub":"%s"}', v_admin), true);

  SELECT count(*) INTO v_count FROM public.system_settings WHERE key = v_probe_key;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL-CLOSED: admin read broken (got % rows, expected 1)', v_count;
  END IF;
  RAISE NOTICE 'PASS: admin SELECT -> 1 row';

  BEGIN
    -- Branch 1: INSERT branch (key does not exist yet -> exercises INSERT WITH CHECK)
    INSERT INTO public.system_settings (key, value)
    VALUES ('__system_settings_probe_admin__', '{"x":2}'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'FAIL-CLOSED: admin upsert (INSERT branch) affected % row(s), expected 1', v_rows;
    END IF;

    -- Branch 2: UPDATE branch (key already exists -> exercises conflict path, UPDATE USING and WITH CHECK)
    INSERT INTO public.system_settings (key, value)
    VALUES ('__system_settings_probe_admin__', '{"x":3}'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'FAIL-CLOSED: admin upsert (UPDATE branch) affected % row(s), expected 1', v_rows;
    END IF;
    RAISE NOTICE 'PASS: admin upsert (ON CONFLICT (key)) verified on both INSERT and UPDATE branches';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL-CLOSED: admin upsert failed: % (%)', SQLERRM, SQLSTATE;
  END;

  -- ── 9. Cleanup (admin role cannot DELETE - grant not given; runner does it) ──
  EXECUTE 'RESET ROLE';
  DELETE FROM public.system_settings
  WHERE key IN (v_probe_key, v_na_key, '__system_settings_probe_admin__');

  RAISE NOTICE 'OK: minimum grants in place; RLS boundary verified behaviorally';
END $$;

COMMIT;
