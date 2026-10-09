/**
 * Timezone-matrix tests: the same assertions run under three host TZs.
 *
 * Runtime TZ mutation (process.env.TZ) is honored by Node ≥16 on all
 * platforms we target; each describe block sets it before its tests and
 * restores the original afterwards. After the C5 canonicalization, all
 * code under test derives business time from Intl('Africa/Cairo') or
 * pure string math — so results must be IDENTICAL under every host TZ.
 * A regression that reintroduces host-local Date usage will fail the
 * Cairo and New York rows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseTstzrange, parseTstzrangeStart, formatTstzrange } from '@/lib/mappers';
import { isSlotCancellable, cairoToday, cairoCurrentTime } from '@/lib/timezone';
import { generateCalendarDays } from '@/lib/dates';

const TZS = ['UTC', 'Africa/Cairo', 'America/New_York'] as const;

describe.each(TZS)('timezone matrix (host TZ=%s)', (tz) => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = tz;
  });

  afterEach(() => {
    process.env.TZ = originalTZ;
    vi.useRealTimers();
  });

  it('format→parse round-trips identically', () => {
    const cases = [
      { d: '2026-08-25', s: '10:00', e: '11:00' }, // same-day
      { d: '2026-09-21', s: '22:00', e: '00:00' }, // midnight-crossing to 00:00
      { d: '2026-08-25', s: '23:00', e: '01:00' }, // midnight-crossing past 01:00
      { d: '2026-08-25', s: '01:00', e: '02:00' }, // post-midnight session
      { d: '2026-04-24', s: '00:30', e: '01:30' }, // DST spring-forward day
      { d: '2026-10-29', s: '23:00', e: '00:00' }, // DST fall-back day
    ];
    for (const c of cases) {
      expect(parseTstzrange(formatTstzrange(c.d, c.s, c.e))).toEqual({
        date: c.d,
        startTime: c.s,
        endTime: c.e,
      });
    }
  });

  it('parses PostgREST-quoted ranges to exact wall-clock digits', () => {
    expect(parseTstzrange('["2026-09-21 22:00:00+00","2026-09-22 00:00:00+00")')).toEqual({
      date: '2026-09-21',
      startTime: '22:00',
      endTime: '00:00',
    });
  });

  it('cancellation boundaries are host-TZ independent (explicit now)', () => {
    const S = { d: '2026-12-01', t: '14:00' };
    expect(isSlotCancellable(S.d, S.t, 2, { date: '2026-12-01', time: '11:59' })).toBe(true); // >2h
    expect(isSlotCancellable(S.d, S.t, 2, { date: '2026-12-01', time: '12:00' })).toBe(false); // exactly 2h
    expect(isSlotCancellable(S.d, S.t, 2, { date: '2026-12-01', time: '12:01' })).toBe(false); // <2h
    expect(isSlotCancellable(S.d, S.t, 2, { date: '2026-12-01', time: '14:00' })).toBe(false); // at start
    expect(isSlotCancellable(S.d, S.t, 2, { date: '2026-12-01', time: '14:01' })).toBe(false); // after start
  });

  it('live cancellation check uses Cairo wall-clock under fake timers', () => {
    vi.useFakeTimers();
    // 09:00 UTC = 11:00 Cairo (UTC+2 winter): slot 14:00 is exactly 3h away → allowed
    vi.setSystemTime(new Date('2026-12-01T09:00:00Z'));
    expect(isSlotCancellable('2026-12-01', '14:00')).toBe(true);
    // 12:00 UTC = 14:00 Cairo: at start → blocked
    vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
    expect(isSlotCancellable('2026-12-01', '14:00')).toBe(false);
  });

  it('calendar generation near Cairo midnight starts on the Cairo date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-01T22:30:00Z')); // 00:30 Cairo next day
    const months = generateCalendarDays();
    expect(months[0].days[0].date).toBe('2026-12-02');
    expect(months[0].days[0].isToday).toBe(true);
  });

  it('cairo wall-clock conversion is host-TZ independent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-01T22:30:00Z'));
    expect(cairoToday()).toBe('2026-12-02');
    expect(cairoCurrentTime()).toBe('00:30');
  });

  it('server cancel-window parsing of a real stored range is host-TZ independent', () => {
    // Live-shaped row (KH-135234): 22:00 → 00:00 wall-clock
    const start = parseTstzrangeStart('["2026-09-21 22:00:00+00","2026-09-22 00:00:00+00")');
    expect(start).toEqual({ date: '2026-09-21', time: '22:00' });
  });
});
