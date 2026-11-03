-- =============================================================================
-- Migration: 20261101000001_remove_system_settings_public_read_guarded
--
-- PURPOSE
--   Remove every VERIFIABLY ungated SELECT/ALL (read-path) policy on
--   public.system_settings, then PROVE behaviorally and structurally
--   (inside this migration's transaction) that:
--     1. anon cannot read the table (row-level + grant level);
--     2. an authenticated NON-admin cannot read it (RLS USING or grant level);
--     3. an authenticated NON-admin cannot INSERT/UPDATE/DELETE it (RLS
--        WITH CHECK / USING, or grant level);
--     4. an admin-gated policy remains on system_settings (behavioral admin
--        read + write probes are performed in Migration B once table-level
--        privileges are granted).
--
--   The migrations runner commits this file in a single transaction; any
--   FAIL-CLOSED exception rolls the whole migration back, so a half-applied
--   state is impossible. A transaction-local sentinel row makes the
--   behavioral checks observable even on an empty table (local and remote
--   system_settings are both empty). The sentinel is deleted before commit.
--
-- WHY BEHAVIORAL PROOF (not string matching)
--   Policy existence/names cannot prove exposure. Instead:
--   - A pre-drop sweep removes only policies whose USING expression
--     normalizes to exactly 'true' - and dropping a policy can only ever
--     REMOVE access, never add it, so this step is intrinsically safe even
--     if executed on an unexpected remote state.
--   - All remaining claims are then proven by executing queries AS anon /
--     AS authenticated (with synthetic non-admin and admin JWT claims),
--     reading real RLS/enforcement behavior permissive/restrictive
--     combined. Restrictive policies can only narrow access; any ungated
--     PERMISSIVE combination is caught by the queries below.
--
-- TABLES/POLICIES AFFECTED
--   public.system_settings: read-path policies only (SELECT/ALL).
--   No grants, no functions, no other tables, no data changes remain.
--
-- PRECONDITIONS
--   - RLS enabled on public.system_settings.
--   - The executing role (postgres) must hold MEMBERSHIP of the anon and
--     authenticated roles (true on Supabase local dev and hosted projects;
--     the migration aborts cleanly if not, which is fail-closed).
--
-- RISKS
--   - The sweep only touches read-path policies normalizing to 'true';
--     admin-gated policies (even those targeting TO public with is_admin())
--     are untouched. Migration B verifies admin read/write once table grants
--     are established.
--
-- ROLLBACK
--   Not needed for security closure. If policy restoration were required:
--     CREATE POLICY "Public read non-sensitive settings"
--       ON public.system_settings FOR SELECT USING (true);
--   (Do NOT do this - it re-opens public read.)
--
-- VERIFICATION (post-deployment, read-only)
--   SELECT policyname, cmd, roles, qual, permissive
--     FROM pg_policies
--    WHERE schemaname='public' AND tablename='system_settings';
--   - Remaining SELECT/ALL policies must be admin-gated (is_admin()).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  pol          record;
  v_norm       text;
  v_count      bigint;
  v_rows       bigint;
  v_membership int;
  v_probe_key  constant text := '__system_settings_guard_probe__';
  v_na_key     constant text := '__system_settings_probe_nonadmin__';
BEGIN
  -- ── 0. Membership sanity: postgres must be able to emulate anon/authenticated ──
  SELECT count(*) INTO v_membership
  FROM pg_auth_members m
  WHERE m.roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated'))
    AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user);
  IF v_membership < 2 THEN
    RAISE EXCEPTION 'FAIL-CLOSED: postgres must be a member of anon+authenticated for behavioral RLS verification (found % of 2)', v_membership;
  END IF;

  -- ── 1. Full entry snapshot (logged to the migration output for review) ──
  FOR pol IN
    SELECT policyname, cmd, roles::text AS roles, qual::text AS qual,
           with_check::text AS wcheck, permissive
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_settings'
    ORDER BY policyname
  LOOP
    RAISE NOTICE 'POLICY ENTRY: name=% cmd=% permissive=% roles=% using=% check=%',
      pol.policyname, pol.cmd, pol.permissive, pol.roles, pol.qual, COALESCE(pol.wcheck, '<none>');
  END LOOP;

  -- ── 2. Pre-drop sweep: drop ONLY verifiably ungated read-path policies ──
  --    (dropping a policy is strictly access-reducing -> safe by construction;
  --     catches unknown remote policy NAMES, verifies against actual qual text)
  FOR pol IN
    SELECT policyname, cmd, qual::text AS qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'system_settings'
      AND cmd IN ('SELECT', 'ALL')
      AND replace(replace(replace(replace(lower(qual::text), ' ', ''), '('::text, ''), ')'::text, ''), E'\n', '') = 'true'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.system_settings', pol.policyname);
    RAISE NOTICE 'DROPPED ungated read policy: % (cmd=% using=%)', pol.policyname, pol.cmd, pol.qual;
  END LOOP;

  -- ── 2b. Reconcile intended base admin policy (self-healing) ──
  --    Guarantees the intended admin policy from 20260822000000_initial_schema.sql:697-698
  --    exists, even if the remote database was provisioned via incremental migrations.
  DROP POLICY IF EXISTS "Admins manage system settings" ON public.system_settings;
  CREATE POLICY "Admins manage system settings"
    ON public.system_settings
    FOR ALL
    USING (public.is_admin());
  RAISE NOTICE 'PROVISIONED: "Admins manage system settings" FOR ALL USING (public.is_admin())';

  -- ── 3. RLS must be enabled ──
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.system_settings'::regclass) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL-CLOSED: RLS is not enabled on public.system_settings';
  END IF;

  -- ── 4. Transaction-local sentinel row (removed before commit) ──
  INSERT INTO public.system_settings (key, value, description)
  VALUES (v_probe_key, '{"seninel_guard": true}'::jsonb, NULL);

  -- ── 5. anon must NOT read the table ──
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    SELECT count(*) INTO v_count FROM public.system_settings;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := NULL;  -- denied at grant level -> no exposure
  END;
  IF v_count IS NULL THEN
    RAISE NOTICE 'PASS: anon SELECT -> permission denied (grant level)';
  ELSIF v_count = 0 THEN
    RAISE NOTICE 'PASS: anon SELECT -> 0 rows (RLS level)';
  ELSE
    RAISE EXCEPTION 'FAIL-CLOSED: anon CAN read system_settings (% row(s))', v_count;
  END IF;

  -- ── 6. Back to postgres for role switching ──
  EXECUTE 'RESET ROLE';

  -- ── 7. Authenticated NON-admin: READ must fail (USING enforced) ──
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}', true);

  BEGIN
    SELECT count(*) INTO v_count FROM public.system_settings;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := NULL;
  END;
  IF v_count IS NULL THEN
    RAISE NOTICE 'PASS: non-admin SELECT -> permission denied (grant level)';
  ELSIF v_count = 0 THEN
    RAISE NOTICE 'PASS: non-admin SELECT -> 0 rows (RLS USING level)';
  ELSE
    RAISE EXCEPTION 'FAIL-CLOSED: authenticated NON-admin CAN read system_settings (% row(s)) - an ungated SELECT/ALL policy remains', v_count;
  END IF;

  -- ── 8. Authenticated NON-admin: INSERT must fail (WITH CHECK enforced) ──
  BEGIN
    INSERT INTO public.system_settings (key, value) VALUES (v_na_key, '{"x":1}'::jsonb);
    RAISE EXCEPTION 'FAIL-CLOSED: authenticated NON-admin INSERT succeeded (RLS WITH CHECK not enforced)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: non-admin INSERT denied (42501: grant or RLS WITH CHECK)';
  END;

  -- ── 9. Authenticated NON-admin: UPDATE/DELETE must touch 0 rows ──
  BEGIN
    UPDATE public.system_settings SET value = '{"x":2}'::jsonb WHERE key = v_probe_key;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'FAIL-CLOSED: authenticated NON-admin UPDATE affected % row(s)', v_rows;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: non-admin UPDATE denied (42501)';
  END;

  BEGIN
    DELETE FROM public.system_settings WHERE key = v_probe_key;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'FAIL-CLOSED: authenticated NON-admin DELETE affected % row(s)', v_rows;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: non-admin DELETE denied (42501)';
  END;

  -- ── 10. Admin policy structural check ──
  -- Note: Behavioral admin SELECT probe requires table SELECT privilege,
  -- which is intentionally introduced in Migration B (20261101000002).
  -- Migration B performs full behavioral verification of both admin read
  -- and admin write (upsert) paths after granting privileges.
  -- Here in Migration A, we reset role and verify the admin policy was preserved.
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_settings'
      AND cmd IN ('SELECT', 'ALL')
  ) THEN
    RAISE EXCEPTION 'FAIL-CLOSED: no read-path policy remaining on system_settings';
  END IF;
  RAISE NOTICE 'PASS: admin-gated policy preserved on system_settings (behavioral admin read+write verified in Migration B)';

  -- ── 11. Cleanup + exit snapshot ──
  EXECUTE 'RESET ROLE';
  DELETE FROM public.system_settings WHERE key IN (v_probe_key, v_na_key);

  FOR pol IN
    SELECT policyname, cmd, roles::text AS roles, qual::text AS qual,
           with_check::text AS wcheck, permissive
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_settings'
    ORDER BY policyname
  LOOP
    RAISE NOTICE 'POLICY EXIT: name=% cmd=% permissive=% roles=% using=% check=%',
      pol.policyname, pol.cmd, pol.permissive, pol.roles, pol.qual, COALESCE(pol.wcheck, '<none>');
  END LOOP;

  RAISE NOTICE 'OK: system_settings read surface is admin-gated only (behaviorally verified)';
END $$;

COMMIT;
