/**
 * Settings registry — single source of truth for every configurable system
 * setting exposed on /admin/settings.
 *
 * Design (Phase 5 decision record):
 * - Strict key allowlist: actions and UI only ever touch keys defined here.
 *   Unknown keys are rejected (never written, never read as settings).
 * - Every value is validated server-side before persistence. The registry
 *   carries the same bounds the server enforces so client feedback matches.
 * - DB settings are STORED-ONLY configuration. `enforced: false` means the
 *   current booking/payment flows do NOT yet read these values — wiring them
 *   into live enforcement would change booking behavior and needs separate
 *   approval. The UI shows this explicitly.
 * - No secrets ever live here. These are operational preferences only.
 */

export type SettingType = 'number' | 'string' | 'boolean' | 'time';

export type SettingValue = number | string | boolean;

export type SettingSectionId = 'booking' | 'club' | 'system';

export interface SettingDef {
  key: string;
  section: SettingSectionId;
  type: SettingType;
  label: string;
  description: string;
  default: SettingValue;
  /** Inclusive numeric bounds (number type only). */
  min?: number;
  max?: number;
  /** Unit hint for number settings (e.g. "hours", "minutes", "days"). */
  unit?: string;
  step?: number;
  /** Phase 5: all DB-backed settings are stored-only, not yet enforced. */
  enforced: false;
}

export interface SettingSection {
  id: SettingSectionId;
  title: string;
  description: string;
  keys: string[];
}

/** HH:MM 24-hour wall-clock time. */
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Control characters (0x00-0x1F, 0x7F) are never valid in a stored value. */
const CONTROL_CHARS_REGEX = /[\u0000-\u001f\u007f]/;

export const SETTING_DEFS: Record<string, SettingDef> = {
  'booking.cancellation_window_hours': {
    key: 'booking.cancellation_window_hours',
    section: 'booking',
    type: 'number',
    label: 'Cancellation window',
    description:
      'How many hours before the slot start time a booking can still be cancelled online. 0 disables online cancellation.',
    default: 2,
    min: 0,
    max: 168,
    unit: 'hours',
    step: 1,
    enforced: false,
  },
  'booking.hold_timer_minutes': {
    key: 'booking.hold_timer_minutes',
    section: 'booking',
    type: 'number',
    label: 'Hold timer',
    description:
      'How long a Reserved slot stays held for a customer while they complete payment before it expires.',
    default: 10,
    min: 1,
    max: 120,
    unit: 'minutes',
    step: 1,
    enforced: false,
  },
  'booking.max_advance_days': {
    key: 'booking.max_advance_days',
    section: 'booking',
    type: 'number',
    label: 'Maximum advance booking',
    description: 'How many days into the future customers may book a slot.',
    default: 30,
    min: 1,
    max: 365,
    unit: 'days',
    step: 1,
    enforced: false,
  },
  'club.name': {
    key: 'club.name',
    section: 'club',
    type: 'string',
    label: 'Club name',
    description: 'Display name used across the platform.',
    default: 'WEGO',
    max: 80,
    enforced: false,
  },
  'club.operating_hours_start': {
    key: 'club.operating_hours_start',
    section: 'club',
    type: 'time',
    label: 'Opening time',
    description: 'Daily facility opening time (Africa/Cairo local time).',
    default: '09:00',
    max: 5,
    enforced: false,
  },
  'club.operating_hours_end': {
    key: 'club.operating_hours_end',
    section: 'club',
    type: 'time',
    label: 'Closing time',
    description: 'Daily facility closing time (Africa/Cairo local time).',
    default: '23:00',
    max: 5,
    enforced: false,
  },
  'system.maintenance_mode': {
    key: 'system.maintenance_mode',
    section: 'system',
    type: 'boolean',
    label: 'Maintenance mode',
    description:
      'Preference flag indicating the platform should be placed in maintenance. Stored configuration only — it does not currently block bookings.',
    default: false,
    enforced: false,
  },
  'system.maintenance_message': {
    key: 'system.maintenance_message',
    section: 'system',
    type: 'string',
    label: 'Maintenance message',
    description: 'Message shown to customers when maintenance mode is on.',
    default: 'We are performing scheduled maintenance. Please check back shortly.',
    max: 200,
    enforced: false,
  },
};

export const SETTING_KEYS: string[] = Object.keys(SETTING_DEFS);

export const SETTING_SECTIONS: SettingSection[] = [
  {
    id: 'booking',
    title: 'Booking Rules',
    description:
      'Cancellation window, slot hold timer, and advance-booking defaults.',
    keys: [
      'booking.cancellation_window_hours',
      'booking.hold_timer_minutes',
      'booking.max_advance_days',
    ],
  },
  {
    id: 'club',
    title: 'Club & Facility Defaults',
    description: 'Club identity and daily operating hours.',
    keys: [
      'club.name',
      'club.operating_hours_start',
      'club.operating_hours_end',
    ],
  },
  {
    id: 'system',
    title: 'System Preferences',
    description: 'Platform-wide operational preferences.',
    keys: ['system.maintenance_mode', 'system.maintenance_message'],
  },
];

export function isAllowedSettingKey(key: string): key is string {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFS, key);
}

/** Full defaults map — every allowlisted key with its default value. */
export function getSettingDefaults(): Record<string, SettingValue> {
  const defaults: Record<string, SettingValue> = {};
  for (const key of SETTING_KEYS) {
    defaults[key] = SETTING_DEFS[key].default;
  }
  return defaults;
}

function validateTypedValue(def: SettingDef, value: unknown): string | null {
  switch (def.type) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 'Must be a number.';
      }
      if (!Number.isInteger(value)) {
        return 'Must be a whole number.';
      }
      if (def.min !== undefined && value < def.min) {
        return `Must be at least ${def.min}${def.unit ? ` ${def.unit}` : ''}.`;
      }
      if (def.max !== undefined && value > def.max) {
        return `Must be at most ${def.max}${def.unit ? ` ${def.unit}` : ''}.`;
      }
      return null;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        return 'Must be true or false.';
      }
      return null;
    }
    case 'time': {
      if (typeof value !== 'string' || !TIME_REGEX.test(value)) {
        return 'Must be a valid time in HH:MM format (e.g. 09:00).';
      }
      return null;
    }
    case 'string': {
      if (typeof value !== 'string') {
        return 'Must be text.';
      }
      if (CONTROL_CHARS_REGEX.test(value)) {
        return 'Contains unsupported characters.';
      }
      const length = value.trim().length;
      if (length < 1) {
        return 'Cannot be empty.';
      }
      if (def.max !== undefined && length > def.max) {
        return `Must be at most ${def.max} characters.`;
      }
      return null;
    }
    default:
      return 'Unsupported setting type.';
  }
}

/**
 * Validate a raw value for an allowlisted key.
 *
 * @returns `null` when valid, otherwise a safe user-facing error message.
 *          Unknown keys always fail — they can never be written.
 */
export function validateSettingValue(
  key: string,
  value: unknown
): string | null {
  if (!isAllowedSettingKey(key)) {
    return 'Unknown setting.';
  }
  return validateTypedValue(SETTING_DEFS[key], value);
}

/**
 * Coerce a stored (JSONB) value back into its typed representation.
 * Anything invalid or out of bounds falls back to the default — a corrupt
 * row can never break the settings page or leak bad data into the UI.
 */
export function coerceStoredValue(def: SettingDef, raw: unknown): SettingValue {
  switch (def.type) {
    case 'number': {
      const num =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string' && raw.trim() !== ''
            ? Number(raw)
            : NaN;
      return validateTypedValue(def, num) === null ? num : def.default;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return def.default;
    }
    case 'time': {
      return typeof raw === 'string' && TIME_REGEX.test(raw)
        ? raw
        : def.default;
    }
    case 'string': {
      return typeof raw === 'string' && validateTypedValue(def, raw) === null
        ? raw
        : def.default;
    }
    default:
      return def.default;
  }
}

export type ParseDraftResult =
  | { ok: true; value: SettingValue }
  | { ok: false; error: string };

/**
 * Parse a raw text input (form draft) into a validated typed value.
 * Used by the settings UI for immediate client-side feedback; the server
 * re-validates independently — this is never the security boundary.
 */
export function parseDraftValue(def: SettingDef, raw: string): ParseDraftResult {
  if (def.type === 'number') {
    if (raw.trim() === '') {
      return { ok: false, error: 'Required.' };
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return { ok: false, error: 'Must be a number.' };
    }
    const error = validateSettingValue(def.key, parsed);
    return error ? { ok: false, error } : { ok: true, value: parsed };
  }

  const error = validateSettingValue(def.key, raw);
  return error ? { ok: false, error } : { ok: true, value: raw };
}
