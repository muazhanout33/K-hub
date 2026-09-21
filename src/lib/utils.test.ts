import { describe, it, expect } from 'vitest';
import { cn, to12Hour } from '@/lib/utils';

describe('cn (className merger)', () => {
  it('merges class names', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });

  it('handles conditional classes', () => {
    const result = cn('base', false && 'hidden', 'extra');
    expect(result).toContain('base');
    expect(result).toContain('extra');
    expect(result).not.toContain('hidden');
  });

  it('handles empty input', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('handles undefined and null', () => {
    const result = cn('base', undefined, null);
    expect(result).toBe('base');
  });
});

describe('to12Hour', () => {
  it('converts midnight (00:00) to 12:00 AM', () => {
    expect(to12Hour('00:00')).toBe('12:00 AM');
  });

  it('converts 01:00 to 1:00 AM', () => {
    expect(to12Hour('01:00')).toBe('1:00 AM');
  });

  it('converts 12:00 to 12:00 PM', () => {
    expect(to12Hour('12:00')).toBe('12:00 PM');
  });

  it('converts 13:00 to 1:00 PM', () => {
    expect(to12Hour('13:00')).toBe('1:00 PM');
  });

  it('converts 23:59 to 11:59 PM', () => {
    expect(to12Hour('23:59')).toBe('11:59 PM');
  });

  it('converts 09:30 to 9:30 AM', () => {
    expect(to12Hour('09:30')).toBe('9:30 AM');
  });

  it('converts 17:45 to 5:45 PM', () => {
    expect(to12Hour('17:45')).toBe('5:45 PM');
  });
});
