import { describe, it, expect } from 'vitest';
import { calculateBookingPrice } from '@/lib/pricing';

describe('calculateBookingPrice', () => {
  it('calculates price for 1 hour', () => {
    const price = calculateBookingPrice(350, 60);
    expect(price).toBe(350);
  });

  it('calculates price for 30 minutes', () => {
    const price = calculateBookingPrice(350, 30);
    expect(price).toBe(175);
  });

  it('calculates price for 2 hours', () => {
    const price = calculateBookingPrice(350, 120);
    expect(price).toBe(700);
  });

  it('calculates price for 90 minutes', () => {
    const price = calculateBookingPrice(400, 90);
    expect(price).toBe(600);
  });

  it('returns 0 for 0 duration', () => {
    const price = calculateBookingPrice(350, 0);
    expect(price).toBe(0);
  });

  it('handles fractional results', () => {
    const price = calculateBookingPrice(100, 45);
    expect(price).toBe(75);
  });

  it('handles different price per hour', () => {
    const price = calculateBookingPrice(500, 60);
    expect(price).toBe(500);
  });
});
