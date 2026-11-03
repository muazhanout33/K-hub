import { describe, it, expect } from 'vitest';
import {
  SETTING_DEFS,
  SETTING_KEYS,
  SETTING_SECTIONS,
  getSettingDefaults,
  isAllowedSettingKey,
  validateSettingValue,
  coerceStoredValue,
  parseDraftValue,
} from './settings-registry';

describe('settings registry — structure', () => {
  it('exposes only allowlisted keys', () => {
    expect(SETTING_KEYS).toEqual(Object.keys(SETTING_DEFS));
    expect(SETTING_KEYS.length).toBeGreaterThan(0);
  });

  it('has every section key present in the registry and no orphans', () => {
    const sectionKeys = SETTING_SECTIONS.flatMap((s) => s.keys);
    expect(sectionKeys.sort()).toEqual([...SETTING_KEYS].sort());
    // No key is listed in more than one section.
    expect(new Set(sectionKeys).size).toBe(sectionKeys.length);
  });

  it('every default value passes its own validation', () => {
    for (const key of SETTING_KEYS) {
      expect(validateSettingValue(key, SETTING_DEFS[key].default), key).toBeNull();
    }
  });

  it('getSettingDefaults returns a default for every key', () => {
    const defaults = getSettingDefaults();
    expect(Object.keys(defaults).sort()).toEqual([...SETTING_KEYS].sort());
  });

  it('marks all DB settings as stored-only (not enforced)', () => {
    for (const key of SETTING_KEYS) {
      expect(SETTING_DEFS[key].enforced, key).toBe(false);
    }
  });
});

describe('settings registry — allowlist', () => {
  it('accepts known keys', () => {
    expect(isAllowedSettingKey('booking.hold_timer_minutes')).toBe(true);
  });

  it('rejects unknown keys (incl. plausible secret keys)', () => {
    expect(isAllowedSettingKey('secrets.api_key')).toBe(false);
    expect(isAllowedSettingKey('booking.password')).toBe(false);
    expect(isAllowedSettingKey('')).toBe(false);
    expect(isAllowedSettingKey('__proto__')).toBe(false);
    expect(validateSettingValue('secrets.api_key', 'anything')).toBe(
      'Unknown setting.'
    );
  });
});

describe('settings registry — number validation', () => {
  it('accepts boundary values for the cancellation window (0–168)', () => {
    expect(validateSettingValue('booking.cancellation_window_hours', 0)).toBeNull();
    expect(validateSettingValue('booking.cancellation_window_hours', 168)).toBeNull();
    expect(validateSettingValue('booking.cancellation_window_hours', -1)).toBe(
      'Must be at least 0 hours.'
    );
    expect(validateSettingValue('booking.cancellation_window_hours', 169)).toBe(
      'Must be at most 168 hours.'
    );
  });

  it('accepts 1–120 for the hold timer and rejects 0 / 121', () => {
    expect(validateSettingValue('booking.hold_timer_minutes', 1)).toBeNull();
    expect(validateSettingValue('booking.hold_timer_minutes', 120)).toBeNull();
    expect(validateSettingValue('booking.hold_timer_minutes', 0)).toBe(
      'Must be at least 1 minutes.'
    );
    expect(validateSettingValue('booking.hold_timer_minutes', 121)).toBe(
      'Must be at most 120 minutes.'
    );
  });

  it('accepts 1–365 for max advance days', () => {
    expect(validateSettingValue('booking.max_advance_days', 1)).toBeNull();
    expect(validateSettingValue('booking.max_advance_days', 365)).toBeNull();
    expect(validateSettingValue('booking.max_advance_days', 0)).toBe(
      'Must be at least 1 days.'
    );
    expect(validateSettingValue('booking.max_advance_days', 366)).toBe(
      'Must be at most 365 days.'
    );
  });

  it('rejects non-numbers, NaN, Infinity, and non-integers', () => {
    expect(validateSettingValue('booking.hold_timer_minutes', '10')).toBe(
      'Must be a number.'
    );
    expect(validateSettingValue('booking.hold_timer_minutes', NaN)).toBe(
      'Must be a number.'
    );
    expect(validateSettingValue('booking.hold_timer_minutes', Infinity)).toBe(
      'Must be a number.'
    );
    expect(validateSettingValue('booking.hold_timer_minutes', 2.5)).toBe(
      'Must be a whole number.'
    );
    expect(validateSettingValue('booking.hold_timer_minutes', null)).toBe(
      'Must be a number.'
    );
  });
});

describe('settings registry — time validation', () => {
  it('accepts valid HH:MM times', () => {
    expect(validateSettingValue('club.operating_hours_start', '09:00')).toBeNull();
    expect(validateSettingValue('club.operating_hours_end', '23:59')).toBeNull();
    expect(validateSettingValue('club.operating_hours_start', '00:00')).toBeNull();
  });

  it('rejects malformed or out-of-range times', () => {
    const expected = 'Must be a valid time in HH:MM format (e.g. 09:00).';
    expect(validateSettingValue('club.operating_hours_start', '9:00')).toBe(expected);
    expect(validateSettingValue('club.operating_hours_start', '24:00')).toBe(expected);
    expect(validateSettingValue('club.operating_hours_start', '09:60')).toBe(expected);
    expect(validateSettingValue('club.operating_hours_start', '09:00:00')).toBe(expected);
    expect(validateSettingValue('club.operating_hours_start', '')).toBe(expected);
    expect(validateSettingValue('club.operating_hours_start', 900)).toBe(expected);
    expect(
      validateSettingValue('club.operating_hours_end', 'ab:cd')
    ).toBe(expected);
  });
});

describe('settings registry — boolean validation', () => {
  it('accepts only real booleans', () => {
    expect(validateSettingValue('system.maintenance_mode', true)).toBeNull();
    expect(validateSettingValue('system.maintenance_mode', false)).toBeNull();
    expect(validateSettingValue('system.maintenance_mode', 'true')).toBe(
      'Must be true or false.'
    );
    expect(validateSettingValue('system.maintenance_mode', 1)).toBe(
      'Must be true or false.'
    );
    expect(validateSettingValue('system.maintenance_mode', null)).toBe(
      'Must be true or false.'
    );
  });
});

describe('settings registry — string validation', () => {
  it('accepts normal names within bounds', () => {
    expect(validateSettingValue('club.name', 'WEGO')).toBeNull();
    expect(validateSettingValue('club.name', 'A'.repeat(80))).toBeNull();
  });

  it('rejects empty, whitespace-only, and oversized strings', () => {
    expect(validateSettingValue('club.name', '')).toBe('Cannot be empty.');
    expect(validateSettingValue('club.name', '   ')).toBe('Cannot be empty.');
    expect(validateSettingValue('club.name', 'A'.repeat(81))).toBe(
      'Must be at most 80 characters.'
    );
    expect(validateSettingValue('system.maintenance_message', 'B'.repeat(201))).toBe(
      'Must be at most 200 characters.'
    );
    expect(validateSettingValue('system.maintenance_message', 'B'.repeat(200))).toBeNull();
    expect(validateSettingValue('club.name', 42)).toBe('Must be text.');
  });

  it('rejects control characters', () => {
    expect(
      validateSettingValue('club.name', 'K\u0007HUB')
    ).toBe('Contains unsupported characters.');
    expect(
      validateSettingValue('system.maintenance_message', 'line\u000abreak')
    ).toBe('Contains unsupported characters.');
  });
});

describe('settings registry — coerceStoredValue', () => {
  it('returns the stored value when valid', () => {
    expect(
      coerceStoredValue(SETTING_DEFS['booking.hold_timer_minutes'], 15)
    ).toBe(15);
    expect(coerceStoredValue(SETTING_DEFS['club.name'], 'WEGO')).toBe('WEGO');
    expect(coerceStoredValue(SETTING_DEFS['system.maintenance_mode'], true)).toBe(true);
    expect(coerceStoredValue(SETTING_DEFS['club.operating_hours_start'], '09:00')).toBe(
      '09:00'
    );
  });

  it('coerces numeric strings that are valid', () => {
    expect(
      coerceStoredValue(SETTING_DEFS['booking.hold_timer_minutes'], '15')
    ).toBe(15);
  });

  it('falls back to the default for corrupt / out-of-range values', () => {
    const def = SETTING_DEFS['booking.hold_timer_minutes'];
    expect(coerceStoredValue(def, -5)).toBe(10);
    expect(coerceStoredValue(def, 9999)).toBe(10);
    expect(coerceStoredValue(def, 'abc')).toBe(10);
    expect(coerceStoredValue(def, null)).toBe(10);
    expect(coerceStoredValue(SETTING_DEFS['club.name'], 123)).toBe('WEGO');
    expect(coerceStoredValue(SETTING_DEFS['club.name'], '')).toBe('WEGO');
    expect(
      coerceStoredValue(SETTING_DEFS['club.operating_hours_end'], '25:00')
    ).toBe('23:00');
    expect(
      coerceStoredValue(SETTING_DEFS['system.maintenance_mode'], 'yes')
    ).toBe(false);
  });

  it('coerces boolean strings but rejects other junk', () => {
    const def = SETTING_DEFS['system.maintenance_mode'];
    expect(coerceStoredValue(def, 'true')).toBe(true);
    expect(coerceStoredValue(def, 'false')).toBe(false);
    expect(coerceStoredValue(def, 'TRUE')).toBe(false);
  });
});

describe('settings registry — parseDraftValue', () => {
  it('parses valid number drafts', () => {
    const def = SETTING_DEFS['booking.hold_timer_minutes'];
    expect(parseDraftValue(def, '15')).toEqual({ ok: true, value: 15 });
    expect(parseDraftValue(def, ' 120 ')).toEqual({ ok: true, value: 120 });
  });

  it('rejects empty, non-numeric, fractional, and out-of-range drafts', () => {
    const def = SETTING_DEFS['booking.hold_timer_minutes'];
    expect(parseDraftValue(def, '')).toEqual({ ok: false, error: 'Required.' });
    expect(parseDraftValue(def, 'abc')).toEqual({
      ok: false,
      error: 'Must be a number.',
    });
    expect(parseDraftValue(def, '2.5')).toEqual({
      ok: false,
      error: 'Must be a whole number.',
    });
    expect(parseDraftValue(def, '0')).toEqual({
      ok: false,
      error: 'Must be at least 1 minutes.',
    });
    expect(parseDraftValue(def, '121')).toEqual({
      ok: false,
      error: 'Must be at most 120 minutes.',
    });
  });

  it('parses time and string drafts', () => {
    expect(
      parseDraftValue(SETTING_DEFS['club.operating_hours_start'], '07:30')
    ).toEqual({ ok: true, value: '07:30' });
    expect(
      parseDraftValue(SETTING_DEFS['club.operating_hours_start'], '7:30')
    ).toMatchObject({ ok: false });
    expect(parseDraftValue(SETTING_DEFS['club.name'], '')).toEqual({
      ok: false,
      error: 'Cannot be empty.',
    });
    expect(parseDraftValue(SETTING_DEFS['club.name'], 'Sky Club')).toEqual({
      ok: true,
      value: 'Sky Club',
    });
  });
});
