'use server';

import { createClient } from '@/lib/supabase/server';
import type { DbSystemSetting } from '@/types/database.types';
import {
  SETTING_DEFS,
  SETTING_KEYS,
  isAllowedSettingKey,
  validateSettingValue,
  coerceStoredValue,
  getSettingDefaults,
  SettingValue,
} from '@/lib/settings-registry';

// ── Result contracts (house style: narrow, per-action) ──

export interface GetSettingsResult {
  success: boolean;
  /** Merged view: stored values (coerced) over registry defaults. */
  values?: Record<string, SettingValue>;
  /** Keys with no stored row — currently served from defaults. */
  defaultKeys?: string[];
  /** Safe, user-facing message — never raw database output. */
  error?: string;
}

export interface UpdateSettingsResult {
  success: boolean;
  /** Merged view after the write (re-read, not echoed input). */
  values?: Record<string, SettingValue>;
  updatedKeys?: string[];
  fieldErrors?: Record<string, string>;
  error?: string;
}

const READ_ERROR = 'Unable to load settings. Please try again.';
const UPDATE_ERROR = 'Unable to save settings. Please try again.';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AdminGate =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * A3 authorization gate — identical semantics to
 * blocked-period.actions.ts:80-97: `auth.getUser()` → RLS-protected
 * `profiles.role` re-check → fail closed. Never trusts a client-supplied
 * identity or role; uses the caller's own session client (anon key, RLS
 * always on — no service role).
 */
async function requireAdmin(supabase: SupabaseServerClient): Promise<AdminGate> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return { ok: false, error: 'Authentication required.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (!profile || (profile as { role?: string }).role !== 'Admin') {
    return { ok: false, error: 'Admin access required.' };
  }

  return { ok: true, userId: authData.user.id };
}

/**
 * Read all allowlisted settings as a merged values map.
 *
 * - The query is filtered to the registry allowlist, so rows with any other
 *   key (e.g. legacy/foreign data) are never fetched or returned.
 * - Missing rows fall back to registry defaults (handled by the caller).
 * - Stored values are coerced through the registry — a corrupt row can never
 *   surface an out-of-range or mistyped value to the UI.
 * - Raw database errors are logged server-side only.
 */
async function readSettingsValues(
  supabase: SupabaseServerClient
): Promise<
  { ok: true; values: Record<string, SettingValue>; defaultKeys: string[] } | { ok: false }
> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', SETTING_KEYS);

  if (error) {
    console.error('settings actions: system_settings query failed:', error.message);
    return { ok: false };
  }

  const stored = new Map<string, unknown>();
  const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
  for (const row of rows) {
    if (isAllowedSettingKey(row.key)) {
      stored.set(row.key, row.value);
    }
  }

  const defaults = getSettingDefaults();
  const values: Record<string, SettingValue> = { ...defaults };
  const defaultKeys: string[] = [];

  for (const key of SETTING_KEYS) {
    if (stored.has(key)) {
      values[key] = coerceStoredValue(SETTING_DEFS[key], stored.get(key));
    } else {
      defaultKeys.push(key);
    }
  }

  return { ok: true, values, defaultKeys };
}

/**
 * Server Action: read the admin settings for `/admin/settings`.
 *
 * - Authorization: A3 re-check, fail closed (client guards are never the
 *   boundary). RLS is the data-level backstop once the public SELECT policy
 *   is removed (migration 20261101000000 — file-only, applied separately).
 * - Missing rows are NOT an error: defaults are served and reported via
 *   `defaultKeys` so the UI can badge them as "Default".
 * - No secrets are read or returned — only registry-allowlisted keys.
 */
export async function getSettingsAction(): Promise<GetSettingsResult> {
  try {
    const supabase = await createClient();

    const gate = await requireAdmin(supabase);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    const result = await readSettingsValues(supabase);
    if (!result.ok) {
      return { success: false, error: READ_ERROR };
    }

    return {
      success: true,
      values: result.values,
      defaultKeys: result.defaultKeys,
    };
  } catch (err: unknown) {
    console.error('getSettingsAction failed:', err);
    return { success: false, error: READ_ERROR };
  }
}

/**
 * Server Action: update allowlisted settings (partial updates supported).
 *
 * - Authorization: A3 re-check, fail closed. The RLS `Admins manage system
 *   settings` policy (FOR ALL USING is_admin()) is the write boundary.
 * - Allowlist: any key outside the registry rejects the WHOLE update —
 *   nothing is written. Payload size is bounded by the allowlist size.
 * - Validation: server-authoritative per key (type, bounds, format, length).
 *   A single invalid value rejects the whole update with `fieldErrors` —
 *   a save is all-or-nothing.
 * - Atomicity: one `upsert(..., { onConflict: 'key' })` statement writes all
 *   rows, then values are re-read from the database so the response always
 *   reflects persisted state (not echoed input).
 * - Errors: raw database messages logged server-side only; clients receive
 *   static messages.
 */
export async function updateSettingsAction(
  payload: unknown
): Promise<UpdateSettingsResult> {
  try {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return { success: false, error: 'Invalid settings payload.' };
    }

    const entries = Object.entries(payload as Record<string, unknown>);

    if (entries.length === 0) {
      return { success: false, error: 'No settings provided.' };
    }
    if (entries.length > SETTING_KEYS.length) {
      return { success: false, error: 'Too many settings provided.' };
    }

    // ── Allowlist: any unknown key rejects the whole update ──
    for (const [key] of entries) {
      if (!isAllowedSettingKey(key)) {
        return { success: false, error: 'Unknown setting. No changes were applied.' };
      }
    }

    // ── Per-key validation (server-authoritative) ──
    const fieldErrors: Record<string, string> = {};
    for (const [key, value] of entries) {
      const message = validateSettingValue(key, value);
      if (message) {
        fieldErrors[key] = message;
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        fieldErrors,
        error: 'Please correct the highlighted fields.',
      };
    }

    const supabase = await createClient();

    const gate = await requireAdmin(supabase);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    // ── Atomic write: single upsert statement for all validated rows ──
    const rows: DbSystemSetting[] = entries.map(([key, value]) => ({
      key,
      value,
      description: SETTING_DEFS[key].label,
      updated_at: new Date().toISOString(),
    }));

    // NOTE: supabase-js v2.112's upsert() generic resolves to `never[]` for
    // this hand-written Database type (same repo-wide typing gap documented in
    // blocked-period.actions.ts). `rows` is typed `DbSystemSetting[]` above —
    // the real type contract — while the cast keeps lint/typecheck clean.
    const { error: upsertError } = await supabase
      .from('system_settings')
      .upsert(rows as never, { onConflict: 'key' });

    if (upsertError) {
      console.error('updateSettingsAction: upsert failed:', upsertError.message);
      return { success: false, error: UPDATE_ERROR };
    }

    // ── Re-read: response reflects persisted state, not input ──
    const reread = await readSettingsValues(supabase);
    if (!reread.ok) {
      return { success: false, error: UPDATE_ERROR };
    }

    return {
      success: true,
      values: reread.values,
      updatedKeys: entries.map(([key]) => key),
    };
  } catch (err: unknown) {
    console.error('updateSettingsAction failed:', err);
    return { success: false, error: UPDATE_ERROR };
  }
}
